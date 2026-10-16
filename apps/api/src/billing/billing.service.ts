import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma.service";
import { PayDunyaClient } from "./paydunya.client";

const PROVIDER = "PAYDUNYA";

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function requiredHttpsUrl(name: string): string {
  const raw = process.env[name]?.trim();
  if (!raw) throw new ServiceUnavailableException(`Configuration ${name} manquante : aucun paiement n'a été lancé.`);
  let parsed: URL;
  try { parsed = new URL(raw); } catch {
    throw new ServiceUnavailableException(`Configuration ${name} invalide.`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new ServiceUnavailableException(`Configuration ${name} doit être une URL HTTPS publique.`);
  }
  return parsed.toString();
}

function assertPaymentEnvironmentAllowed(): void {
  // Sandbox invoices must never activate real production tenants.
  if (process.env.NODE_ENV === "production" && (process.env.PAYDUNYA_MODE?.trim() || "sandbox") !== "live") {
    throw new ServiceUnavailableException(
      "Le paiement sandbox est interdit en production. Configurez PayDunya live après validation du compte marchand.",
    );
  }
}

function addCalendarMonth(from: Date): Date {
  const result = new Date(from);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + 1);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paydunya: PayDunyaClient,
  ) {}

  /**
   * Starts or resumes a hosted invoice for a secret-protected signup attempt.
   * The client cannot choose the amount, currency, customer, or provider URL.
   */
  async createSignupCheckout(signupAttemptId: string, resumeToken: string) {
    assertPaymentEnvironmentAllowed();
    const now = new Date();
    const attempt = await this.prisma.signupAttempt.findFirst({
      where: { id: signupAttemptId, resumeTokenHash: hashToken(resumeToken) },
      include: { planPrice: true },
    });
    if (!attempt) throw new ConflictException({ code: "SIGNUP_RESUME_INVALID", message: "Lien de reprise invalide ou indisponible." });
    if (attempt.status !== "PENDING_PAYMENT") {
      throw new ConflictException({ code: "SIGNUP_NOT_PAYABLE", message: "Cette inscription n'est plus payable." });
    }
    if (attempt.expiresAt <= now) {
      await this.prisma.signupAttempt.updateMany({
        where: { id: attempt.id, status: "PENDING_PAYMENT", expiresAt: { lte: now } },
        data: { status: "EXPIRED" },
      });
      throw new ConflictException({ code: "SIGNUP_EXPIRED", message: "Cette inscription a expiré. Recommencez le parcours." });
    }

    const activePrice = await this.prisma.planPrice.findFirst({
      where: {
        id: attempt.planPriceId,
        isActive: true,
        currency: "XOF",
        effectiveFrom: { lte: now },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
      },
      select: { id: true, code: true, version: true, currency: true, unitPriceXof: true },
    });
    if (!activePrice || !Number.isSafeInteger(activePrice.unitPriceXof * attempt.seatCount)) {
      throw new ServiceUnavailableException({ code: "PRICE_NOT_CONFIGURED", message: "Le tarif choisi n'est plus actif. Aucun paiement n'a été lancé." });
    }

    const callbackUrl = requiredHttpsUrl("PAYDUNYA_CALLBACK_URL");
    const returnUrl = requiredHttpsUrl("PAYDUNYA_RETURN_URL");
    const cancelUrl = requiredHttpsUrl("PAYDUNYA_CANCEL_URL");

    let existing = await this.prisma.billingPayment.findFirst({
      where: { signupAttemptId: attempt.id, provider: PROVIDER },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, checkoutUrl: true, amountXof: true, providerReference: true },
    });
    const amountXof = activePrice.unitPriceXof * attempt.seatCount;
    if (existing?.status === "PENDING") {
      if (existing.checkoutUrl && existing.amountXof === amountXof) {
        return {
          signupAttemptId: attempt.id,
          status: "PENDING_PAYMENT",
          checkoutUrl: existing.checkoutUrl,
          amountXof: existing.amountXof,
          currency: "XOF",
          provider: PROVIDER,
          message: "Facture en attente réutilisée. Le compte sera activé uniquement après confirmation du paiement par PayDunya.",
        };
      }
      throw new ConflictException({
        code: "CHECKOUT_CREATION_IN_PROGRESS",
        message: "Une facture est en cours de préparation. Réessayez dans quelques secondes.",
      });
    }

    // A failed row can only be retried after a server-to-server check proves
    // that its known provider invoice is terminal. A missing token or a provider
    // timeout remains ambiguous: never create another invoice in that case.
    let terminalFailedPaymentId: string | null = null;
    if (existing?.status === "FAILED") {
      if (!existing.providerReference) {
        throw new ConflictException({
          code: "CHECKOUT_NOT_RETRYABLE",
          message: "Le résultat de la facture précédente est incertain. Pour éviter un double débit, aucune nouvelle facture ne sera créée tant que son état ne peut pas être vérifié.",
        });
      }

      let previousInvoice: { status: string; amountXof: number | null; currency: string | null; reference: string | null };
      try {
        previousInvoice = await this.paydunya.confirmInvoice(existing.providerReference);
      } catch {
        throw new ConflictException({
          code: "CHECKOUT_RECONCILIATION_UNAVAILABLE",
          message: "L'état de la facture précédente n'a pas pu être vérifié auprès du prestataire. Réessayez plus tard ; aucune nouvelle facture n'a été créée.",
        });
      }

      if (previousInvoice.status === "completed") {
        await this.processPayDunyaCallback(existing.providerReference);
        throw new ConflictException({
          code: "CHECKOUT_ALREADY_PAID",
          message: "La facture précédente est payée. Le résultat a été vérifié ; actualisez la page avant toute autre action.",
        });
      }
      if (previousInvoice.status !== "failed" && previousInvoice.status !== "cancelled") {
        throw new ConflictException({
          code: "CHECKOUT_NOT_TERMINAL",
          message: "La facture précédente n'est pas confirmée comme définitivement échouée ou annulée. Aucune nouvelle facture n'a été créée.",
        });
      }
      // A terminal status alone is insufficient: ensure the provider response
      // still identifies the exact stored invoice before permitting a retry.
      if (
        previousInvoice.amountXof !== existing.amountXof ||
        (previousInvoice.currency !== null && previousInvoice.currency.toUpperCase() !== "XOF") ||
        previousInvoice.reference !== attempt.id
      ) {
        throw new ConflictException({
          code: "CHECKOUT_RECONCILIATION_MISMATCH",
          message: "Les détails de la facture précédente ne correspondent pas à l'inscription. Aucune nouvelle facture n'a été créée.",
        });
      }
      terminalFailedPaymentId = existing.id;
    }

    // Reserve a checkout slot before calling the provider. For a retry, the
    // old invoice row is retained and the deterministic retry key makes
    // concurrent retry requests collide instead of creating duplicate invoices.
    let paymentId: string;
    if (!existing || terminalFailedPaymentId) {
      try {
        const reservation = await this.prisma.billingPayment.create({
          data: {
            signupAttemptId: attempt.id,
            provider: PROVIDER,
            amountXof,
            currency: "XOF",
            status: "PENDING",
            idempotencyKey: terminalFailedPaymentId
              ? `paydunya-signup-${attempt.id}-retry-${terminalFailedPaymentId}`
              : `paydunya-signup-${attempt.id}`,
          },
          select: { id: true },
        });
        paymentId = reservation.id;
      } catch {
        throw new ConflictException({
          code: "CHECKOUT_CREATION_IN_PROGRESS",
          message: "Une facture vient d'être préparée par une autre requête. Rechargez l'inscription et réessayez.",
        });
      }
    } else {
      throw new ConflictException({
        code: "CHECKOUT_NOT_RETRYABLE",
        message: "Cette tentative de paiement doit être vérifiée avant toute nouvelle facture.",
      });
    }

    let invoice: { token: string; checkoutUrl: string };
    try {
      invoice = await this.paydunya.createInvoice({
        amountXof,
        description: `Jotoliko ${activePrice.code} — ${attempt.seatCount} compte(s), période mensuelle`,
        customerName: `${attempt.ownerFirstName} ${attempt.ownerLastName}`.trim(),
        customerEmail: attempt.ownerEmail,
        callbackUrl,
        returnUrl,
        cancelUrl,
        reference: attempt.id,
      });
    } catch (error) {
      await this.prisma.billingPayment.update({
        where: { id: paymentId },
        data: { status: "FAILED" },
      });
      throw error;
    }

    try {
      await this.prisma.billingPayment.update({
        where: { id: paymentId },
        data: { providerReference: invoice.token, checkoutUrl: invoice.checkoutUrl },
      });
    } catch {
      // Never return an invoice URL until its token and amount are durably linked
      // to the signup attempt. If persistence failed, keep the link private and
      // release the reservation for a controlled retry.
      try {
        await this.prisma.billingPayment.updateMany({
          where: { id: paymentId, status: "PENDING", providerReference: null },
          data: { status: "FAILED" },
        });
      } catch {
        // A DB outage can also prevent cleanup. The client still receives no URL.
      }
      throw new ServiceUnavailableException(
        "La facture a été créée mais son enregistrement n'a pas pu être confirmé. Aucun lien n'a été communiqué ; réessayez avant tout nouveau paiement.",
      );
    }

    return {
      signupAttemptId: attempt.id,
      status: "PENDING_PAYMENT",
      checkoutUrl: invoice.checkoutUrl,
      amountXof,
      currency: "XOF",
      provider: PROVIDER,
      message: "Ouvrez la page PayDunya pour payer. Le compte ne sera activé qu'après confirmation serveur.",
    };
  }

  /**
   * A callback token is not proof of payment. Confirm directly with PayDunya,
   * match the stored invoice, exact amount/currency and signup reference, then
   * activate all account records in one transaction. Repeated callbacks are safe.
   */
  async processPayDunyaCallback(invoiceToken: string) {
    assertPaymentEnvironmentAllowed();
    const payment = await this.prisma.billingPayment.findFirst({
      where: { provider: PROVIDER, providerReference: invoiceToken },
      include: { signupAttempt: true, subscription: { select: { companyId: true } } },
    });
    if (!payment || !payment.signupAttemptId || !payment.signupAttempt) {
      throw new UnprocessableEntityException("Facture inconnue.");
    }
    if (payment.status === "CONFIRMED" && payment.signupAttempt.status === "ACTIVE") {
      return { received: true, status: "ACTIVE", idempotent: true, companyId: payment.subscription?.companyId ?? null, companySlug: payment.signupAttempt.companySlug };
    }

    const verified = await this.paydunya.confirmInvoice(invoiceToken);
    if (verified.status !== "completed") {
      if (verified.status === "failed" || verified.status === "cancelled") {
        await this.prisma.billingPayment.updateMany({
          where: { id: payment.id, status: "PENDING" },
          data: { status: "FAILED" },
        });
        return { received: true, status: "PAYMENT_NOT_COMPLETED", retryAllowed: true };
      }
      return { received: true, status: "PENDING" };
    }
    if (
      verified.amountXof !== payment.amountXof ||
      (verified.currency !== null && verified.currency.toUpperCase() !== "XOF") ||
      verified.reference !== payment.signupAttemptId
    ) {
      throw new UnprocessableEntityException("Les données de confirmation ne correspondent pas à la facture enregistrée.");
    }

    const now = new Date();
    const eventHash = createHash("sha256")
      .update([invoiceToken, verified.status, String(verified.amountXof), verified.currency, verified.reference].join("|"))
      .digest("hex");

    return this.prisma.$transaction(async (tx) => {
      // Once a hosted invoice was reserved while the signup was valid, a slow
      // provider callback must not leave a customer charged but unactivated.
      // Expiry blocks new checkouts; it does not invalidate an invoice created
      // before that expiry. Attempts whose invoice was created too late remain
      // subject to the normal expiry guard.
      const invoiceStartedBeforeExpiry =
        payment.createdAt instanceof Date &&
        payment.createdAt <= payment.signupAttempt!.expiresAt;
      const claimed = await tx.signupAttempt.updateMany({
        where: {
          id: payment.signupAttemptId!,
          status: "PENDING_PAYMENT",
          ...(!invoiceStartedBeforeExpiry ? { expiresAt: { gt: now } } : {}),
        },
        data: { status: "ACTIVE" },
      });

      if (claimed.count === 0) {
        const current = await tx.signupAttempt.findUnique({
          where: { id: payment.signupAttemptId! },
          select: { status: true },
        });
        const currentPayment = await tx.billingPayment.findUnique({
          where: { id: payment.id },
          select: { status: true },
        });
        if (current?.status === "ACTIVE" && currentPayment?.status === "CONFIRMED") {
          return { received: true, status: "ACTIVE", idempotent: true };
        }
        throw new ConflictException({
          code: "SIGNUP_NOT_ACTIVATABLE",
          message: "Le paiement est confirmé, mais l'inscription a expiré ou changé d'état. Une vérification manuelle est nécessaire.",
        });
      }

      const existingUser = await tx.user.findUnique({
        where: { email: payment.signupAttempt!.ownerEmail },
        select: { id: true },
      });
      if (existingUser) {
        throw new ConflictException({
          code: "EMAIL_ALREADY_REGISTERED",
          message: "Cette adresse a été utilisée entre-temps. L'activation automatique est suspendue pour éviter un compte en double.",
        });
      }
      const ownerRole = await tx.role.findUnique({ where: { code: "OWNER" }, select: { id: true } });
      if (!ownerRole) {
        throw new ServiceUnavailableException("Le rôle OWNER n'est pas configuré. L'activation a été annulée sans créer de compte.");
      }

      const attempt = payment.signupAttempt!;
      const company = await tx.company.create({
        data: {
          name: attempt.companyName,
          slug: attempt.companySlug,
          country: "SN",
          currency: "XOF",
          timezone: "Africa/Dakar",
        },
        select: { id: true },
      });
      const user = await tx.user.create({
        data: {
          email: attempt.ownerEmail,
          firstName: attempt.ownerFirstName,
          lastName: attempt.ownerLastName,
          passwordHash: attempt.passwordHash,
          passwordSalt: attempt.passwordSalt,
          isActive: true,
        },
        select: { id: true },
      });
      await tx.membership.create({
        data: { userId: user.id, companyId: company.id, roleId: ownerRole.id },
      });
      const periodEnd = addCalendarMonth(now);
      const subscription = await tx.subscription.create({
        data: {
          companyId: company.id,
          planPriceId: attempt.planPriceId,
          seatLimit: attempt.seatCount,
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          provider: PROVIDER,
        },
        select: { id: true },
      });
      await tx.billingPayment.update({
        where: { id: payment.id },
        data: {
          subscriptionId: subscription.id,
          status: "CONFIRMED",
          paidAt: now,
          rawEventHash: eventHash,
        },
      });
      return {
        received: true,
        status: "ACTIVE",
        idempotent: false,
        companyId: company.id,
        companySlug: attempt.companySlug,
        subscriptionId: subscription.id,
        currentPeriodEnd: periodEnd,
      };
    });
  }

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
      where: { isActive: true, effectiveFrom: { lte: now }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }], currency: "XOF" },
      orderBy: [{ code: "asc" }, { version: "desc" }],
      select: { id: true, code: true, version: true, currency: true, unitPriceXof: true, effectiveFrom: true, effectiveUntil: true },
    });
    return {
      configured: prices.length > 0,
      billingPeriod: "MONTH",
      seatCount,
      currency: "XOF",
      quotes: prices.map((price) => ({ ...price, monthlyAmountXof: price.unitPriceXof * seatCount })),
      message: prices.length > 0 ? undefined : "PRICE_NOT_CONFIGURED",
      note: "Estimation indicative calculée à partir des tarifs actifs côté serveur. Aucun paiement ni abonnement n'est créé.",
    };
  }

  /** Expose only explicitly configured, currently effective prices. */
  async listPublicPrices(now = new Date()) {
    const prices = await this.prisma.planPrice.findMany({
      where: { isActive: true, currency: "XOF", effectiveFrom: { lte: now }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }] },
      orderBy: [{ unitPriceXof: "asc" }, { version: "desc" }],
      select: { id: true, code: true, version: true, currency: true, unitPriceXof: true, effectiveFrom: true, effectiveUntil: true },
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
        id: true, seatLimit: true, status: true, currentPeriodStart: true,
        currentPeriodEnd: true, gracePeriodEndsAt: true, cancelAtPeriodEnd: true,
        createdAt: true,
        planPrice: { select: { code: true, version: true, currency: true, unitPriceXof: true } },
      },
    });
    if (!subscription) return { configured: false, subscription: null, message: "NO_SUBSCRIPTION" };
    const now = new Date();
    const activePeriodIsValid = subscription.currentPeriodEnd !== null && subscription.currentPeriodEnd > now;
    const graceIsActive = subscription.status === "GRACE_PERIOD" && subscription.gracePeriodEndsAt !== null && subscription.gracePeriodEndsAt > now;
    const paidAccessExpected = (subscription.status === "ACTIVE" && activePeriodIsValid) || graceIsActive;
    return {
      configured: true,
      subscription: { ...subscription, monthlyAmountXof: subscription.planPrice.unitPriceXof * subscription.seatLimit, paidAccessExpected },
    };
  }
}
