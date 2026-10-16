import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { encodeToken } from "../../../../lib/jotoliko-os/auth";
import type { AppRole } from "../../../../lib/jotoliko-os/core";
import { PrismaService } from "../prisma.service";
import { RoleResolver } from "./role-resolver";

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export function createSalt(): string {
  return randomBytes(16).toString("hex");
}

/** Compare deux empreintes hexadécimales en temps constant. */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export type LoginResult = {
  accessToken: string;
  user: { id: string; name: string; email: string; role: AppRole; companyId: string };
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RoleResolver
  ) {}

  /**
   * Authentifie un utilisateur et l'enferme dans le périmètre d'une entreprise.
   *
   * Le message d'échec est unique pour tous les cas : révéler « cette entreprise
   * n'existe pas » ou « ce compte est inactif » transformerait cet endpoint en
   * énumérateur de comptes et d'entreprises.
   */
  async login(company: string, email: string, password: string, ip?: string): Promise<LoginResult> {
    const invalid = () => new UnauthorizedException("Identifiants invalides");
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("AUTH_SECRET manquant");

    const user = await this.prisma.user.findFirst({ where: { email } });
    if (!user || !user.isActive) {
      this.logger.warn(`Connexion refusée pour ${email} (${ip ?? "ip inconnue"})`);
      throw invalid();
    }

    // Le mot de passe est vérifié AVANT le contrôle d'appartenance : sans cela,
    // l'endpoint révélerait quelles entreprises existent.
    const actual = hashPassword(password, user.passwordSalt);
    if (!safeEqualHex(actual, user.passwordHash)) {
      this.logger.warn(`Mot de passe invalide pour ${email}`);
      throw invalid();
    }

    const companyId = await this.resolveCompanyId(user.id, company);
    if (!companyId) {
      this.logger.warn(`Aucune appartenance de ${email} dans ${company}`);
      throw invalid();
    }

    // Le rôle provient de l'appartenance, jamais du client.
    const context = await this.roles.require(user.id, companyId);

    const accessToken = encodeToken(
      secret,
      { sub: user.id, cid: companyId, role: context.role, tv: context.tokenVersion },
      Date.now()
    );

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    return {
      accessToken,
      user: {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        role: context.role,
        companyId,
      },
    };
  }

  /** Retrouve l'entreprise par identifiant ou par slug, parmi les appartenances. */
  private async resolveCompanyId(userId: string, company: string): Promise<string | null> {
    const memberships = await this.prisma.membership.findMany({ where: { userId } });
    if (memberships.length === 0) return null;

    const direct = memberships.find((m) => m.companyId === company);
    if (direct) return direct.companyId;

    const matches = await this.prisma.company.findMany({
      where: { id: { in: memberships.map((m) => m.companyId) }, slug: company },
    });
    return matches[0]?.id ?? null;
  }
}
