import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma.module";
import { AuthGuard } from "../auth/auth.guard";
import { RoleResolver } from "../auth/role-resolver";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";

@Module({
  imports: [PrismaModule],
  controllers: [BillingController],
  providers: [BillingService, AuthGuard, RoleResolver],
})
export class BillingModule {}
