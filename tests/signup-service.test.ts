import { describe, expect, it, vi } from "vitest";
import { SignupService } from "../apps/api/src/auth/signup.service";
import type { PrismaService } from "../apps/api/src/prisma.service";

function makeService() {
  const prisma = {
    planPrice: { findFirst: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValue(null) },
    billingPayment: { findFirst: vi.fn().mockResolvedValue(null) },
    signupAttempt: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({
        id: "attempt-uuid",
        status: "PENDING_PAYMENT",
        expiresAt: new Date("2026-10-17T00:00:00.000Z"),
        createdAt: new Date("2026-10-16T00:00:00.000Z"),
      }),
    },
  };
  return { service: new SignupService(prisma as unknown as PrismaService), prisma };
}

const validInput = {
  companyName: "  Atelier Diarra  ",
  ownerEmail: " OWNER@EXAMPLE.COM ",
  ownerFirstName: " Awa ",
  ownerLastName: " Diarra ",
  password: "a-long-password-123",
  planCode: "PRO",
  seatCount: 3,
};

describe("SignupService", () => {
  it("refuse de créer une tentative si aucun tarif actif n'est configuré", async () => {
    const { service, prisma } = makeService();
    prisma.planPrice.findFirst.mockResolvedValue(null);

    await expect(service.create(validInput)).rejects.toMatchObject({
      status: 503,
      response: { code: "PRICE_NOT_CONFIGURED" },
    });
    expect(prisma.signupAttempt.create).not.toHaveBeenCalled();
  });

  it("enregistre une tentative en attente sans créer d'entreprise ni activer de compte", async () => {
    const { service, prisma } = makeService();
    prisma.planPrice.findFirst.mockResolvedValue({
      id: "price-id",
      code: "PRO",
      version: 2,
      currency: "XOF",
      unitPriceXof: 5000,
    });

    const result = await service.create(validInput);

    expect(prisma.signupAttempt.create).toHaveBeenCalledOnce();
    const call = prisma.signupAttempt.create.mock.calls[0][0];
    expect(call.data.ownerEmail).toBe("owner@example.com");
    expect(call.data.companyName).toBe("Atelier Diarra");
    expect(call.data.status).toBeUndefined(); // database default is PENDING_PAYMENT
    expect(call.data.passwordHash).not.toBe(validInput.password);
    expect(call.data.passwordSalt).toBeTruthy();
    expect(call.data.resumeTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.resumeToken).toMatch(/^[a-f0-9]{64}$/);
    expect(call.data.resumeTokenHash).not.toBe(result.resumeToken);
    expect(result.status).toBe("PENDING_PAYMENT");
    expect(result.pricing.monthlyAmountXof).toBe(15000);
    expect(result.nextStep).toBe("START_CHECKOUT");
    expect(prisma.user.findUnique).toHaveBeenCalledOnce();
  });

  it("rejette une inscription lorsque l'adresse appartient déjà à un utilisateur", async () => {
    const { service, prisma } = makeService();
    prisma.planPrice.findFirst.mockResolvedValue({
      id: "price-id",
      code: "PRO",
      version: 1,
      currency: "XOF",
      unitPriceXof: 5000,
    });
    prisma.user.findUnique.mockResolvedValue({ id: "existing-user" });

    await expect(service.create(validInput)).rejects.toMatchObject({
      response: { code: "EMAIL_ALREADY_REGISTERED" },
    });
    expect(prisma.signupAttempt.create).not.toHaveBeenCalled();
  });

  it("reprend une tentative uniquement avec le jeton secret correspondant", async () => {
    const { service, prisma } = makeService();
    prisma.signupAttempt.findFirst.mockResolvedValue(null);

    await expect(service.resume("attempt-uuid", "a".repeat(64))).rejects.toMatchObject({
      response: { code: "SIGNUP_RESUME_INVALID" },
    });
    expect(prisma.signupAttempt.update).not.toHaveBeenCalled();
  });


  it("modifie une inscription en attente uniquement avec le jeton et un tarif serveur", async () => {
    const { service, prisma } = makeService();
    const token = "b".repeat(64);
    prisma.signupAttempt.findFirst.mockResolvedValue({
      id: "attempt-uuid",
      status: "PENDING_PAYMENT",
      expiresAt: new Date(Date.now() + 60_000),
      companyName: "Atelier Diarra",
      seatCount: 3,
      planPriceId: "old-price",
      planPrice: { id: "old-price", code: "PRO", version: 1, currency: "XOF", unitPriceXof: 4000 },
    } as never);
    prisma.planPrice.findFirst.mockResolvedValue({
      id: "new-price",
      code: "PRO",
      version: 2,
      currency: "XOF",
      unitPriceXof: 5000,
    });

    const result = await service.updatePending("attempt-uuid", token, { seatCount: 4, resumeToken: token });

    expect(prisma.signupAttempt.update).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "attempt-uuid",
        status: "PENDING_PAYMENT",
        expiresAt: expect.objectContaining({ gt: expect.any(Date) }),
        resumeTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      data: expect.objectContaining({
        seatCount: 4,
        planPrice: { connect: { id: "new-price" } },
      }),
    }));
    expect(result.pricing.monthlyAmountXof).toBe(20000);
    expect(result.nextStep).toBe("START_CHECKOUT");
  });

  it("verrouille les paramètres dès qu'une facture est en attente", async () => {
    const { service, prisma } = makeService();
    const token = "b".repeat(64);
    prisma.signupAttempt.findFirst.mockResolvedValue({
      id: "attempt-uuid",
      status: "PENDING_PAYMENT",
      expiresAt: new Date(Date.now() + 60_000),
      companyName: "Atelier Diarra",
      seatCount: 3,
      planPriceId: "price-id",
      planPrice: { id: "price-id", code: "PRO", version: 1, currency: "XOF", unitPriceXof: 5000 },
    } as never);
    prisma.billingPayment.findFirst.mockResolvedValue({ id: "payment-id" });

    await expect(service.updatePending("attempt-uuid", token, {
      seatCount: 4,
      resumeToken: token,
    })).rejects.toMatchObject({
      response: { code: "SIGNUP_CHECKOUT_ALREADY_STARTED" },
    });
    expect(prisma.signupAttempt.update).not.toHaveBeenCalled();
  });

  it("ne modifie pas une inscription si le jeton est invalide", async () => {
    const { service, prisma } = makeService();
    prisma.signupAttempt.findFirst.mockResolvedValue(null);

    await expect(service.updatePending("attempt-uuid", "c".repeat(64), {
      seatCount: 4,
      resumeToken: "c".repeat(64),
    })).rejects.toMatchObject({ response: { code: "SIGNUP_RESUME_INVALID" } });
    expect(prisma.signupAttempt.update).not.toHaveBeenCalled();
  });

  it("renvoie l'état et le tarif lors d'une reprise autorisée", async () => {
    const { service, prisma } = makeService();
    const token = "a".repeat(64);
    const { createHash } = await import("node:crypto");
    prisma.signupAttempt.findFirst.mockResolvedValue({
      id: "attempt-uuid",
      status: "PENDING_PAYMENT",
      expiresAt: new Date(Date.now() + 60_000),
      companyName: "Atelier Diarra",
      ownerEmail: "owner@example.com",
      ownerFirstName: "Awa",
      ownerLastName: "Diarra",
      seatCount: 3,
      planPrice: { code: "PRO", version: 2, currency: "XOF", unitPriceXof: 5000 },
    } as never);

    const result = await service.resume("attempt-uuid", token);
    expect(prisma.signupAttempt.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "attempt-uuid",
        resumeTokenHash: createHash("sha256").update(token, "utf8").digest("hex"),
      },
    }));
    expect(result.pricing.monthlyAmountXof).toBe(15000);
    expect(result.nextStep).toBe("START_CHECKOUT");
  });
  
  it("refuse les tarifs nuls ou négatifs avant de créer une inscription", async () => {
    for (const unitPriceXof of [0, -100]) {
      const { service, prisma } = makeService();
      prisma.planPrice.findFirst.mockResolvedValue({
        id: "invalid-price",
        code: "PRO",
        version: 1,
        currency: "XOF",
        unitPriceXof,
      });

      await expect(service.create(validInput)).rejects.toMatchObject({
        status: 503,
        response: { code: "PRICE_NOT_CONFIGURED" },
      });
      expect(prisma.signupAttempt.create).not.toHaveBeenCalled();
    }
  });
});
