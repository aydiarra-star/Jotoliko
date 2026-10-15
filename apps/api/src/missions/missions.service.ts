import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  assertAcceptableGpsTimestamp,
  assertAllowed,
  assertCanActOnMission,
  assertCollectAmount,
  assertDeliveryClosable,
  assertIdempotencyKey,
  assertPaymentAllowed,
  assertRemittanceAmount,
  assertTransition,
  gpsTruthFromAge,
  isMissionStatus,
  isTruthStatus,
  normalizeMoneyState,
  operationScope,
  type AppRole,
  type Mission,
  type MissionStatus,
  type TruthStatus,
} from "../../../../lib/jotoliko-os/core";
import { PrismaService } from "../prisma.service";
import type { AuthContext } from "../auth/auth.types";
import type { CollectPaymentDto } from "./dto/collect-payment.dto";
import type { ListMissionsDto } from "./dto/list-missions.dto";
import type { RecordGpsDto } from "./dto/record-gps.dto";
import type { RemitCashDto } from "./dto/remit-cash.dto";
import type { TransitionDto } from "./dto/transition.dto";

/** Ligne de mission telle que lue en base. */
type MissionRow = {
  id: string;
  companyId: string;
  reference: string;
  clientName: string;
  phone: string | null;
  status: string;
  assignedUserId: string | null;
  proofId: string | null;
  gpsTruth: string;
  expectedAmount: number;
  collectedAmount: number;
  remittedAmount: number;
  updatedAt: Date;
};

/** Projection publique : l'API ne renvoie pas les colonnes internes inutiles. */
export type MissionView = {
  id: string;
  reference: string;
  clientName: string;
  phone: string | null;
  status: MissionStatus;
  assignedUserId: string | null;
  proofId: string | null;
  proofRequired: boolean;
  money: ReturnType<typeof normalizeMoneyState>;
  gps: { truth: TruthStatus; at: string | null; latitude: number | null; longitude: number | null };
  updatedAt: string;
};

const MISSION_COLUMNS = `
  id, "companyId", reference, "clientName", phone, status, "assignedUserId", "proofId",
  "gpsTruth", "expectedAmount", "collectedAmount", "remittedAmount", "updatedAt",
  latitude, longitude, "gpsAt"
`;

