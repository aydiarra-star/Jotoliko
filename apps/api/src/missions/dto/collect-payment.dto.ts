import { IsInt, IsOptional, IsPositive, IsString, Max, MaxLength } from "class-validator";

export class CollectPaymentDto {
  /** Entier en FCFA. Aucun flottant : 1,5 FCFA n'existe pas. */
  @IsInt()
  @IsPositive()
  @Max(1_000_000_000)
  collected!: number;

  /** Horodatage terrain, distinct de l'heure serveur. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  recordedAt?: string;
}
