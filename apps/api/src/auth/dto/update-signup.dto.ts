import { Transform, Type } from "class-transformer";
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
import { ResumeSignupDto } from "./resume-signup.dto";

export class UpdateSignupDto extends ResumeSignupDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  companyName?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{2,64}$/)
  planCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seatCount?: number;
}
