import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { BillingService } from "./billing.service";

@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Public read-only endpoint. Returns no price until one is explicitly configured. */
  @Get("pricing")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  pricing() {
    return this.billing.listPublicPrices();
  }

  /** Public read-only monthly estimate; never creates an account or payment. */
  @Get("quote")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  quote(@Query("seats") seats?: string) {
    return this.billing.quoteMonthly(seats ?? "");
  }

  /** Authenticated company-scoped subscription summary; never accepts companyId from the client. */
  @Get("subscription")
  @UseGuards(AuthGuard)
  subscription(@Req() req: AuthenticatedRequest) {
    return this.billing.getCompanySubscription(req.auth!.companyId);
  }
}
