import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { MissionStatus, TruthStatus } from "@prisma/client";
import { assertDeliveryClosable, assertPaymentAllowed, assertTransition, gpsTruthFromAge } from "../../../lib/jotoliko-os/core";
import { PrismaService } from "../prisma.service";
import { AuthContext } from "../auth/auth.types";

const statusMap: Record<string, MissionStatus> = {
  A_AFFECTER: "A_AFFECTER", AFFECTEE: "AFFECTEE", EN_ROUTE: "EN_ROUTE", ARRIVE: "ARRIVE", LIVREE: "LIVREE",
  ECHEC: "ECHEC", REPROGRAMMEE: "REPROGRAMMEE", RETOUR: "RETOUR",
};

@Injectable()
export class MissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string) {
    return this.prisma.mission.findMany({ where: { companyId }, orderBy: { updatedAt: "desc" }, take: 200 });
  }

  async get(companyId: string, id: string) {
    const mission = await this.prisma.mission.findFirst({ where: { id, companyId } });
    if (!mission) throw new NotFoundException();
    return mission;
  }

  async transition(auth: AuthContext, id: string, target?: string, proofId?: string) {
    if (!target || !statusMap[target]) throw new BadRequestException("Statut invalide");
    const mission = await this.get(auth.companyId, id);
    const from = statusMap[mission.status];
    const to = statusMap[target];
    if (to === "LIVREE") {
      assertDeliveryClosable({
        id: mission.id, orderId: mission.reference, clientName: mission.clientName,
        address: {}, status: from, proofRequired: true, proofId: proofId ?? undefined,
        money: { expected: mission.expectedAmount, collected: mission.collectedAmount, remitted: mission.remittedAmount, difference: mission.expectedAmount - mission.remittedAmount },
        gpsTruth: mission.gpsTruth, syncStatus: "SYNCHRONISE",
      });
    }
    try { assertTransition(from, to); } catch (e) { throw new BadRequestException((e as Error).message); }
    const updated = await this.prisma.mission.update({ where: { id: mission.id }, data: { status: to, ...(proofId ? { proofId } : {}) } });
    await this.audit(auth, "MISSION_TRANSITION", mission.id, from, to);
    return updated;
  }

  async collect(auth: AuthContext, id: string, collected?: number) {
    if (typeof collected !== "number" || !Number.isFinite(collected) || collected < 0) throw new BadRequestException("Montant invalide");
    const mission = await this.get(auth.companyId, id);
    try {
      assertPaymentAllowed({
        id: mission.id, orderId: mission.reference, clientName: mission.clientName, address: {}, status: mission.status,
        proofRequired: true, proofId: mission.proofId ?? undefined,
        money: { expected: mission.expectedAmount, collected: mission.collectedAmount, remitted: mission.remittedAmount, difference: 0 },
        gpsTruth: mission.gpsTruth, syncStatus: "SYNCHRONISE",
      });
    } catch (e) { throw new BadRequestException((e as Error).message); }
    const updated = await this.prisma.mission.update({ where: { id: mission.id }, data: { collectedAmount: { increment: collected } } });
    await this.audit(auth, "PAYMENT_COLLECTED", mission.id, String(mission.collectedAmount), String(updated.collectedAmount));
    return updated;
  }

  async gps(auth: AuthContext, id: string, input: { latitude?: number; longitude?: number; recordedAt?: string }) {
    if (typeof input.latitude !== "number" || typeof input.longitude !== "number" || Math.abs(input.latitude) > 90 || Math.abs(input.longitude) > 180) throw new BadRequestException("Coordonnées invalides");
    const at = input.recordedAt ? new Date(input.recordedAt) : new Date();
    if (Number.isNaN(at.getTime())) throw new BadRequestException("Date GPS invalide");
    const age = Math.max(0, (Date.now() - at.getTime()) / 1000);
    const truth = gpsTruthFromAge(age) as TruthStatus;
    const updated = await this.prisma.mission.updateMany({ where: { id, companyId: auth.companyId }, data: { latitude: input.latitude, longitude: input.longitude, gpsAt: at, gpsTruth: truth } });
    if (!updated.count) throw new NotFoundException();
    await this.audit(auth, "GPS_UPDATE", id, null, JSON.stringify({ latitude: input.latitude, longitude: input.longitude, gpsAt: at.toISOString(), truth }));
    return this.get(auth.companyId, id);
  }

  private audit(auth: AuthContext, objectType: string, objectId: string, oldValue: string | null, newValue: string) {
    return this.prisma.auditEvent.create({ data: { companyId: auth.companyId, actorUserId: auth.userId, action: objectType, objectType: "Mission", objectId, source: "API", oldValue, newValue } });
  }
}