@Injectable()
export class MissionsService {
  private readonly logger = new Logger(MissionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Lectures
  // -------------------------------------------------------------------------

  async list(auth: AuthContext, query: ListMissionsDto): Promise<{ items: MissionView[]; nextCursor: string | null }> {
    if (!["OWNER", "ADMIN", "MANAGER", "DRIVER", "SELLER", "VIEWER"].includes(auth.role)) {
      throw new ForbiddenException();
    }

    const take = query.take ?? 25;
    const conditions: string[] = [`"companyId" = $1`];
    const params: unknown[] = [auth.companyId];

    // Un livreur ne voit que SES missions. Le filtre est appliqué côté serveur :
    // masquer l'entrée dans l'interface ne protège rien.
    if (auth.role === "DRIVER") {
      params.push(auth.userId);
      conditions.push(`"assignedUserId" = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      conditions.push(`status = $${params.length}::"MissionStatus"`);
    }
    if (query.search) {
      params.push(`%${query.search.replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
      conditions.push(`("reference" ILIKE $${params.length} OR "clientName" ILIKE $${params.length})`);
    }
    // Curseur (updatedAt, id) : stable même si des lignes sont insérées.
    if (query.cursor) {
      const decoded = decodeCursor(query.cursor);
      if (!decoded) throw new BadRequestException("Curseur invalide");
      params.push(decoded.updatedAt, decoded.id);
      conditions.push(`("updatedAt", id) < ($${params.length - 1}::timestamptz, $${params.length}::text)`);
    }

    params.push(take + 1);
    const rows = await this.prisma.$queryRaw<MissionRow[]>(
      `SELECT ${MISSION_COLUMNS} FROM missions
        WHERE ${conditions.join(" AND ")}
        ORDER BY "updatedAt" DESC, id DESC
        LIMIT $${params.length}`,
      ...params
    );

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map((row) => this.toView(row)),
      nextCursor: hasMore && last ? encodeCursor(last.updatedAt, last.id) : null,
    };
  }

  async get(auth: AuthContext, id: string): Promise<MissionView> {
    const mission = await this.requireMission(auth, id);
    return this.toView(mission);
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  async transition(
    auth: AuthContext,
    id: string,
    dto: TransitionDto,
    requestId?: string
  ): Promise<MissionView> {
    assertAllowed(auth.role, "transitionMission");
    const current = await this.requireMission(auth, id);
    assertCanActOnMission(auth.role, auth.userId, current.assignedUserId);

    const from = this.statusOf(current);
    const to = dto.to;

    // La cible est déjà validée par le DTO ; on revérifie ici pour que la règle
    // tienne même si le service est appelé autrement que par HTTP.
    try {
      assertTransition(from, to);
    } catch (error) {
      throw new ConflictException((error as Error).message);
    }

    if (to === "LIVREE") {
      try {
        assertDeliveryClosable(this.toDomain(current, dto.proofId ?? current.proofId ?? undefined));
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
    }
    if ((to === "ECHEC" || to === "REPROGRAMMEE") && !dto.reason?.trim()) {
      throw new BadRequestException("Un motif est requis pour un échec ou une reprogrammation");
    }

    const recordedAt = this.parseRecordedAt(dto.recordedAt);

    await this.prisma.$transaction(async (tx) => {
      // Mise à jour conditionnelle : la transition ne s'applique que si le
      // statut n'a pas changé depuis la lecture. Deux transitions concurrentes
      // ne peuvent donc pas se chevaucher.
      const affected = await tx.$executeRaw`
        UPDATE missions
           SET status = ${to}::"MissionStatus",
               "proofId" = COALESCE(${dto.proofId ?? null}, "proofId"),
               "recordedAt" = COALESCE(${recordedAt}, "recordedAt"),
               "syncedAt" = NOW(),
               "updatedAt" = NOW()
         WHERE id = ${id}
           AND "companyId" = ${auth.companyId}
           AND status = ${from}::"MissionStatus"`;

      if (affected !== 1) {
        throw new ConflictException("La mission a changé d'état entre-temps ; recharger et réessayer");
      }

      await tx.auditLog.create({
        data: {
          companyId: auth.companyId,
          userId: auth.userId,
          action: "MISSION_TRANSITION",
          entityType: "Mission",
          entityId: id,
          before: { status: from },
          after: { status: to, proofId: dto.proofId ?? null, reason: dto.reason ?? null },
          source: "API",
          requestId: requestId ?? null,
        },
      });
    });

    this.logger.log(`Mission ${id} : ${from} → ${to} (${auth.role})`);
    return this.get(auth, id);
  }

  /**
   * Encaissement d'un règlement client.
   *
   * Trois protections se recouvrent :
   *   1. le statut doit être LIVREE ;
   *   2. le montant ne peut pas dépasser le reste dû (comparaison faite en base) ;
   *   3. la clé d'idempotence rend la répétition inopérante.
   */
  async collect(auth: AuthContext, id: string, dto: CollectPaymentDto, key: string | undefined, requestId?: string) {
    assertAllowed(auth.role, "collectPayment");
    this.requireKey(key);
    const current = await this.requireMission(auth, id);
    assertCanActOnMission(auth.role, auth.userId, current.assignedUserId);

    const operation = operationScope("PAYMENT", id);
    const requestHash = hashRequest({ id, collected: dto.collected });

    return this.idempotent(auth, operation, key!, requestHash, async (tx) => {
      const before = await this.lockMission(tx, auth.companyId, id);
      if (!before) throw new NotFoundException();

      try {
        assertPaymentAllowed(this.toDomain(before));
        assertCollectAmount(this.toDomain(before), dto.collected);
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }

      // Comparaison faite par la base : même si une autre requête encaisse en
      // parallèle, la somme reste bornée par expectedAmount.
      const affected = await tx.$executeRaw`
        UPDATE missions
           SET "collectedAmount" = "collectedAmount" + ${dto.collected},
               "updatedAt" = NOW()
         WHERE id = ${id}
           AND "companyId" = ${auth.companyId}
           AND status = 'LIVREE'::"MissionStatus"
           AND "collectedAmount" + ${dto.collected} <= "expectedAmount"`;

      if (affected !== 1) {
        throw new ConflictException("Le montant disponible a changé ; recharger et réessayer");
      }

      const movement = await tx.cashMovement.create({
        data: {
          companyId: auth.companyId,
          missionId: id,
          driverId: before.assignedUserId,
          type: "ENCAISSEMENT",
          amount: dto.collected,
          actorUserId: auth.userId,
          idempotencyKey: key!,
          requestHash,
          recordedAt: this.parseRecordedAt(dto.recordedAt),
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: auth.companyId,
          userId: auth.userId,
          action: "PAYMENT_COLLECTED",
          entityType: "Mission",
          entityId: id,
          before: { collectedAmount: before.collectedAmount },
          after: { collectedAmount: before.collectedAmount + dto.collected, movementId: movement.id },
          source: "API",
          requestId: requestId ?? null,
        },
      });

      return { movementId: movement.id };
    }).then(() => this.get(auth, id));
  }

  /** Remise de caisse. Interdite au rôle DRIVER (voir la matrice de permissions). */
  async remit(auth: AuthContext, id: string, dto: RemitCashDto, key: string | undefined, requestId?: string) {
    assertAllowed(auth.role, "remitCash");
    this.requireKey(key);
    const current = await this.requireMission(auth, id);

    const operation = operationScope("REMITTANCE", id);
    const requestHash = hashRequest({ id, amount: dto.amount });

    return this.idempotent(auth, operation, key!, requestHash, async (tx) => {
      const before = await this.lockMission(tx, auth.companyId, id);
      if (!before) throw new NotFoundException();

      try {
        assertRemittanceAmount(this.toDomain(before), dto.amount);
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }

      const affected = await tx.$executeRaw`
        UPDATE missions
           SET "remittedAmount" = "remittedAmount" + ${dto.amount},
               "updatedAt" = NOW()
         WHERE id = ${id}
           AND "companyId" = ${auth.companyId}
           AND "remittedAmount" + ${dto.amount} <= "collectedAmount"`;

      if (affected !== 1) {
        throw new ConflictException("Le montant remis dépasse les espèces détenues ; recharger et réessayer");
      }

      const movement = await tx.cashMovement.create({
        data: {
          companyId: auth.companyId,
          missionId: id,
          driverId: before.assignedUserId,
          type: "REMISE",
          amount: dto.amount,
          actorUserId: auth.userId,
          idempotencyKey: key!,
          requestHash,
          recordedAt: this.parseRecordedAt(dto.recordedAt),
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: auth.companyId,
          userId: auth.userId,
          action: "REMITTANCE_RECORDED",
          entityType: "Mission",
          entityId: id,
          before: { remittedAmount: before.remittedAmount },
          after: { remittedAmount: before.remittedAmount + dto.amount, movementId: movement.id },
          source: "API",
          requestId: requestId ?? null,
        },
      });

      return { movementId: movement.id };
    }).then(() => this.get(auth, id));
  }

  /**
   * Déclaration d'une position GPS. La fraîcheur est calculée par rapport à
   * l'horodatage de mesure, pas à l'heure d'arrivée : une position ancienne
   * envoyée tardivement n'est jamais présentée comme actuelle.
   */
  async recordGps(auth: AuthContext, id: string, dto: RecordGpsDto, requestId?: string): Promise<MissionView> {
    assertAllowed(auth.role, "recordGps");
    const current = await this.requireMission(auth, id);
    assertCanActOnMission(auth.role, auth.userId, current.assignedUserId);

    const now = new Date();
    const measuredAt = dto.recordedAt ? new Date(dto.recordedAt) : now;
    try {
      assertAcceptableGpsTimestamp(measuredAt, now);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    const ageSeconds = Math.max(0, (now.getTime() - measuredAt.getTime()) / 1000);
    const truth: TruthStatus = gpsTruthFromAge(ageSeconds);

    await this.prisma.$transaction(async (tx) => {
      await tx.mission.updateMany({
        where: { id, companyId: auth.companyId },
        data: {
          latitude: dto.latitude,
          longitude: dto.longitude,
          gpsAt: measuredAt,
          gpsTruth: truth,
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: auth.companyId,
          userId: auth.userId,
          action: "GPS_RECORDED",
          entityType: "Mission",
          entityId: id,
          before: { gpsTruth: current.gpsTruth },
          after: { latitude: dto.latitude, longitude: dto.longitude, gpsTruth: truth },
          source: "API",
          requestId: requestId ?? null,
        },
      });
    });

    return this.get(auth, id);
  }

  // -------------------------------------------------------------------------
  // Internes
  // -------------------------------------------------------------------------

  /**
   * Exécute une mutation financière de façon idempotente et transactionnelle.
   *
   * La clé est écrite dans la même transaction que l'effet métier : si la
   * transaction échoue, la clé disparaît aussi, et un nouvel essai reste
   * possible. Inversement, une clé déjà présente court-circuite l'effet.
   */
  private async idempotent<T>(
    auth: AuthContext,
    operation: string,
    key: string,
    requestHash: string,
    run: (tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0]) => Promise<T>
  ): Promise<T> {
    const previous = await this.prisma.mutationKey.findFirst({
      where: { companyId: auth.companyId, operation, idempotencyKey: key },
    });

    if (previous) {
      // Même clé mais contenu différent : rejouer renverrait un résultat qui ne
      // correspond pas à la demande. On refuse plutôt que de tromper l'appelant.
      if (previous.requestHash !== requestHash) {
        throw new ConflictException(
          "Cette clé d'idempotence a déjà été utilisée pour une opération différente"
        );
      }
      this.logger.log(`Rejeu idempotent ignoré pour ${operation} (clé ${key})`);
      return JSON.parse(previous.resultJson) as T;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const result = await run(tx);
        await tx.mutationKey.create({
          data: {
            companyId: auth.companyId,
            operation,
            idempotencyKey: key,
            requestHash,
            resultJson: JSON.stringify(result),
          },
        });
        return result;
      });
    } catch (error) {
      // Course perdue : une autre requête a inséré la même clé en parallèle.
      // Ce n'est pas une erreur pour l'appelant, c'est exactement ce que
      // l'idempotence doit absorber.
      if (isUniqueViolation(error)) {
        const stored = await this.prisma.mutationKey.findFirst({
          where: { companyId: auth.companyId, operation, idempotencyKey: key },
        });
        if (stored && stored.requestHash === requestHash) {
          return JSON.parse(stored.resultJson) as T;
        }
      }
      throw error;
    }
  }

  /** Verrouille la ligne de mission pour la durée de la transaction. */
  private async lockMission(
    tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    companyId: string,
    id: string
  ): Promise<MissionRow | null> {
    const rows = await tx.$queryRaw<MissionRow[]>`
      SELECT ${MISSION_COLUMNS} FROM missions
       WHERE id = ${id} AND "companyId" = ${companyId}
       FOR UPDATE`;
    return rows[0] ?? null;
  }

  private async requireMission(auth: AuthContext, id: string): Promise<MissionRow> {
    const rows = await this.prisma.$queryRaw<MissionRow[]>`
      SELECT ${MISSION_COLUMNS} FROM missions
       WHERE id = ${id} AND "companyId" = ${auth.companyId}`;
    const mission = rows[0];
    // 404 plutôt que 403 : ne révèle pas l'existence d'une ressource d'un autre
    // tenant (politique de non-fuite documentée dans docs/SECURITY-MODEL.md).
    if (!mission) throw new NotFoundException();
    return mission;
  }

  private statusOf(row: MissionRow): MissionStatus {
    if (!isMissionStatus(row.status)) {
      throw new Error(`Statut de mission inconnu en base : ${row.status}`);
    }
    return row.status;
  }

  private toDomain(row: MissionRow, proofId?: string): Mission {
    const truth = isTruthStatus(row.gpsTruth) ? row.gpsTruth : "INDISPONIBLE";
    return {
      id: row.id,
      orderId: row.reference,
      clientName: row.clientName,
      address: {},
      status: this.statusOf(row),
      // La politique de preuve est portée par les réglages de l'entreprise ;
      // à défaut la preuve est exigée, ce qui est le comportement le plus sûr.
      proofRequired: true,
      proofId: proofId ?? row.proofId ?? undefined,
      money: normalizeMoneyState(row.expectedAmount, row.collectedAmount, row.remittedAmount),
      gpsTruth: truth,
      syncStatus: "SYNCHRONISE",
    };
  }

  private toView(row: MissionRow): MissionView {
    const truth: TruthStatus = isTruthStatus(row.gpsTruth) ? row.gpsTruth : "INDISPONIBLE";
    return {
      id: row.id,
      reference: row.reference,
      clientName: row.clientName,
      phone: row.phone,
      status: this.statusOf(row),
      assignedUserId: row.assignedUserId,
      proofId: row.proofId,
      proofRequired: true,
      money: normalizeMoneyState(row.expectedAmount, row.collectedAmount, row.remittedAmount),
      gps: {
        truth,
        at: row.updatedAt ? null : null,
        latitude: null,
        longitude: null,
      },
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private requireKey(key: string | undefined): void {
    try {
      assertIdempotencyKey(key);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  private parseRecordedAt(value?: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException("Horodatage terrain invalide");
    return date;
  }
}

function hashRequest(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function encodeCursor(updatedAt: Date, id: string): string {
  return Buffer.from(`${updatedAt.toISOString()}|${id}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { updatedAt: string; id: string } | null {
  try {
    const [updatedAt, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (!updatedAt || !id) return null;
    if (Number.isNaN(new Date(updatedAt).getTime())) return null;
    return { updatedAt, id };
  } catch {
    return null;
  }
}

export type { AppRole };
