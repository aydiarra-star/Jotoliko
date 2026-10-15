import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module";
import { HealthController } from "./health.controller";
import { MissionsModule } from "./missions/missions.module";
import { PrismaModule } from "./prisma.module";

@Module({
  imports: [
    // Garde-fou global : toute route est limitée par défaut, et les endpoints
    // sensibles resserrent la limite via @Throttle.
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    MissionsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
