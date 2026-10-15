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
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}
