// Configuration de l'API — lue une seule fois, validée au démarrage.
//
// Principe : un serveur mal configuré doit refuser de démarrer, pas se lancer en
// mode dégradé silencieux. C'est particulièrement important pour AUTH_SECRET et
// CORS_ORIGIN : une valeur par défaut permissive en production annulerait toutes
// les protections d'authentification.

export type AppConfig = {
  port: number;
  databaseUrl: string;
  authSecret: string;
  corsOrigins: string[];
  isProduction: boolean;
};

class ConfigError extends Error {}

function requireEnv(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new ConfigError(`Variable d'environnement manquante : ${name}`);
  return trimmed;
}

/** Secrets trop courts : cassables par force brute, donc refusés. */
const MIN_SECRET_LENGTH = 32;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const isProduction = env.NODE_ENV === "production";

  const databaseUrl = requireEnv("DATABASE_URL", env.DATABASE_URL);
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    throw new ConfigError("DATABASE_URL doit être une URL PostgreSQL");
  }

  const authSecret = requireEnv("AUTH_SECRET", env.AUTH_SECRET);
  if (authSecret.length < MIN_SECRET_LENGTH) {
    throw new ConfigError(`AUTH_SECRET doit contenir au moins ${MIN_SECRET_LENGTH} caractères`);
  }
  const weakDefaults = ["change-me-in-staging", "changez-moi", "secret", "changeme"];
  if (isProduction && weakDefaults.some((w) => authSecret.toLowerCase().includes(w))) {
    throw new ConfigError("AUTH_SECRET est resté à une valeur d'exemple : refuse de démarrer en production");
  }

  const rawOrigins = env.CORS_ORIGIN?.trim();
  if (!rawOrigins) {
    // Pas de repli permissif : sans liste explicite, aucune origine navigateur
    // n'est autorisée. Un client doit configurer CORS_ORIGIN consciemment.
    throw new ConfigError("CORS_ORIGIN doit lister explicitement les origines autorisées");
  }
  const corsOrigins = rawOrigins
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (corsOrigins.length === 0) throw new ConfigError("CORS_ORIGIN est vide");
  if (isProduction && corsOrigins.includes("*")) {
    throw new ConfigError("CORS_ORIGIN ne peut pas valoir * en production");
  }

  const port = Number(env.PORT ?? 4000);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new ConfigError(`PORT invalide : ${env.PORT}`);
  }

  return { port, databaseUrl, authSecret, corsOrigins, isProduction };
}

export function describeConfig(config: AppConfig): Record<string, unknown> {
  // N'expose jamais un secret, même partiellement.
  return {
    port: config.port,
    corsOrigins: config.corsOrigins,
    isProduction: config.isProduction,
    authSecret: `[${config.authSecret.length} caractères]`,
  };
}
