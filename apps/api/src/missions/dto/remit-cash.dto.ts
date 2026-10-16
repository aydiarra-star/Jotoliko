import { IsInt, IsOptional, IsPositive, IsString, Max, MaxLength } from "class-validator";

export class RemitCashDto {
  @IsInt()
  @IsPositive()
  @Max(1_000_000_000)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  recordedAt?: string;
}
