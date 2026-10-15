import { describe, expect, it, vi } from "vitest";
import { ServiceUnavailableException } from "@nestjs/common";
import { SignupService } from "../apps/api/src/auth/signup.service";
import type { PrismaService } from "../apps/api/src/prisma.service";

function makeService() {
  const prisma = {
    planPrice: { findFirst: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValue(null) },
    company: { findUnique: vi.fn().mockResolvedValue(null) },
    signupAttempt: {
      findFirst: vi.fn().mockResolvedValue(null),
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

    await expect(service.create(validInput)).rejects.toBeInstanceOf(ServiceUnavailableException);
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
    expect(result.status).toBe("PENDING_PAYMENT");
    expect(result.pricing.monthlyAmountXof).toBe(15000);
    expect(result.nextStep).toBe("PAYMENT_PROVIDER_NOT_CONFIGURED");
    expect(prisma.company.findUnique).toHaveBeenCalledOnce();
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
});
