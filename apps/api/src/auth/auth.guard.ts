import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../prisma.service";
import { AuthenticatedRequest, AuthContext } from "./auth.types";

function verifyToken(token: string, secret: string): AuthContext | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [body, issued, signature] = parts;
  const expected = createHmac("sha256", secret).update(body + "." + issued).digest("hex");
  if (expected.length !== signature.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  const issuedAt = Number(issued);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > 8 * 60 * 60 * 1000) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AuthContext;
    if (!payload.userId || !payload.companyId || !payload.role) return null;
    return payload;
  } catch { return null; }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;
    const secret = process.env.AUTH_SECRET;
    if (!secret || !header?.startsWith("Bearer ")) throw new UnauthorizedException();

    const auth = verifyToken(header.slice(7), secret);
    if (!auth) throw new UnauthorizedException();

    const user = await this.prisma.user.findFirst({ where: { id: auth.userId, companyId: auth.companyId } });
    if (!user || user.role !== auth.role) throw new UnauthorizedException();
    req.auth = auth;
    return true;
  }
}
