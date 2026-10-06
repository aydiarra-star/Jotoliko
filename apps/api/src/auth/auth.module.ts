import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { RolesGuard } from "./roles.guard";

@Module({
  controllers: [AuthController],
  providers: [AuthService, PrismaService, AuthGuard, RolesGuard],
  exports: [PrismaService, AuthGuard, RolesGuard],
})
export class AuthModule {}
