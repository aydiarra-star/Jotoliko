import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { HealthController } from "./health.controller";
import { MissionsModule } from "./missions/missions.module";
import { PrismaService } from "./prisma.service";

@Module({
  imports: [AuthModule, MissionsModule],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
