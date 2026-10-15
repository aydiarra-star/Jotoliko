import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Expose only explicitly configured, currently effective prices.
   * No default tariff is inferred from examples or environment variables.
   */
  async listPublicPrices(now = new Date()) {
    const prices = await this.prisma.planPrice.findMany({
      where: {
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
      },
      orderBy: [{ unitPriceXof: "asc" }, { version: "desc" }],
      select: {
        id: true,
        code: true,
        version: true,
        currency: true,
        unitPriceXof: true,
        effectiveFrom: true,
        effectiveUntil: true,
      },
    });

    return {
      configured: prices.length > 0,
      billingPeriod: "MONTH",
      currency: "XOF",
      seatRange: { minimum: 1, maximum: 500 },
      prices,
      message: prices.length > 0 ? undefined : "PRICE_NOT_CONFIGURED",
    };
  }

  /** A company can read its own subscription only; provider secrets are omitted. */
  async getCompanySubscription(companyId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        seatLimit: true,
        status: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        gracePeriodEndsAt: true,
        cancelAtPeriodEnd: true,
        createdAt: true,
        planPrice: {
          select: {
            code: true,
            version: true,
            currency: true,
            unitPriceXof: true,
          },
        },
      },
    });

    if (!subscription) {
      return { configured: false, subscription: null, message: "NO_SUBSCRIPTION" };
    }

    const now = new Date();
    const graceIsActive =
      subscription.status === "GRACE_PERIOD" &&
      subscription.gracePeriodEndsAt !== null &&
      subscription.gracePeriodEndsAt > now;
    const paidAccessExpected = subscription.status === "ACTIVE" || graceIsActive;

    return {
      configured: true,
      subscription: {
        ...subscription,
        monthlyAmountXof: subscription.planPrice.unitPriceXof * subscription.seatLimit,
        paidAccessExpected,
      },
    };
  }
}
