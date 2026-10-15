import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log("Connexion PostgreSQL établie");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Sonde de disponibilité utilisée par /health/ready. */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error(`Sonde base de données en échec : ${(error as Error).message}`);
      return false;
    }
  }
}
