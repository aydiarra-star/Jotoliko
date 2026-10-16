import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma.module";
import { BillingModule } from "../billing/billing.module";
import { AuthGuard } from "../auth/auth.guard";
import { RoleResolver } from "../auth/role-resolver";
import { RolesGuard } from "../auth/roles.guard";
import { MissionsController } from "./missions.controller";
import { MissionsService } from "./missions.service";

@Module({
  imports: [PrismaModule, BillingModule],
  controllers: [MissionsController],
  providers: [MissionsService, AuthGuard, RolesGuard, RoleResolver],
})
export class MissionsModule {}
