import { afterEach, describe, expect, it, vi } from "vitest";
import { BillingService } from "../apps/api/src/billing/billing.service";
import type { PrismaService } from "../apps/api/src/prisma.service";
import type { PayDunyaClient } from "../apps/api/src/billing/paydunya.client";

function makeService() {
  const now = new Date();
  const attempt = {
    id: "attempt-1",
    companyName: "Atelier",
    companySlug: "atelier-12345678",
    ownerEmail: "owner@example.com",
    ownerFirstName: "Awa",
    ownerLastName: "Diarra",
    passwordHash: "hash",
    passwordSalt: "salt",
    seatCount: 3,
    planPriceId: "price-1",
    status: "PENDING_PAYMENT",
    expiresAt: new Date(now.getTime() + 60_000),
    planPrice: { id: "price-1", code: "PRO", version: 1, currency: "XOF", unitPriceXof: 5000 },
  };
  const prisma = {
    signupAttempt: { findFirst: vi.fn().mockResolvedValue(attempt), updateMany: vi.fn() },
    planPrice: { findFirst: vi.fn().mockResolvedValue({ id: "price-1", code: "PRO", version: 1, currency: "XOF", unitPriceXof: 5000 }) },
    billingPayment: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "payment-1" }),
      update: vi.fn().mockResolvedValue({ id: "payment-1" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(),
  };
  const paydunya = {
    createInvoice: vi.fn().mockResolvedValue({
      token: "test_invoice_12345",
      checkoutUrl: "https://app.paydunya.com/sandbox-checkout/invoice/test_invoice_12345",
    }),
    confirmInvoice: vi.fn(),
  };
  return {
    service: new BillingService(prisma as unknown as PrismaService, paydunya as unknown as PayDunyaClient),
    prisma,
    paydunya,
    attempt,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("BillingService — PayDunya checkout safety", () => {
  it("reserves one server-priced XOF invoice before contacting PayDunya", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PAYDUNYA_CALLBACK_URL", "https://api.example.com/billing/paydunya/callback");
    vi.stubEnv("PAYDUNYA_RETURN_URL", "https://example.com/inscription/retour");
    vi.stubEnv("PAYDUNYA_CANCEL_URL", "https://example.com/inscription/annulee");
    const { service, prisma, paydunya } = makeService();

    const result = await service.createSignupCheckout("attempt-1", "a".repeat(64));

    expect(prisma.billingPayment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        signupAttemptId: "attempt-1",
        provider: "PAYDUNYA",
        amountXof: 15000,
        currency: "XOF",
        status: "PENDING",
        idempotencyKey: "paydunya-signup-attempt-1",
      }),
    }));
    expect(paydunya.createInvoice).toHaveBeenCalledWith(expect.objectContaining({
      amountXof: 15000,
      customerEmail: "owner@example.com",
      reference: "attempt-1",
    }));
    expect(prisma.billingPayment.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "payment-1" },
      data: expect.objectContaining({
        providerReference: "test_invoice_12345",
        checkoutUrl: "https://app.paydunya.com/sandbox-checkout/invoice/test_invoice_12345",
      }),
    }));
    expect(result).toMatchObject({ amountXof: 15000, currency: "XOF", status: "PENDING_PAYMENT" });
  });

  it("does not activate anything when confirmed amount or signup reference does not match", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { service, prisma, paydunya } = makeService();
    prisma.billingPayment.findFirst.mockResolvedValue({
      id: "payment-1",
      signupAttemptId: "attempt-1",
      provider: "PAYDUNYA",
      providerReference: "test_invoice_12345",
      amountXof: 15000,
      currency: "XOF",
      status: "PENDING",
      signupAttempt: { ...makeService().attempt, status: "PENDING_PAYMENT" },
    });
    paydunya.confirmInvoice.mockResolvedValue({
      status: "completed",
      amountXof: 10000,
      currency: null,
      reference: "attempt-1",
    });

    await expect(service.processPayDunyaCallback("test_invoice_12345")).rejects.toThrow(/ne correspondent pas/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.billingPayment.update).not.toHaveBeenCalled();
  });

  it("does not return a checkout URL when the provider invoice cannot be persisted", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PAYDUNYA_CALLBACK_URL", "https://api.example.com/billing/paydunya/callback");
    vi.stubEnv("PAYDUNYA_RETURN_URL", "https://example.com/inscription/retour");
    vi.stubEnv("PAYDUNYA_CANCEL_URL", "https://example.com/inscription/annulee");
    const { service, prisma, paydunya } = makeService();
    prisma.billingPayment.update.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(service.createSignupCheckout("attempt-1", "a".repeat(64)))
      .rejects.toThrow(/Aucun lien n'a été communiqué/);

    expect(paydunya.createInvoice).toHaveBeenCalledOnce();
    expect(prisma.billingPayment.updateMany).toHaveBeenCalledWith({
      where: { id: "payment-1", status: "PENDING", providerReference: null },
      data: { status: "FAILED" },
    });
  });

  it("does not start sandbox checkout in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYDUNYA_MODE", "sandbox");
    const { service, paydunya } = makeService();

    await expect(service.createSignupCheckout("attempt-1", "a".repeat(64))).rejects.toThrow(/sandbox est interdit en production/);
    expect(paydunya.createInvoice).not.toHaveBeenCalled();
  });
  it("does not reuse an uncertain failed invoice or risk a later double charge", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PAYDUNYA_CALLBACK_URL", "https://api.example.com/billing/paydunya/callback");
    vi.stubEnv("PAYDUNYA_RETURN_URL", "https://example.com/inscription/retour");
    vi.stubEnv("PAYDUNYA_CANCEL_URL", "https://example.com/inscription/annulee");
    const { service, prisma, paydunya } = makeService();
    prisma.billingPayment.findFirst.mockResolvedValue({
      id: "payment-previous",
      status: "FAILED",
      checkoutUrl: null,
      amountXof: 15000,
      providerReference: null,
    });

    await expect(service.createSignupCheckout("attempt-1", "a".repeat(64)))
      .rejects.toThrow(/Pour éviter un double débit/);

    expect(paydunya.createInvoice).not.toHaveBeenCalled();
    expect(prisma.billingPayment.updateMany).not.toHaveBeenCalled();
    expect(prisma.billingPayment.create).not.toHaveBeenCalled();
  });

});
