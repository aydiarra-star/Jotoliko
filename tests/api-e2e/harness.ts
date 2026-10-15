// Harnais des tests HTTP de bout en bout.
//
// Doctrine : l'API est démarrée **telle qu'elle est livrée** — le processus
// `node apps/api/dist/apps/api/src/main.js`, celui que `npm start` lance — sur une
// vraie base PostgreSQL, puis interrogée par de vraies requêtes HTTP.
//
// Aucun contrôleur, garde, pipe, service ou requête n'est remplacé par une
// imitation. C'est justement l'intégration qui est testée ici : enchaînement
// garde d'authentification → garde de permissions → pipe de validation →
// service → Prisma → SQL → contraintes de la base. Un test qui remplacerait ces
// couches validerait le harnais, pas le produit.
//
// Conséquence assumée : ces tests exigent un PostgreSQL réel et un moteur Prisma,
// donc ils s'exécutent en CI (service `postgres:16`). Sans `DATABASE_URL`, la
// suite est ignorée explicitement — jamais silencieusement.

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID, scryptSync } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe } from "vitest";
import type { AppRole, MissionStatus, TruthStatus } from "../../lib/jotoliko-os/core";
import { PgClient, type SqlClient } from "../reality/sql-client";

export type { SqlClient };

export const REPO_ROOT = join(__dirname, "..", "..");
export const API_ENTRYPOINT = join(REPO_ROOT, "apps/api/dist/apps/api/src/main.js");
const MIGRATIONS_DIR = join(REPO_ROOT, "prisma/migrations");

/** Le secret de test fait 48 caractères : la configuration refuse moins de 32. */
export const TEST_AUTH_SECRET = "jotoliko-e2e-secret-0123456789-abcdefghijklmnop";
export const TEST_CORS_ORIGIN = "https://ops.jotoliko.test";
export const DEFAULT_PASSWORD = "MotDePasse-E2E-1234";

/** Vrai si une base PostgreSQL est fournie : condition d'exécution de la suite. */
export const E2E_ENABLED = Boolean(process.env.DATABASE_URL);

if (!E2E_ENABLED) {
  // Visible volontairement : une suite ignorée doit être annoncée, sinon une CI
  // sans base donnerait l'illusion de tests passés.
  console.warn(
    "[api-e2e] DATABASE_URL absent : les tests HTTP ne peuvent pas s'exécuter ici. " +
      "Ils s'exécutent en CI sur PostgreSQL 16 (job « e2e » du workflow API)."
  );
} else if (!existsSync(API_ENTRYPOINT)) {
  // Ici on échoue au lieu d'ignorer : une CI qui a une base doit tester l'API.
  throw new Error(
    `Suite HTTP e2e : DATABASE_URL est défini mais l'API n'est pas construite ` +
      `(${API_ENTRYPOINT} absent). Lancez « npm run api:build » avant « npm run test:e2e:api ».`
  );
}

/** Conteneur de suite : exécutée si une base existe, ignorée sinon. */
export function httpSuite(name: string, factory: () => void): void {
  const runner = E2E_ENABLED ? describe : describe.skip;
  runner(name, factory);
}

// ---------------------------------------------------------------------------
// Base de données
// ---------------------------------------------------------------------------

/** Toutes les migrations, dans l'ordre chronologique. */
export function migrationSql(): string {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(MIGRATIONS_DIR, entry.name, "migration.sql"))
    .sort()
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

/**
 * Repart d'une base vierge puis applique les migrations versionnées.
 *
 * Le schéma est recréé (et non complété) pour que le test prouve que la
 * migration est rejouable de zéro : c'est la même exigence que pour un
 * déploiement de staging ou une restauration.
 */
