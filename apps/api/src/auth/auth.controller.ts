import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  login(@Body() body: { companyId?: string; email?: string; password?: string }) {
    if (!body.companyId || !body.email || !body.password) throw new BadRequestException("companyId, email et password requis");
    return this.auth.login(body.companyId, body.email.trim().toLowerCase(), body.password);
  }
}
