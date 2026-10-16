import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { MISSION_STATUSES, type MissionStatus } from "../../../../../lib/jotoliko-os/core";

export class TransitionDto {
  /** Le statut cible est validé contre l'énumération du domaine, pas contre une chaîne libre. */
  @IsIn(MISSION_STATUSES as unknown as string[])
  to!: MissionStatus;

  /** Identifiant de la preuve de livraison (exigée selon la politique). */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  proofId?: string;

  /** Motif, obligatoire pour un échec ou une reprogrammation côté service. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** Horodatage de l'appareil, conservé distinct de l'heure serveur. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  recordedAt?: string;
}