export async function migrateFresh(client: SqlClient): Promise<void> {
  await client.exec(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`);
  await client.exec(migrationSql());
}

export async function connect(): Promise<SqlClient> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL requis");
  return PgClient.create(url);
}

/** Interroge la base et renvoie la première ligne, ou lève si aucune. */
export async function queryOne<T extends Record<string, unknown>>(
  client: SqlClient,
  sql: string,
  params: unknown[] = []
): Promise<T> {
  const result = await client.query<T>(sql, params);
  const row = result.rows[0];
  if (!row) throw new Error(`Aucune ligne renvoyée par : ${sql.slice(0, 80)}`);
  return row;
}

export async function scalar(client: SqlClient, sql: string, params: unknown[] = []): Promise<number> {
  const result = await client.query<{ value: string }>(sql, params);
  return Number(result.rows[0]?.value ?? 0);
}

// ---------------------------------------------------------------------------
// Démarrage du serveur
// ---------------------------------------------------------------------------

export type RunningApi = {
  baseUrl: string;
  port: number;
  /** Vrai si l'API fait confiance à `X-Forwarded-For` (TRUST_PROXY_HOPS > 0). */
  trustedProxy: boolean;
  logs: () => string;
  stop: () => Promise<void>;
};

async function freePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Démarre l'API compilée et attend qu'elle réponde réellement.
 *
 * Le délai est borné et les journaux du serveur sont conservés : un échec de
 * démarrage doit être diagnosticable depuis la sortie de test, sans accès aux
 * journaux du runner.
 */
export async function startApi(
  options: { env?: Record<string, string>; timeoutMs?: number } = {}
): Promise<RunningApi> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL requis pour démarrer l'API de test");

  const port = await freePort();
  const child = spawn(process.execPath, [API_ENTRYPOINT], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      AUTH_SECRET: TEST_AUTH_SECRET,
      CORS_ORIGIN: TEST_CORS_ORIGIN,
      PROOF_STORAGE_DIR:
        options.env?.PROOF_STORAGE_DIR ?? join(tmpdir(), "jotoliko-e2e-proofs", randomUUID()),
      ...options.env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const chunks: string[] = [];
  child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));

  let exited = false;
  child.on("exit", () => {
    exited = true;
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + (options.timeoutMs ?? 30_000);
  let lastError = "aucune réponse";

  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(`L'API s'est arrêtée au démarrage.\n${chunks.join("")}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health/live`);
      if (response.ok) {
        return {
          baseUrl,
          port,
                  trustedProxy: options.env?.TRUST_PROXY_HOPS !== undefined && Number(options.env.TRUST_PROXY_HOPS) > 0,
          logs: () => chunks.join(""),
          stop: async () => {
            if (exited) return;
            child.kill("SIGTERM");
            const stopped = await Promise.race([
              new Promise<boolean>((resolve) => child.on("exit", () => resolve(true))),
              new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5_000)),
            ]);
            if (!stopped) child.kill("SIGKILL");
          },
        };
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = (error as Error).message;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  child.kill("SIGKILL");
  throw new Error(`L'API n'a pas répondu sur ${baseUrl} (${lastError}).\n${chunks.join("")}`);
}

// ---------------------------------------------------------------------------
// Client HTTP
// ---------------------------------------------------------------------------

export type HttpResult<T = any> = {
  status: number;
  body: T;
  headers: Headers;
};

export type RequestOptions = {
  method?: string;
  path: string;
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
  raw?: string;
  /**
   * Adresse client simulée (`X-Forwarded-For`).
   *
   * Elle n'a d'effet que si l'API est configurée avec `TRUST_PROXY_HOPS > 0` :
   * c'est testé explicitement dans la suite de sécurité (en-tête ignoré par
   * défaut). Elle sert ici à donner à chaque test son propre compteur de
   * limitation de débit, sans jamais assouplir la limite elle-même.
   */
  ip?: string;
};

let ipCounter = 0;

/** Adresse de test unique : évite que deux tests partagent un quota. */
export function uniqueIp(): string {
  ipCounter += 1;
  return `10.42.${Math.floor(ipCounter / 250) % 250}.${(ipCounter % 250) + 1}`;
}

export async function request<T = any>(
  api: RunningApi,
  options: RequestOptions
): Promise<HttpResult<T>> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  // Quand l'API fait confiance au proxy, chaque requête part d'une adresse
  // distincte : le quota global de 120 req/min ne peut donc pas faire échouer un
  // test pour une raison étrangère à ce qu'il vérifie. Le test de limitation
  // fixe explicitement son adresse pour partager un compteur.
  const ip = options.ip ?? (api.trustedProxy ? uniqueIp() : undefined);
  if (ip) headers["X-Forwarded-For"] = ip;
  let body: string | undefined;
  if (options.raw !== undefined) {
    body = options.raw;
    headers["Content-Type"] ??= "application/json";
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${api.baseUrl}${options.path}`, {
    method: options.method ?? (body === undefined ? "GET" : "POST"),
    headers,
    body,
  });

  const text = await response.text();
  let parsed: unknown = text;
  if (text && (response.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: response.status, body: parsed as T, headers: response.headers };
}

// ---------------------------------------------------------------------------
// Jeu de données (écrit en SQL : ce sont les données, pas la logique testée)
// ---------------------------------------------------------------------------

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export async function seedCompany(client: SqlClient, slug: string): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO companies (id, name, slug, "updatedAt") VALUES ($1, $2, $3, NOW())`,
    [id, `Entreprise ${slug}`, slug]
  );
  return id;
}

export async function seedRole(client: SqlClient, code: AppRole): Promise<string> {
  await client.query(`INSERT INTO roles (id, code, label) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING`, [
    randomUUID(),
    code,
    code,
  ]);
  return (await queryOne<{ id: string }>(client, `SELECT id FROM roles WHERE code = $1`, [code])).id;
}

export type Actor = {
  userId: string;
  email: string;
  password: string;
  role: AppRole;
  companyId: string;
};

/**
 * Crée un utilisateur actif rattaché à une entreprise avec un rôle donné.
 *
 * Le mot de passe est haché avec **le même algorithme que l'API**
 * (`scrypt(password, salt, 64)`) : la connexion testée est donc la vraie.
 */
export async function seedActor(
  client: SqlClient,
  options: {
    companyId: string;
    role: AppRole;
    email?: string;
    password?: string;
    isActive?: boolean;
    tokenVersion?: number;
  }
): Promise<Actor> {
  const email = options.email ?? `${options.role.toLowerCase()}-${randomUUID().slice(0, 8)}@jotoliko.test`;
  const password = options.password ?? DEFAULT_PASSWORD;
  const salt = randomUUID().replace(/-/g, "");
  const userId = randomUUID();

  await client.query(
    `INSERT INTO users (id, email, "passwordHash", "passwordSalt", "firstName", "lastName", "isActive", "tokenVersion", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [
      userId,
      email,
      hashPassword(password, salt),
      salt,
      options.role,
      "Test",
      options.isActive ?? true,
      options.tokenVersion ?? 0,
    ]
  );

  const roleId = await seedRole(client, options.role);
  await client.query(
    `INSERT INTO memberships (id, "userId", "companyId", "roleId") VALUES ($1, $2, $3, $4)`,
    [randomUUID(), userId, options.companyId, roleId]
  );

  return { userId, email, password, role: options.role, companyId: options.companyId };
}

