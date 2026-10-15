import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createSalt, hashPassword } from "./auth.service";
import { PrismaService } from "../prisma.service";
import type { SignupDto } from "./dto/signup.dto";

const SIGNUP_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SEATS = 500;

function slugifyCompanyName(name: string): string {
  const slug = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 54);
  return slug || "entreprise";
}

@Injectable()
export class SignupService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: SignupDto) {
    if (!Number.isSafeInteger(input.seatCount) || input.seatCount < 1 || input.seatCount > MAX_SEATS) {
      throw new UnprocessableEntityException({
        code: "INVALID_SEAT_COUNT",
        message: "Le nombre de comptes opérationnels doit être compris entre 1 et 500.",
      });
    }

    const now = new Date();
    const email = input.ownerEmail.trim().toLowerCase();
    const companyName = input.companyName.trim().replace(/\s+/g, " ");
    const firstName = input.ownerFirstName.trim();
    const lastName = input.ownerLastName.trim();
    const planCode = input.planCode.trim();

    if (!companyName || !firstName || !lastName) {
      throw new UnprocessableEntityException("Les informations obligatoires sont incomplètes.");
    }

    const price = await this.prisma.planPrice.findFirst({
      where: {
        code: planCode,
        isActive: true,
        currency: "XOF",
        effectiveFrom: { lte: now },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
      },
      orderBy: { version: "desc" },
      select: { id: true, code: true, version: true, currency: true, unitPriceXof: true },
    });

    if (!price || !Number.isSafeInteger(price.unitPriceXof * input.seatCount)) {
      throw new ServiceUnavailableException({
        code: "PRICE_NOT_CONFIGURED",
        message: "Cette offre n'est pas disponible. Aucun compte ni paiement n'a été créé.",
      });
    }

    const [existingUser, existingCompany, pendingAttempt] = await Promise.all([
      this.prisma.user.findUnique({ where: { email }, select: { id: true } }),
      this.prisma.company.findUnique({
        where: { slug: slugifyCompanyName(companyName) },
        select: { id: true },
      }),
      this.prisma.signupAttempt.findFirst({
        where: { ownerEmail: email, status: "PENDING_PAYMENT", expiresAt: { gt: now } },
        select: { id: true },
      }),
    ]);

    if (existingUser) {
      throw new ConflictException({
        code: "EMAIL_ALREADY_REGISTERED",
        message: "Cette adresse est déjà associée à un compte. Connectez-vous ou utilisez une autre adresse.",
      });
    }
    if (existingCompany) {
      throw new ConflictException({
        code: "COMPANY_SLUG_UNAVAILABLE",
        message: "Le nom d'entreprise est déjà utilisé. Choisissez un nom distinct.",
      });
    }
    if (pendingAttempt) {
      throw new ConflictException({
        code: "SIGNUP_ALREADY_PENDING",
        message: "Une inscription est déjà en cours pour cette adresse. Reprenez-la ou attendez son expiration.",
        signupAttemptId: pendingAttempt.id,
      });
    }

    const salt = createSalt();
    const passwordHash = hashPassword(input.password, salt);
    const expiresAt = new Date(now.getTime() + SIGNUP_TTL_MS);
    const slugBase = slugifyCompanyName(companyName);
    // A unique suffix prevents two concurrent attempts for similarly named companies
    // from colliding before a real company record is created.
    const companySlug = `${slugBase}-${randomUUID().slice(0, 8)}`;

    try {
      const attempt = await this.prisma.signupAttempt.create({
        data: {
          companyName,
          companySlug,
          ownerEmail: email,
          ownerFirstName: firstName,
          ownerLastName: lastName,
          passwordHash,
          passwordSalt: salt,
          seatCount: input.seatCount,
          planPriceId: price.id,
          expiresAt,
        },
        select: { id: true, status: true, expiresAt: true, createdAt: true },
      });

      return {
        signupAttemptId: attempt.id,
        status: attempt.status,
        expiresAt: attempt.expiresAt,
        createdAt: attempt.createdAt,
        pricing: {
          planCode: price.code,
          planVersion: price.version,
          currency: price.currency,
          unitPriceXof: price.unitPriceXof,
          seatCount: input.seatCount,
          monthlyAmountXof: price.unitPriceXof * input.seatCount,
        },
        nextStep: "PAYMENT_PROVIDER_NOT_CONFIGURED",
        message: "Inscription enregistrée. Aucun compte opérationnel n'est activé avant confirmation serveur du paiement.",
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({
          code: "SIGNUP_CONFLICT",
          message: "Une inscription similaire vient d'être créée. Reprenez le parcours existant.",
        });
      }
      throw error;
    }
  }
}
