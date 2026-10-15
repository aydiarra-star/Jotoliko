import "reflect-metadata";
import { ValidationPipe, Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { loadConfig } from "./config";
import { requestIdMiddleware } from "./common/request-id.middleware";

async function bootstrap(): Promise<void> {
  const logger = new Logger("Bootstrap");

  // La configuration est validée avant toute écoute réseau : mieux vaut ne pas
  // démarrer que servir avec un secret absent ou un CORS ouvert.
  const config = loadConfig();

  const app = await NestFactory.create(AppModule, { bodyParser: true });

  app.use(requestIdMiddleware);

  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"],
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // `whitelist` + `forbidNonWhitelisted` suppriment les propriétés non
      // déclarées au lieu de les laisser atteindre les services.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Rejette un corps qui ne correspond à aucun DTO connu.
      forbidUnknownValues: true,
      validationError: { target: false, value: false },
    })
  );

  // Empêche les proxies de mettre en cache des réponses authentifiées.
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });

  app.enableShutdownHooks();

  await app.listen(config.port, "0.0.0.0");
  logger.log(`API Jotoliko à l'écoute sur le port ${config.port}`);
}

bootstrap().catch((error: unknown) => {
  // Un échec de configuration doit être visible et non silencieux.
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[FATAL] Démarrage impossible : ${message}`);
  process.exit(1);
});
