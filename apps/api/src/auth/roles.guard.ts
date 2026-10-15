import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { isAllowed, type AppRole, type Permission } from "../../../../lib/jotoliko-os/core";
import { ROLES_KEY } from "./roles.decorator";
import type { AuthenticatedRequest } from "./auth.types";

export const PERMISSION_KEY = "jotoliko:permission";

/** Exige une permission nommée définie dans la matrice centrale. */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.auth) throw new ForbiddenException();

    // La matrice de permissions (lib/jotoliko-os/core.ts) est la seule source de
    // vérité : ce garde ne fait que la consulter.
    const permission = this.reflector.getAllAndOverride<Permission>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (permission && !isAllowed(req.auth.role, permission)) throw new ForbiddenException();

    const required = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required?.length && !required.includes(req.auth.role)) throw new ForbiddenException();

    return true;
  }
}
