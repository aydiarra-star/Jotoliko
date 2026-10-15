import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { isAppRole, type AppRole } from "../../../../lib/jotoliko-os/core";
import { PrismaService } from "../prisma.service";

export type ResolvedContext = {
  userId: string;
  companyId: string;
  role: AppRole;
  tokenVersion: number;
  isActive: boolean;
};

/**
 * Résout le contexte d'autorisation d'un utilisateur dans une entreprise.
 *
 * Le modèle de données porte le rôle sur l'appartenance (`Membership` → `Role`),
 * pas sur l'utilisateur : un même compte peut être responsable dans une
 * entreprise et simple lecteur dans une autre. Le rôle est donc **toujours**
 * dérivé de la table d'appartenance, jamais cru sur parole depuis le jeton.
 */
@Injectable()
export class RoleResolver {
  private readonly logger = new Logger(RoleResolver.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolve(userId: string, companyId: string): Promise<ResolvedContext | null> {
    const membership = await this.prisma.membership.findFirst({ where: { userId, companyId } });
    if (!membership) return null;

    const role = await this.prisma.role.findUnique({ where: { id: membership.roleId } });
    if (!role || !isAppRole(role.code)) {
      this.logger.error(`Rôle inconnu ${role?.code ?? "(absent)"} pour l'appartenance ${membership.id}`);
      return null;
    }

    const user = await this.prisma.user.findFirst({ where: { id: userId } });
    if (!user) return null;

    return {
      userId: user.id,
      companyId,
      role: role.code,
      tokenVersion: user.tokenVersion,
      isActive: user.isActive,
    };
  }

  async require(userId: string, companyId: string): Promise<ResolvedContext> {
    const context = await this.resolve(userId, companyId);
    if (!context || !context.isActive) throw new UnauthorizedException();
    return context;
  }
}