/** Connexion réelle : c'est le jeton de production que les tests utilisent. */
export async function login(
  api: RunningApi,
  company: string,
  actor: { email: string; password: string },
  options: { ip?: string } = {}
): Promise<string> {
  const response = await request<{ accessToken?: string }>(api, {
    path: "/auth/login",
    body: { companyId: company, email: actor.email, password: actor.password },
    ip: options.ip ?? uniqueIp(),
  });
  if (response.status !== 200 || !response.body?.accessToken) {
    throw new Error(`Connexion impossible (${response.status}) : ${JSON.stringify(response.body)}`);
  }
  return response.body.accessToken;
}

/**
 * Tentative de connexion. Chaque appel utilise par défaut une adresse distincte
 * lorsque l'API fait confiance à `X-Forwarded-For` : les cas de refus peuvent
 * ainsi être testés en série sans que le limiteur de débit ne les transforme en
 * `429`. Le test de limitation lui-même fixe son adresse explicitement.
 */
export async function loginAttempt<T = any>(
  api: RunningApi,
  body: unknown,
  options: { ip?: string } = {}
): Promise<HttpResult<T>> {
  return request<T>(api, { path: "/auth/login", body, ip: options.ip ?? uniqueIp() });
}

export type MissionSeed = {
  id?: string;
  companyId: string;
  reference: string;
  status?: MissionStatus;
  assignedUserId?: string | null;
  expectedAmount?: number;
  collectedAmount?: number;
  remittedAmount?: number;
  proofId?: string | null;
  clientName?: string;
  /** Position GPS : exprimée en décalage pour rester indépendant du fuseau. */
  gps?: { latitude: number; longitude: number; ageSeconds: number; truth?: TruthStatus } | null;
};

