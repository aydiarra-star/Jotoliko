import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { AuthenticatedRequest, AppRole } from "./auth.types";

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const required = Reflect.getMetadata("roles", context.getHandler()) as AppRole[] | undefined;
    if (!required?.length) return true;
    if (!req.auth || !required.includes(req.auth.role)) throw new ForbiddenException();
    return true;
  }
}
