// Configuration de l'API — lue une seule fois, validée au démarrage.
//
// Principe : un serveur mal configuré doit refuser de démarrer, pas se lancer en
// mode dégradé silencieux. C'est particulièrement important pour AUTH_SECRET et
// CORS_ORIGIN : une valeur par défaut permissive en production annulerait toutes
// les protections d'authentification.

import { join } from "node:path";

export type AppConfig = {
  port: number;
  databaseUrl: string;
  authSecret: string;
  corsOrigins: string[];
  isProduction: boolean;
  /**
   * Nombre de proxies de confiance devant l'API (0 = aucune).
   *
   * Ce réglage conditionne deux choses réelles : l'adresse retenue pour la
   * limitation de débit et l'IP journalisée. À 0, l'en-tête `X-Forwarded-For`
   * est ignoré (impossible à falsifier par un client direct) — mais derrière un
   * répartiteur, tous les utilisateurs partagent alors le quota d'une seule IP,
   * ce qui transforme la limite de 5 connexions/minute en panne à l'échelle d'un
   * bureau. Le déploiement DOIT donc fixer cette valeur au nombre de proxies
   * réels, et l'API ne doit jamais être joignable directement dans ce cas.
   */
  trustProxyHops: number;
  /**
   * Répertoire persistant des preuves de livraison.
   *
   * En production, la valeur est obligatoire : un chemin par défaut ferait
   * écrire des pièces justificatives dans le système de fichiers éphémère du
   * conteneur, ce qui les perdrait à chaque redéploiement. En développement, un
   * chemin local est employé.
   */
  proofStorageDir: string;
};

/** Plage acceptée pour TRUST_PROXY_HOPS : au-delà, la valeur est une erreur. */
const MAX_TRUST_PROXY_HOPS = 10;

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

  const trustProxyHops = Number(env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > MAX_TRUST_PROXY_HOPS) {
    throw new ConfigError(
      `TRUST_PROXY_HOPS invalide : ${env.TRUST_PROXY_HOPS} (entier entre 0 et ${MAX_TRUST_PROXY_HOPS} attendu)`
    );
  }

  const rawProofStorageDir = env.PROOF_STORAGE_DIR?.trim();
  if (isProduction && !rawProofStorageDir) {
    throw new ConfigError(
      "PROOF_STORAGE_DIR est obligatoire en production : les preuves de livraison doivent être écrites sur un volume persistant"
    );
  }
  const proofStorageDir = rawProofStorageDir || join(process.cwd(), "var", "proofs");

  return { port, databaseUrl, authSecret, corsOrigins, isProduction, trustProxyHops, proofStorageDir };
}

export function describeConfig(config: AppConfig): Record<string, unknown> {
  // N'expose jamais un secret, même partiellement.
  return {
    port: config.port,
    corsOrigins: config.corsOrigins,
    isProduction: config.isProduction,
    trustProxyHops: config.trustProxyHops,
    proofStorageDir: config.proofStorageDir,
    authSecret: `[${config.authSecret.length} caractères]`,
  };
}
