import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import type { ReadStream } from "node:fs";
import { assertCanActOnMission, isAllowed, type AppRole, type Permission } from "../../../../lib/jotoliko-os/core";
import type { AuthContext } from "../auth/auth.types";
import { PrismaService } from "../prisma.service";
import type { UploadProofDto } from "./dto/upload-proof.dto";
import {
  MAX_PROOF_BYTES,
  PROOF_MIME_EXTENSIONS,
  ProofStorage,
  detectMimeType,
  isAllowedMimeType,
  sha256Hex,
} from "./proof-storage";

/** Projection publique d'une preuve : jamais le contenu, jamais la clé interne. */
export type ProofView = {
  id: string;
  missionId: string;
  type: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  recipientName: string | null;
  note: string | null;
  recordedAt: string | null;
  createdAt: string;
  downloadedBy: string;
};

type ProofRow = {
  id: string;
  companyId: string;
  missionId: string;
  type: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  recipientName: string | null;
  note: string | null;
  recordedAt: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
};

@Injectable()
export class ProofsService {
  private readonly logger = new Logger(ProofsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ProofStorage
  ) {}

  // -------------------------------------------------------------------------
  // Dépôt
  // -------------------------------------------------------------------------

  /**
   * Dépose une preuve pour une mission.
   *
   * L'ordre des opérations est délibéré : le fichier est écrit **avant** la
   * ligne en base. Une interruption laisse au pire un fichier orphelin
   * (récupérable par une tâche de réconciliation), jamais une preuve annoncée
   * sans contenu — exactement le défaut que ce module doit éliminer.
   */
  async upload(
    auth: AuthContext,
    missionId: string,
    dto: UploadProofDto,
    requestId?: string
  ): Promise<{ proof: ProofView; replayed: boolean }> {
    this.assertPermission(auth.role, "uploadProof");
    const mission = await this.requireMission(auth, missionId);
    this.assertMissionWritable(auth, mission.assignedUserId);

    if (!isAllowedMimeType(dto.mimeType)) {
      throw new UnsupportedMediaTypeException(
        `Type de preuve non accepté (attendu : ${Object.keys(PROOF_MIME_EXTENSIONS).join(", ")})`
      );
    }

    const content = this.decode(dto.dataBase64);
    if (content.length === 0) throw new BadRequestException("Preuve vide");
    if (content.length > MAX_PROOF_BYTES) {
      throw new PayloadTooLargeException(`Preuve trop lourde (maximum ${MAX_PROOF_BYTES} octets)`);
    }

    // Le type déclaré doit correspondre au contenu réel : un exécutable renommé
    // en `.jpg` est refusé.
    const detected = detectMimeType(content);
    if (detected !== dto.mimeType) {
      throw new UnsupportedMediaTypeException(
        `Le contenu ne correspond pas au type déclaré (${dto.mimeType})`
      );
    }

    const sha256 = sha256Hex(content);

    // Doublon hors ligne : le client rejoue son dépôt avec le même identifiant.
    if (dto.clientId) {
      const existing = await this.findByClientId(auth.companyId, dto.clientId);
      if (existing) return { proof: this.toView(existing), replayed: true };
    }

    // Même contenu, même mission : c'est la même preuve, on ne stocke pas deux
    // fois. Seul le lien vers la mission est créé si nécessaire.
    const identical = await this.findByContent(auth.companyId, missionId, sha256);
    if (identical) return { proof: this.toView(identical), replayed: true };

    const storageKey = ProofStorage.keyFor(auth.companyId, missionId, sha256, dto.mimeType);
    await this.storage.save(storageKey, content);

    try {
      const created = await this.prisma.proofFile.create({
        data: {
          companyId: auth.companyId,
          missionId,
          type: dto.type ?? "PHOTO",
          mimeType: dto.mimeType,
          sizeBytes: content.length,
          sha256,
          storageKey,
          uploadedByUserId: auth.userId,
          recipientName: dto.recipientName ?? null,
          note: dto.note ?? null,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          clientId: dto.clientId ?? null,
          recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : null,
        },
      });

      await this.prisma.auditLog.create({
        data: {
          companyId: auth.companyId,
          userId: auth.userId,
          action: "PROOF_UPLOADED",
          entityType: "ProofFile",
          entityId: created.id,
          before: {},
          after: {
            missionId,
            mimeType: dto.mimeType,
            sizeBytes: content.length,
            sha256,
            type: dto.type ?? "PHOTO",
          },
          source: "API",
          requestId: requestId ?? null,
        },
      });

      return { proof: this.toView(created as ProofRow), replayed: false };
    } catch (error) {
      // Course perdue avec un dépôt concurrent du même contenu : la ressource
      // existe déjà, ce n'est pas une erreur pour l'appelant.
      if (isUniqueViolation(error)) {
        const stored =
          (dto.clientId ? await this.findByClientId(auth.companyId, dto.clientId) : null) ??
          (await this.findByContent(auth.companyId, missionId, sha256));
        if (stored) return { proof: this.toView(stored), replayed: true };
      }
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Lecture
  // -------------------------------------------------------------------------

  async list(auth: AuthContext, missionId: string): Promise<ProofView[]> {
    this.assertPermission(auth.role, "readProof");
    const mission = await this.requireMission(auth, missionId);
    this.assertMissionReadable(auth, mission.assignedUserId);

    const rows = await this.prisma.proofFile.findMany({
      where: { companyId: auth.companyId, missionId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    return (rows as ProofRow[]).map((row) => this.toView(row));
  }

  /** Téléchargement : les octets ne sortent qu'après contrôle du périmètre. */
  async download(
    auth: AuthContext,
    missionId: string,
    proofId: string
  ): Promise<{ proof: ProofView; stream: ReadStream; size: number }> {
    this.assertPermission(auth.role, "readProof");
    const mission = await this.requireMission(auth, missionId);
    this.assertMissionReadable(auth, mission.assignedUserId);

    const proof = await this.requireProof(auth.companyId, missionId, proofId);
    const opened = await this.storage.open(proof.storageKey);
    if (!opened) {
      // La ligne existe, le fichier non : incident d'exploitation signalé
      // explicitement. Servir une réponse vide ferait croire à une preuve
      // illisible plutôt qu'à une preuve absente.
      this.logger.error(`Preuve ${proof.id} absente du stockage (clé ${proof.storageKey})`);
      throw new GoneException("Cette preuve est référencée mais absente du stockage");
    }
    return { proof: this.toView(proof), stream: opened.stream, size: opened.size };
  }

  // -------------------------------------------------------------------------
  // Suppression logique
  // -------------------------------------------------------------------------

  async remove(auth: AuthContext, missionId: string, proofId: string, requestId?: string): Promise<ProofView> {
    this.assertPermission(auth.role, "deleteProof");
    const mission = await this.requireMission(auth, missionId);
    this.assertMissionWritable(auth, mission.assignedUserId);

    const proof = await this.requireProof(auth.companyId, missionId, proofId);
    await this.prisma.proofFile.update({
      where: { id: proof.id },
      data: { deletedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: {
        companyId: auth.companyId,
        userId: auth.userId,
        action: "PROOF_DELETED",
        entityType: "ProofFile",
        entityId: proof.id,
        before: { deletedAt: null },
        after: { deletedAt: new Date().toISOString(), sha256: proof.sha256 },
        source: "API",
        requestId: requestId ?? null,
      },
    });
    // Le fichier reste sur le disque : la suppression est logique, la purge
    // physique relève d'une procédure d'exploitation (rétention documentée).
    return this.toView({ ...proof, deletedAt: new Date() });
  }

  // -------------------------------------------------------------------------
  // Internes
  // -------------------------------------------------------------------------

  /** Décodage strict : base64 uniquement, jamais une chaîne approximative. */
  private decode(dataBase64: string): Buffer {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64)) {
      throw new BadRequestException("Contenu de preuve non encodé en base64");
    }
    return Buffer.from(dataBase64, "base64");
  }

  private assertPermission(role: AppRole, permission: Permission): void {
    if (!isAllowed(role, permission)) {
      throw new ForbiddenException(`Rôle ${role} non autorisé pour ${permission}`);
    }
  }

  /** Périmètre d'écriture : un livreur n'agit que sur ses propres missions. */
  private assertMissionWritable(auth: AuthContext, assignedUserId: string | null): void {
    try {
      assertCanActOnMission(auth.role, auth.userId, assignedUserId);
    } catch {
      throw new ForbiddenException("Mission hors du périmètre de cet utilisateur");
    }
  }

  /**
   * Périmètre de lecture : un livreur ne lit que ses missions, un rôle de
   * bureau lit celles de son entreprise (le droit `readProof` a déjà été
   * vérifié par le garde).
   */
  private assertMissionReadable(auth: AuthContext, assignedUserId: string | null): void {
    if (auth.role !== "DRIVER") return;
    if (assignedUserId !== auth.userId) {
      throw new ForbiddenException("Mission hors du périmètre de cet utilisateur");
    }
  }

  private async requireMission(
    auth: AuthContext,
    missionId: string
  ): Promise<{ id: string; assignedUserId: string | null }> {
    const mission = await this.prisma.mission.findFirst({
      where: { id: missionId, companyId: auth.companyId },
      select: { id: true, assignedUserId: true },
    });
    // 404 et non 403 : l'existence d'une mission d'une autre entreprise n'est
    // pas divulguée.
    if (!mission) throw new NotFoundException();
    return mission as { id: string; assignedUserId: string | null };
  }

  private async requireProof(companyId: string, missionId: string, proofId: string): Promise<ProofRow> {
    const proof = await this.prisma.proofFile.findFirst({
      where: { id: proofId, companyId, missionId, deletedAt: null },
    });
    if (!proof) throw new NotFoundException();
    return proof as ProofRow;
  }

  private async findByClientId(companyId: string, clientId: string): Promise<ProofRow | null> {
    const proof = await this.prisma.proofFile.findFirst({
      where: { companyId, clientId, deletedAt: null },
    });
    return (proof as ProofRow | null) ?? null;
  }

  private async findByContent(companyId: string, missionId: string, sha256: string): Promise<ProofRow | null> {
    const proof = await this.prisma.proofFile.findFirst({
      where: { companyId, missionId, sha256, deletedAt: null },
    });
    return (proof as ProofRow | null) ?? null;
  }

  private toView(row: ProofRow): ProofView {
    return {
      id: row.id,
      missionId: row.missionId,
      type: row.type,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
      recipientName: row.recipientName,
      note: row.note,
      recordedAt: row.recordedAt ? row.recordedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      // Le contenu n'est jamais exposé en ligne : seule la route de
      // téléchargement le sert, après contrôle du périmètre.
      downloadedBy: `/missions/${row.missionId}/proofs/${row.id}`,
    };
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}
