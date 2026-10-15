import { Controller, Get, HttpCode, HttpStatus, Res } from "@nestjs/common";
import type { Response } from "express";
import { PrismaService } from "./prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Vivacité : le processus répond. Ne touche pas aux dépendances — un service
   * dont la base est momentanément indisponible ne doit pas être redémarré en
   * boucle par l'orchestrateur.
   */
  @Get()
  live(): { status: string; service: string } {
    return { status: "ok", service: "jotoliko-api" };
  }

  /** Disponibilité : vérifie réellement la dépendance critique (PostgreSQL). */
  @Get("ready")
  async ready(@Res({ passthrough: true }) res: Response): Promise<Record<string, unknown>> {
    const database = await this.prisma.ping();
    if (!database) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: database ? "ready" : "degraded",
      service: "jotoliko-api",
      checks: { database: database ? "ok" : "unreachable" },
    };
  }

  @Get("live")
  @HttpCode(HttpStatus.OK)
  liveness(): { status: string } {
    return { status: "ok" };
  }
}
