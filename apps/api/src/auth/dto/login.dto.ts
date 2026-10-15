import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";
import { Transform } from "class-transformer";

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  companyId!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // Longueur maximale bornée : évite qu'un attaquant fasse hacher un mot de
  // passe de plusieurs mégaoctets (déni de service par coût CPU).
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}
