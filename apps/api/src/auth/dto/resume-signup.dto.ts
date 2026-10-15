import { IsString, Matches, MaxLength } from "class-validator";

export class ResumeSignupDto {
  @IsString()
  @MaxLength(128)
  @Matches(/^[a-f0-9]{64}$/i)
  resumeToken!: string;
}
