import "reflect-metadata";
import { mkdir } from "node:fs/promises";
import { Logger, ValidationPipe } from "@nestjs/common";
import { json, urlencoded } from "express";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { describeConfig, loadConfig } from "./config";
import { requestIdMiddleware } from "./common/request-id.middleware";
import { GlobalExceptionFilter } from "./common/exception.filter";
import { MAX_PROOF_BYTES } from "./proofs/proof-storage";

async function bootstrap(): Promise<void> {
  const logger = new Logger("Bootstrap");

  // La configuration est validée avant toute écoute réseau : mieux vaut ne pas
  // démarrer que servir avec un secret absent ou un CORS ouvert.
  const config = loadConfig();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });

  // L'identifiant de corrélation est posé en tout premier : une requête rejetée
  // par l'analyseur de corps doit pouvoir être reliée à sa trace, comme les
  // autres.
  app.use(requestIdMiddleware);

  // Corps JSON analysé explicitement : la limite par défaut (100 ko) refuserait
  // toute preuve photographique. Elle est calculée à partir de la taille
  // maximale acceptée, jamais choisie « large au cas où ».
  const bodyLimit = Math.ceil((MAX_PROOF_BYTES * 4) / 3) + 64 * 1024;
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: false, limit: bodyLimit }));

  // L'adresse client retenue par Express (donc par la limitation de débit et la
  // journalisation) dépend de ce réglage. À 0, aucun en-tête n'est cru.
  if (config.trustProxyHops > 0) app.set("trust proxy", config.trustProxyHops);

  // Réponses d'erreur : statut réel, jamais de trace d'exécution ni de détail
  // interne (voir apps/api/src/common/exception.filter.ts).
  app.useGlobalFilters(new GlobalExceptionFilter());

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

  // Le répertoire des preuves est préparé avant l'écoute : un volume absent ou
  // non inscriptible doit empêcher le démarrage, pas se découvrir à la première
  // livraison clôturée par un livreur.
  try {
    await mkdir(config.proofStorageDir, { recursive: true });
  } catch (error) {
    throw new Error(
      `Répertoire de preuves inutilisable (${config.proofStorageDir}) : ${(error as Error).message}`
    );
  }

  await app.listen(config.port, "0.0.0.0");
  // La configuration effective est journalisée (jamais le secret lui-même,
  // seulement sa longueur) : un incident de production se diagnostique d'abord
  // en relisant ce que le processus croyait.
  logger.log(`API Jotoliko à l'écoute : ${JSON.stringify(describeConfig(config))}`);
}

bootstrap().catch((error: unknown) => {
  // Un échec de configuration doit être visible et non silencieux.
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[FATAL] Démarrage impossible : ${message}`);
  process.exit(1);
});
