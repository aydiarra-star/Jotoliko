import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { MISSION_STATUSES, type MissionStatus } from "../../../../../lib/jotoliko-os/core";

export class ListMissionsDto {
  @IsOptional()
  @IsIn(MISSION_STATUSES as unknown as string[])
  status?: MissionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  /**
   * Pagination par curseur plutôt que par `skip` : `skip` devient coûteux et
   * instable dès que la table grandit ou que des lignes sont insérées en tête.
   *
   * La borne doit accepter ce que l'API produit elle-même : le curseur encode
   * `(updatedAt ISO 8601, identifiant)`, soit 61 caractères, donc 84 en
   * base64url. Une limite de 64 rendait la deuxième page systématiquement
   * refusée (`400`) — défaut relevé par les tests HTTP de bout en bout.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}
