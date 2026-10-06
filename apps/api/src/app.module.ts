import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthGuard } from "./auth/auth.guard";
import { AuthModule } from "./auth/auth.module";
import { HealthController } from "./health.controller";
import { MissionsModule } from "./missions/missions.module";
import { PrismaService } from "./prisma.service";

@Module({
  imports: [AuthModule, MissionsModule],
  controllers: [HealthController],
  providers: [PrismaService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
