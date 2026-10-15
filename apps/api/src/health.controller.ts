import { Controller, Get, HttpCode, HttpStatus, Res } from "@nestjs/common";
import type { Response } from "express";
import { PrismaService } from "./prisma.service";
import { ProofStorage } from "./proofs/proof-storage";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ProofStorage
  ) {}

  /**
   * Vivacité : le processus répond. Ne touche pas aux dépendances — un service
   * dont la base est momentanément indisponible ne doit pas être redémarré en
   * boucle par l'orchestrateur.
   */
  @Get()
  live(): { status: string; service: string } {
    return { status: "ok", service: "jotoliko-api" };
  }

  /**
   * Disponibilité : vérifie réellement les deux dépendances de service.
   *
   * La base, évidemment. Mais aussi le **volume de preuves** : si l'API accepte
   * des livraisons alors que les preuves ne peuvent plus être écrites, la
   * défaillance n'apparaît qu'au moment où un livreur clôture une livraison
   * devant un client. Mieux vaut retirer l'instance du routage et alerter que
   * laisser croire que le service est disponible.
   */
  @Get("ready")
  async ready(@Res({ passthrough: true }) res: Response): Promise<Record<string, unknown>> {
    const [database, storage] = await Promise.all([this.prisma.ping(), this.storage.health()]);
    const ready = database && storage.usable;
    if (!ready) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: ready ? "ready" : "degraded",
      service: "jotoliko-api",
      checks: {
        database: database ? "ok" : "unreachable",
        storage: storage.usable ? "ok" : (storage.reason ?? "unusable"),
      },
      // L'espace libre est publié pour permettre une alerte **avant** la
      // saturation, pas seulement une fois le seuil franchi.
      storageFreeBytes: storage.freeBytes,
      storageMinFreeBytes: storage.minFreeBytes,
    };
  }

  @Get("live")
  @HttpCode(HttpStatus.OK)
  liveness(): { status: string } {
    return { status: "ok" };
  }
}
