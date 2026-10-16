import { Type } from "class-transformer";
import { IsISO8601, IsLatitude, IsLongitude, IsOptional } from "class-validator";

export class RecordGpsDto {
  @Type(() => Number)
  @IsLatitude({ message: "Latitude hors limites (-90 à 90)" })
  latitude!: number;

  @Type(() => Number)
  @IsLongitude({ message: "Longitude hors limites (-180 à 180)" })
  longitude!: number;

  /**
   * Horodatage de la mesure sur l'appareil. S'il est absent, l'heure serveur est
   * utilisée et la position est marquée comme estimée — jamais comme mesurée.
   */
  @IsOptional()
  @IsISO8601()
  recordedAt?: string;
}
