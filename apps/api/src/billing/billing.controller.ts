import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { BillingService } from "./billing.service";
import { CreateSignupCheckoutDto } from "./dto/create-signup-checkout.dto";

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

  /**
   * Starts a hosted checkout only for the owner of a valid, secret-protected
   * signup attempt. All price/customer values are taken from server records.
   */
  @Post("signup/:id/checkout")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  createSignupCheckout(@Param("id") id: string, @Body() body: CreateSignupCheckoutDto) {
    return this.billing.createSignupCheckout(id, body.resumeToken);
  }

  /**
   * PayDunya callback. Its token is only a lookup hint; BillingService calls
   * PayDunya's server API and checks the exact invoice before activation.
   */
  @Post("paydunya/callback")
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  paydunyaCallback(@Body() body: Record<string, unknown>) {
    const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : undefined;
    const invoice = data?.invoice && typeof data.invoice === "object" ? data.invoice as Record<string, unknown> : undefined;
    const token = body.token ?? data?.token ?? invoice?.token ?? body["data[invoice][token]"] ?? body["data[token]"];
    if (typeof token !== "string" || !/^[a-zA-Z0-9_-]{4,200}$/.test(token)) {
      throw new BadRequestException("Jeton de facture PayDunya manquant ou invalide.");
    }
    return this.billing.processPayDunyaCallback(token);
  }

  /** Authenticated company-scoped subscription summary; never accepts companyId from the client. */
  @Get("subscription")
  @UseGuards(AuthGuard)
  subscription(@Req() req: AuthenticatedRequest) {
    return this.billing.getCompanySubscription(req.auth!.companyId);
  }
}
