import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { BillingAccessGuard } from "../billing/billing-access.guard";
import { RequirePermission, RolesGuard } from "../auth/roles.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { ProofsService } from "./proofs.service";
import { UploadProofDto } from "./dto/upload-proof.dto";

/**
 * Preuves de livraison.
 *
 * Deux principes : le contenu n'est jamais servi sans contrôle de périmètre, et
 * un dépôt ne peut pas « réussir » sans que le fichier soit réellement stocké.
 */
@Controller("missions/:missionId/proofs")
@UseGuards(AuthGuard, BillingAccessGuard, RolesGuard)
export class ProofsController {
  constructor(private readonly proofs: ProofsService) {}

  @Post()
  @RequirePermission("uploadProof")
  // Un dépôt transportant jusqu'à 5 Mo : limite plus basse que la route de
  // caisse, mais suffisante pour une tournée complète en une minute.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async upload(
    @Req() req: AuthenticatedRequest,
    @Param("missionId") missionId: string,
    @Body() body: UploadProofDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const { proof, replayed } = await this.proofs.upload(req.auth!, missionId, body, req.requestId);
    // Un rejeu idempotent n'est pas une création : 200 plutôt que 201, pour que
    // le terrain distingue « déjà transmis » de « nouvellement transmis ».
    if (replayed) res.status(HttpStatus.OK);
    return proof;
  }

  @Get()
  @RequirePermission("readProof")
  list(@Req() req: AuthenticatedRequest, @Param("missionId") missionId: string) {
    return this.proofs.list(req.auth!, missionId);
  }

  @Get(":proofId")
  @RequirePermission("readProof")
  async download(
    @Req() req: AuthenticatedRequest,
    @Param("missionId") missionId: string,
    @Param("proofId") proofId: string,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    const { proof, stream, size } = await this.proofs.download(req.auth!, missionId, proofId);
    res.setHeader("Content-Type", proof.mimeType);
    res.setHeader("Content-Length", String(size));
    // Jamais mis en cache par un intermédiaire : c'est une pièce justificative.
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", `attachment; filename="${proof.id}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(stream);
  }

  @Delete(":proofId")
  @RequirePermission("deleteProof")
  remove(
    @Req() req: AuthenticatedRequest,
    @Param("missionId") missionId: string,
    @Param("proofId") proofId: string
  ) {
    return this.proofs.remove(req.auth!, missionId, proofId, req.requestId);
  }
}
