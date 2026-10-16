import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma.module";
import { AuthGuard } from "../auth/auth.guard";
import { RoleResolver } from "../auth/role-resolver";
import { BillingController } from "./billing.controller";
import { BillingAccessGuard } from "./billing-access.guard";
import { BillingService } from "./billing.service";
import { PayDunyaClient } from "./paydunya.client";

@Module({
  imports: [PrismaModule],
  controllers: [BillingController],
  providers: [BillingService, PayDunyaClient, AuthGuard, RoleResolver, BillingAccessGuard],
  exports: [BillingAccessGuard],
})
export class BillingModule {}
