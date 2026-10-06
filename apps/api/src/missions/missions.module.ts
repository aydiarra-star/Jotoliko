import { Module } from "@nestjs/common";
import { MissionsController } from "./missions.controller";
import { MissionsService } from "./missions.service";
import { PrismaService } from "../prisma.service";

@Module({ controllers: [MissionsController], providers: [MissionsService, PrismaService] })
export class MissionsModule {}
