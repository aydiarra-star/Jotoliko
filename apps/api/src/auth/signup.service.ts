import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createSalt, hashPassword } from "./auth.service";
import { PrismaService } from "../prisma.service";
import type { SignupDto } from "./dto/signup.dto";
import type { UpdateSignupDto } from "./dto/update-signup.dto";

const SIGNUP_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SEATS = 500;

function hashResumeToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

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

    const [existingUser, pendingAttempt] = await Promise.all([
      this.prisma.user.findUnique({ where: { email }, select: { id: true } }),
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
    if (pendingAttempt) {
      throw new ConflictException({
        code: "SIGNUP_ALREADY_PENDING",
        message: "Une inscription est déjà en cours pour cette adresse. Reprenez-la ou attendez son expiration.",
        signupAttemptId: pendingAttempt.id,
      });
    }

    const salt = createSalt();
    const passwordHash = hashPassword(input.password, salt);
    const resumeToken = randomBytes(32).toString("hex");
    const resumeTokenHash = hashResumeToken(resumeToken);
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
          resumeTokenHash,
          seatCount: input.seatCount,
          planPriceId: price.id,
          expiresAt,
        },
        select: { id: true, status: true, expiresAt: true, createdAt: true },
      });

      return {
        signupAttemptId: attempt.id,
        // Jeton secret renvoyé une seule fois. L’empreinte seule est conservée.
        resumeToken,
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
  /**
   * Modifie la configuration d'une tentative en attente, uniquement avec le jeton
   * secret. Le tarif est recalculé côté serveur ; aucun paiement n'est déclenché.
   */
  async updatePending(signupAttemptId: string, resumeToken: string, input: UpdateSignupDto) {
    if (input.seatCount !== undefined &&
        (!Number.isSafeInteger(input.seatCount) || input.seatCount < 1 || input.seatCount > MAX_SEATS)) {
      throw new UnprocessableEntityException({
        code: "INVALID_SEAT_COUNT",
        message: "Le nombre de comptes opérationnels doit être compris entre 1 et 500.",
      });
    }

    if (input.companyName === undefined && input.planCode === undefined && input.seatCount === undefined) {
      throw new UnprocessableEntityException({
        code: "EMPTY_SIGNUP_UPDATE",
        message: "Indiquez au moins une valeur à modifier.",
      });
    }

    const now = new Date();
    const tokenHash = hashResumeToken(resumeToken);
    const attempt = await this.prisma.signupAttempt.findFirst({
      where: { id: signupAttemptId, resumeTokenHash: tokenHash },
      select: {
        id: true, status: true, expiresAt: true, companyName: true,
        seatCount: true, planPriceId: true, planPrice: {
          select: { id: true, code: true, version: true, currency: true, unitPriceXof: true },
        },
      },
    });

    if (!attempt) {
      throw new ConflictException({
        code: "SIGNUP_RESUME_INVALID",
        message: "Lien de reprise invalide ou indisponible.",
      });
    }
    if (attempt.status !== "PENDING_PAYMENT") {
      throw new ConflictException({
        code: "SIGNUP_NOT_EDITABLE",
        message: "Cette inscription n'est plus modifiable.",
      });
    }
    if (attempt.expiresAt <= now) {
      await this.prisma.signupAttempt.updateMany({
        where: { id: attempt.id, status: "PENDING_PAYMENT", expiresAt: { lte: now } },
        data: { status: "EXPIRED" },
      });
      throw new ConflictException({
        code: "SIGNUP_EXPIRED",
        message: "Cette inscription a expiré. Recommencez le parcours.",
      });
    }

    const seatCount = input.seatCount ?? attempt.seatCount;
    const companyName = input.companyName === undefined
      ? attempt.companyName
      : input.companyName.trim().replace(/\\s+/g, " ");
    const planCode = input.planCode?.trim() ?? attempt.planPrice.code;
    if (!companyName) {
      throw new UnprocessableEntityException({
        code: "INVALID_COMPANY_NAME",
        message: "Le nom de l'entreprise ne peut pas être vide.",
      });
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
    if (!price || !Number.isSafeInteger(price.unitPriceXof * seatCount)) {
      throw new ServiceUnavailableException({
        code: "PRICE_NOT_CONFIGURED",
        message: "Cette offre n'est pas disponible. Aucun paiement n'a été déclenché.",
      });
    }

    const data: Prisma.SignupAttemptUpdateManyMutationInput = {
      companyName,
      seatCount,
      planPriceId: price.id,
    };
    if (input.companyName !== undefined) {
      data.companySlug = `${slugifyCompanyName(companyName)}-${randomUUID().slice(0, 8)}`;
    }

    const changed = await this.prisma.signupAttempt.updateMany({
      where: {
        id: attempt.id,
        resumeTokenHash: tokenHash,
        status: "PENDING_PAYMENT",
        expiresAt: { gt: now },
      },
      data,
    });
    if (changed.count !== 1) {
      throw new ConflictException({
        code: "SIGNUP_NOT_EDITABLE",
        message: "Cette inscription a changé d'état. Rechargez son état avant de continuer.",
      });
    }

    return {
      signupAttemptId: attempt.id,
      status: "PENDING_PAYMENT" as const,
      expiresAt: attempt.expiresAt,
      companyName,
      pricing: {
        planCode: price.code,
        planVersion: price.version,
        currency: price.currency,
        unitPriceXof: price.unitPriceXof,
        seatCount,
        monthlyAmountXof: price.unitPriceXof * seatCount,
      },
      nextStep: "PAYMENT_PROVIDER_NOT_CONFIGURED" as const,
      message: "Configuration mise à jour. Aucun paiement ni compte opérationnel n'a été créé.",
    };
  }

  /**
   * Reprise par jeton secret à haute entropie. L'identifiant seul ne suffit pas.
   * Les tentatives expirées sont marquées sans supprimer l'historique.
   */
  async resume(signupAttemptId: string, resumeToken: string) {
    const tokenHash = hashResumeToken(resumeToken);
    const attempt = await this.prisma.signupAttempt.findFirst({
      where: { id: signupAttemptId, resumeTokenHash: tokenHash },
      include: {
        planPrice: {
          select: { code: true, version: true, currency: true, unitPriceXof: true },
        },
      },
    });

    if (!attempt) {
      throw new ConflictException({
        code: "SIGNUP_RESUME_INVALID",
        message: "Lien de reprise invalide ou indisponible.",
      });
    }

    if (attempt.status === "PENDING_PAYMENT" && attempt.expiresAt <= new Date()) {
      await this.prisma.signupAttempt.update({
        where: { id: attempt.id },
        data: { status: "EXPIRED" },
      });
      throw new ConflictException({
        code: "SIGNUP_EXPIRED",
        message: "Cette inscription a expiré. Recommencez le parcours.",
      });
    }

    return {
      signupAttemptId: attempt.id,
      status: attempt.status,
      expiresAt: attempt.expiresAt,
      companyName: attempt.companyName,
      ownerEmail: attempt.ownerEmail,
      ownerFirstName: attempt.ownerFirstName,
      ownerLastName: attempt.ownerLastName,
      pricing: {
        planCode: attempt.planPrice.code,
        planVersion: attempt.planPrice.version,
        currency: attempt.planPrice.currency,
        unitPriceXof: attempt.planPrice.unitPriceXof,
        seatCount: attempt.seatCount,
        monthlyAmountXof: attempt.planPrice.unitPriceXof * attempt.seatCount,
      },
      nextStep: attempt.status === "PENDING_PAYMENT"
        ? "PAYMENT_PROVIDER_NOT_CONFIGURED"
        : "CONTACT_SUPPORT",
    };
  }

}