/**
 * Insère une mission. Les horodatages GPS sont calculés par PostgreSQL en UTC
 * explicite (`NOW() AT TIME ZONE 'UTC'`), comme le fait Prisma : un test de
 * fraîcheur ne doit pas dépendre du fuseau du serveur.
 */
export async function seedMission(client: SqlClient, seed: MissionSeed): Promise<string> {
  const id = seed.id ?? randomUUID();
  const reference = seed.reference;
  const gps = seed.gps ?? null;
  await client.query(
    `INSERT INTO missions (
       id, "companyId", reference, "clientName", status, "assignedUserId",
       "expectedAmount", "collectedAmount", "remittedAmount", "proofId",
       latitude, longitude, "gpsAt", "gpsTruth", "updatedAt"
     ) VALUES (
       $1, $2, $3, $4, $5::"MissionStatus", $6,
       $7, $8, $9, $10,
       $11, $12,
       CASE WHEN $13::int IS NULL THEN NULL
            ELSE (NOW() AT TIME ZONE 'UTC') - ($13::int * INTERVAL '1 second') END,
       $14::"TruthStatus", NOW()
     )`,
    [
      id,
      seed.companyId,
      reference,
      seed.clientName ?? `Client ${reference}`,
      seed.status ?? "A_AFFECTER",
      seed.assignedUserId ?? null,
      seed.expectedAmount ?? 0,
      seed.collectedAmount ?? 0,
      seed.remittedAmount ?? 0,
      seed.proofId ?? null,
      gps?.latitude ?? null,
      gps?.longitude ?? null,
      gps?.ageSeconds ?? null,
      gps?.truth ?? (gps ? "REEL" : "INDISPONIBLE"),
    ]
  );
  return id;
}

/** Réglages d'entreprise (politique de preuve, tolérance de caisse…). */
export async function seedSetting(
  client: SqlClient,
  companyId: string,
  values: { proofRequired?: boolean } = {}
): Promise<void> {
  await client.query(
    `INSERT INTO settings (id, "companyId", "proofRequired", "updatedAt") VALUES ($1, $2, $3, NOW())
     ON CONFLICT ("companyId") DO UPDATE SET "proofRequired" = EXCLUDED."proofRequired", "updatedAt" = NOW()`,
    [randomUUID(), companyId, values.proofRequired ?? true]
  );
}

// ---------------------------------------------------------------------------
// Accès direct à l'état persisté (vérifications d'effets de bord)
// ---------------------------------------------------------------------------

export async function auditActionsFor(client: SqlClient, entityId: string): Promise<string[]> {
  const result = await client.query<{ action: string }>(
    `SELECT action FROM audit_logs WHERE "entityId" = $1 ORDER BY "createdAt"`,
    [entityId]
  );
  return result.rows.map((row) => row.action);
}

export async function auditRequestIds(client: SqlClient, entityId: string): Promise<(string | null)[]> {
  const result = await client.query<{ requestId: string | null }>(
    `SELECT "requestId" FROM audit_logs WHERE "entityId" = $1 ORDER BY "createdAt"`,
    [entityId]
  );
  return result.rows.map((row) => row.requestId);
}

export async function cashMovements(
  client: SqlClient,
  missionId: string
): Promise<{ type: string; amount: number; idempotencyKey: string }[]> {
  const result = await client.query<{ type: string; amount: number; idempotencyKey: string }>(
    `SELECT type, amount, "idempotencyKey" FROM cash_movements WHERE "missionId" = $1 ORDER BY "createdAt"`,
    [missionId]
  );
  return result.rows;
}

export async function missionRow(
  client: SqlClient,
  missionId: string
): Promise<{
  status: string;
  assignedUserId: string | null;
  expectedAmount: number;
  collectedAmount: number;
  remittedAmount: number;
  proofId: string | null;
  latitude: number | null;
  longitude: number | null;
  gpsTruth: string;
}> {
  return queryOne(client, `SELECT * FROM missions WHERE id = $1`, [missionId]);
}
