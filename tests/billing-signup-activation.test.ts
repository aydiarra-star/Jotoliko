import { afterEach, describe, expect, it, vi } from "vitest";
import { BillingService } from "../apps/api/src/billing/billing.service";

function setup(overrides: Record<string, unknown> = {}) {
  const attempt = {
    id: "signup-123",
    status: "PENDING_PAYMENT",
    companyName: "Atelier Diarra",
    companySlug: "atelier-diarra-12345678",
    ownerEmail: "owner@example.com",
    ownerFirstName: "Awa",
    ownerLastName: "Diarra",
    passwordHash: "hash",
    passwordSalt: "salt",
    seatCount: 3,
    planPriceId: "price-1",
    expiresAt: new Date(Date.now() + 60_000),
  };
  const payment = {
    id: "payment-1",
    signupAttemptId: attempt.id,
    subscriptionId: null,
    provider: "PAYDUNYA",
    providerReference: "invoice_1234",
    amountXof: 15000,
    currency: "XOF",
    status: "PENDING",
    signupAttempt: attempt,
    ...overrides,
  };
  const tx = {
    signupAttempt: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE" }),
    },
    billingPayment: {
      findUnique: vi.fn().mockResolvedValue({ status: "CONFIRMED" }),
      update: vi.fn().mockResolvedValue({}),
    },
    user: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "user-1" }) },
    role: { findUnique: vi.fn().mockResolvedValue({ id: "role-owner" }) },
    company: { create: vi.fn().mockResolvedValue({ id: "company-1" }) },
    membership: { create: vi.fn().mockResolvedValue({}) },
    subscription: { create: vi.fn().mockResolvedValue({ id: "subscription-1" }) },
  };
  const prisma = {
    billingPayment: { findFirst: vi.fn().mockResolvedValue(payment) },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const paydunya = {
    confirmInvoice: vi.fn().mockResolvedValue({
      status: "completed",
      amountXof: 15000,
      currency: null,
      reference: attempt.id,
    }),
  };
  return { service: new BillingService(prisma as never, paydunya as never), prisma, paydunya, tx, attempt, payment };
}

afterEach(() => vi.unstubAllEnvs());

describe("PayDunya signup activation", () => {
  it("activates company, owner and monthly subscription only after server confirmation", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { service, paydunya, prisma, tx } = setup();

    const result = await service.processPayDunyaCallback("invoice_1234");

    expect(paydunya.confirmInvoice).toHaveBeenCalledWith("invoice_1234");
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.company.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: "Atelier Diarra", slug: "atelier-diarra-12345678", currency: "XOF" }),
    }));
    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: "owner@example.com", passwordHash: "hash", isActive: true }),
    }));
    expect(tx.membership.create).toHaveBeenCalledOnce();
    expect(tx.subscription.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ seatLimit: 3, status: "ACTIVE", provider: "PAYDUNYA" }),
    }));
    expect(tx.billingPayment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "CONFIRMED", subscriptionId: "subscription-1" }),
    }));
    expect(result).toMatchObject({ status: "ACTIVE", companyId: "company-1", subscriptionId: "subscription-1" });
  });

  it("refuses an amount or signup-reference mismatch without opening the activation transaction", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { service, prisma, paydunya } = setup();
    paydunya.confirmInvoice.mockResolvedValue({
      status: "completed",
      amountXof: 1,
      currency: "XOF",
      reference: "some-other-signup",
    });

    await expect(service.processPayDunyaCallback("invoice_1234")).rejects.toThrow(/ne correspondent pas/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("treats a duplicate callback for an already active signup as idempotent", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { service, paydunya, prisma } = setup({
      status: "CONFIRMED",
      signupAttempt: { id: "signup-123", status: "ACTIVE", companySlug: "atelier-diarra-12345678" },
    });

    await expect(service.processPayDunyaCallback("invoice_1234")).resolves.toMatchObject({
      status: "ACTIVE",
      idempotent: true,
    });
    expect(paydunya.confirmInvoice).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not activate on pending or failed provider status", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { service, prisma, paydunya } = setup();
    paydunya.confirmInvoice.mockResolvedValue({
      status: "pending",
      amountXof: 15000,
      currency: "XOF",
      reference: "signup-123",
    });

    await expect(service.processPayDunyaCallback("invoice_1234")).resolves.toMatchObject({ status: "PENDING" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("activates a valid invoice created before signup expiry even if the callback arrives late", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { service, tx, attempt } = setup({
      createdAt: new Date(Date.now() - 120_000),
    });
    attempt.expiresAt = new Date(Date.now() - 60_000);

    await expect(service.processPayDunyaCallback("invoice_1234")).resolves.toMatchObject({
      status: "ACTIVE",
      companyId: "company-1",
    });
    const claim = tx.signupAttempt.updateMany.mock.calls[0][0];
    expect(claim.where).not.toHaveProperty("expiresAt");
    expect(tx.company.create).toHaveBeenCalledOnce();
    expect(tx.user.create).toHaveBeenCalledOnce();
  });

  it("refuses late activation when the signup has expired", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { service, tx, attempt } = setup();
    attempt.expiresAt = new Date(Date.now() - 60_000);
    tx.signupAttempt.updateMany.mockResolvedValue({ count: 0 });
    tx.signupAttempt.findUnique.mockResolvedValue({ status: "PENDING_PAYMENT" });

    await expect(service.processPayDunyaCallback("invoice_1234")).rejects.toThrow(/a expiré/);
    expect(tx.signupAttempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ expiresAt: expect.objectContaining({ gt: expect.any(Date) }) }),
    }));
    expect(tx.company.create).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
  });
});
