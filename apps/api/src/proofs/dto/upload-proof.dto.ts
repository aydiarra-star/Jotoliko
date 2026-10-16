import { Type } from "class-transformer";
import { IsBase64, IsIn, IsISO8601, IsLatitude, IsLongitude, IsOptional, IsString, MaxLength } from "class-validator";
import { MAX_PROOF_BYTES, PROOF_MIME_EXTENSIONS } from "../proof-storage";

/**
 * Dépôt d'une preuve de livraison.
 *
 * Le contenu est transmis en base64 dans le corps JSON : aucun analyseur
 * multipart supplémentaire n'est nécessaire, et la validation de forme reste
 * uniforme avec le reste de l'API. La taille est bornée ici **et** vérifiée
 * après décodage (un base64 peut annoncer une longueur qui ne correspond pas au
 * contenu réellement décodé).
 */
export const MAX_PROOF_BASE64_LENGTH = Math.ceil((MAX_PROOF_BYTES * 4) / 3) + 16;

export class UploadProofDto {
  /** Type MIME attendu : `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. */
  @IsIn(Object.keys(PROOF_MIME_EXTENSIONS))
  mimeType!: string;

  @IsBase64()
  @MaxLength(MAX_PROOF_BASE64_LENGTH)
  dataBase64!: string;

  @IsOptional()
  @IsIn(["PHOTO", "SIGNATURE", "RECIPIENT_NAME", "NOTE"])
  type?: "PHOTO" | "SIGNATURE" | "RECIPIENT_NAME" | "NOTE";

  @IsOptional()
  @IsString()
  @MaxLength(120)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsISO8601()
  recordedAt?: string;

  /** Identifiant généré sur le téléphone : rend le dépôt hors ligne rejouable. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientId?: string;
}
