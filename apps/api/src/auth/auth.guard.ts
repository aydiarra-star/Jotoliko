import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { verifyToken } from "../../../../lib/jotoliko-os/auth";
import type { AuthenticatedRequest, AuthContext } from "./auth.types";
import { RoleResolver } from "./role-resolver";

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(private readonly contexts: RoleResolver) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new UnauthorizedException();

    if (typeof header !== "string" || !header.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }

    const verification = verifyToken(header.slice("Bearer ".length).trim(), secret, Date.now());
    if (!verification.ok) {
      // « TOKEN_EXPIRE » est fréquent et bénin ; les autres cas méritent d'être
      // visibles car ils peuvent signaler une tentative de forge.
      if (verification.reason !== "TOKEN_EXPIRE") {
        this.logger.warn(`Jeton rejeté (${verification.reason}) sur ${req.method} ${req.originalUrl ?? req.url}`);
      }
      throw new UnauthorizedException();
    }

    const { claims } = verification;

    // Le jeton n'est qu'une prétention : on la confronte à la base. Le rôle est
    // re-résolu depuis l'appartenance, et le compte doit être actif. Un jeton
    // forgé, un compte désactivé ou un jeton révoqué sont donc tous refusés —
    // sans attendre l'expiration.
    const resolved = await this.contexts.resolve(claims.sub, claims.cid);
    if (!resolved || !resolved.isActive) throw new UnauthorizedException();

    if (resolved.tokenVersion !== claims.tv) {
      this.logger.warn(`Jeton révoqué utilisé par ${claims.sub}`);
      throw new UnauthorizedException();
    }

    // Le rôle porté par le jeton doit correspondre au rôle réel : un rôle retiré
    // en base invalide immédiatement les jetons encore en circulation.
    if (resolved.role !== claims.role) {
      this.logger.warn(`Rôle divergent pour ${claims.sub} : jeton=${claims.role} base=${resolved.role}`);
      throw new UnauthorizedException();
    }

    const auth: AuthContext = {
      userId: resolved.userId,
      companyId: resolved.companyId,
      role: resolved.role,
    };
    req.auth = auth;
    return true;
  }
}
