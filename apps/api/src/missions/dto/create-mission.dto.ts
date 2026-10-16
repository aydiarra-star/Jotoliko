import { Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

/**
 * Création d'une mission depuis le centre des opérations.
 *
 * Aucun champ d'entreprise n'est accepté : le périmètre vient du jeton, jamais
 * du corps de la requête. `assignedUserId` est vérifié comme membre actif de la
 * même entreprise par le service.
 */
export class CreateMissionDto {
  /** Référence métier, unique par entreprise (utilisée sur les bordereaux). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  reference!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  clientName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  /** Montant attendu en FCFA entiers. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  expectedAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  quartier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  zone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  writtenAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  landmark?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  accessInstructions?: string;
}
