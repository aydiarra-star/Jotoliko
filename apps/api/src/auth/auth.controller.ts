import { Body, Controller, HttpCode, Ip, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthService, type LoginResult } from "./auth.service";
import { LoginDto } from "./dto/login.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Connexion. La limitation est volontairement stricte : sans elle, un mot de
   * passe court se casse par force brute en quelques minutes.
   */
  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Body() body: LoginDto, @Ip() ip: string): Promise<LoginResult> {
    return this.auth.login(body.companyId, body.email, body.password, ip);
  }
}
