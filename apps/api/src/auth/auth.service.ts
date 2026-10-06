import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../prisma.service";
import { AppRole } from "./auth.types";

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(companyId: string, email: string, password: string) {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("AUTH_SECRET manquant");
    const users = await this.prisma.user.findMany({ where: { companyId, email }, take: 1 });
    for (const user of users) {
      if (!user.passwordHash || !user.passwordSalt) continue;
      const actual = hashPassword(password, user.passwordSalt);
      if (actual.length !== user.passwordHash.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(user.passwordHash))) continue;
      const body = Buffer.from(JSON.stringify({ userId: user.id, companyId: user.companyId, role: user.role as AppRole })).toString("base64url");
      const issued = String(Date.now());
      const signature = createHmac("sha256", secret).update(body + "." + issued).digest("hex");
      return { accessToken: body + "." + issued + "." + signature, user: { id: user.id, name: user.name, email: user.email, role: user.role, companyId: user.companyId } };
    }
    throw new UnauthorizedException("Identifiants invalides");
  }
}
