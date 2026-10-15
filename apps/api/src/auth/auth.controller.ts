import { Body, Controller, HttpCode, Ip, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthService, type LoginResult } from "./auth.service";
import { SignupService } from "./signup.service";
import { LoginDto } from "./dto/login.dto";
import { SignupDto } from "./dto/signup.dto";
import { ResumeSignupDto } from "./dto/resume-signup.dto";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly signup: SignupService
  ) {}

  /**
   * Inscription professionnelle. Crée uniquement une tentative en attente ;
   * ne crée ni entreprise, ni appartenance, ni abonnement actif.
   */
  @Post("signup")
  @HttpCode(201)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  createSignup(@Body() body: SignupDto) {
    return this.signup.create(body);
  }

  /**
   * Reprise d'une inscription par identifiant et jeton secret.
   * L'identifiant seul ne révèle aucune information sur l'inscription.
   */
  @Post("signup/:id/resume")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resumeSignup(@Param("id") id: string, @Body() body: ResumeSignupDto) {
    return this.signup.resume(id, body.resumeToken);
  }

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
