import { IsString, Matches, MaxLength } from "class-validator";

/**
 * PayDunya callback tokens are treated only as lookup hints. The API always
 * verifies the invoice directly with PayDunya before changing any payment state.
 */
export class PayDunyaCallbackDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{4,200}$/)
  @MaxLength(200)
  token!: string;
}
