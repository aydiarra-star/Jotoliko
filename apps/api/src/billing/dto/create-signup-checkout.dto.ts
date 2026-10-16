import { IsString, Matches, MaxLength } from "class-validator";

export class CreateSignupCheckoutDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  resumeToken!: string;
}
