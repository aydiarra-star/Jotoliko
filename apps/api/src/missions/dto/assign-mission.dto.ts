import { IsOptional, IsString, MaxLength } from "class-validator";

export class AssignMissionDto {
  /**
   * Identifiant du livreur à affecter. `null` désaffecte la mission.
   * Le service vérifie l'appartenance à la même entreprise.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  assigneeUserId?: string | null;
}
