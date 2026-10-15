import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma.module";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { RoleResolver } from "./role-resolver";
import { RolesGuard } from "./roles.guard";

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, RolesGuard, RoleResolver],
  exports: [AuthGuard, RolesGuard, RoleResolver, PrismaModule],
})
export class AuthModule {}
