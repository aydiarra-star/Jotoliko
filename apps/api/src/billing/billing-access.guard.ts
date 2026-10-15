import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import type { AuthenticatedRequest } from "../auth/auth.types";

/**
 * Optional server-side subscription gate for paid operational routes.
 *
 * It is deliberately opt-in until pricing, migration rollout and customer
 * communication are approved. When enabled, the check fails closed: no
 * subscription or an expired period cannot access paid operations.
 */
@Injectable()
export class BillingAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.JOTOLIKO_BILLING_ENFORCEMENT_ENABLED !== "true") return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const companyId = req.auth?.companyId;
    if (!companyId) throw new ForbiddenException({ code: "SUBSCRIPTION_REQUIRED_OR_EXPIRED" });

    const subscription = await this.prisma.subscription.findFirst({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      select: {
        status: true,
        currentPeriodEnd: true,
        gracePeriodEndsAt: true,
      },
    });
    const now = Date.now();
    const activePeriodValid =
      subscription?.status === "ACTIVE" &&
      subscription.currentPeriodEnd !== null &&
      subscription.currentPeriodEnd !== undefined &&
      subscription.currentPeriodEnd.getTime() > now;
    const gracePeriodValid =
      subscription?.status === "GRACE_PERIOD" &&
      subscription.gracePeriodEndsAt !== null &&
      subscription.gracePeriodEndsAt !== undefined &&
      subscription.gracePeriodEndsAt.getTime() > now;

    if (!activePeriodValid && !gracePeriodValid) {
      throw new ForbiddenException({ code: "SUBSCRIPTION_REQUIRED_OR_EXPIRED" });
    }
    return true;
  }
}
