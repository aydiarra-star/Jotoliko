import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read-only estimate from the current server-configured price list.
   * No signup, payment session, or subscription is created by this method.
   */
  async quoteMonthly(seatCountInput: string | number, now = new Date()) {
    const seatCount = typeof seatCountInput === "number" ? seatCountInput : Number(seatCountInput);
    if (!Number.isSafeInteger(seatCount) || seatCount < 1 || seatCount > 500) {
      throw new BadRequestException({
        code: "INVALID_SEAT_COUNT",
        message: "Le nombre de livreurs doit être un entier entre 1 et 500.",
      });
    }

    const prices = await this.prisma.planPrice.findMany({
      where: {
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
        currency: "XOF",
      },
      orderBy: [{ code: "asc" }, { version: "desc" }],
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
      seatCount,
      currency: "XOF",
      quotes: prices.map((price) => ({
        ...price,
        monthlyAmountXof: price.unitPriceXof * seatCount,
      })),
      message: prices.length > 0 ? undefined : "PRICE_NOT_CONFIGURED",
      note: "Estimation indicative calculée à partir des tarifs actifs côté serveur. Aucun paiement ni abonnement n'est créé.",
    };
  }

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
    const activePeriodIsValid =
      subscription.currentPeriodEnd !== null && subscription.currentPeriodEnd > now;
    const graceIsActive =
      subscription.status === "GRACE_PERIOD" &&
      subscription.gracePeriodEndsAt !== null &&
      subscription.gracePeriodEndsAt > now;
    const paidAccessExpected =
      (subscription.status === "ACTIVE" && activePeriodIsValid) || graceIsActive;

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
