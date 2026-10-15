// Test HTTP/système — sauvegarde puis restauration dans une base isolée.
//
// Une sauvegarde non restaurée n'est pas une sauvegarde : c'est une intention.
// Ce test effectue donc l'aller-retour complet — `pg_dump` de la base de test,
// création d'une base séparée, `pg_restore`, puis vérification que les données,
// les relations, les contraintes et le journal d'audit sont bien présents et
// toujours appliqués.
//
// La production n'est jamais touchée : la restauration va dans une base dont le
// nom est tiré au sort, supprimée en fin de test.
//
// Les outils clients PostgreSQL sont absents de certains environnements : la
// suite se déclare alors ignorée et l'indique, plutôt que de simuler un résultat.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accessSync, constants, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { PgClient } from "../reality/sql-client";
import {
  connect,
  httpSuite,
  migrateFresh,
  scalar,
  seedActor,
  seedCompany,
  seedMission,
  uploadProof,
  login,
  startApi,
  type RunningApi,
  type SqlClient,
} from "./harness";

/** Cherche un binaire sur le PATH puis dans les installations PostgreSQL locales. */
function findTool(name: string): string | null {
  const fromPath = (process.env.PATH ?? "")
    .split(":")
    .filter(Boolean)
    .map((directory) => join(directory, name))
    .find((candidate) => existsSync(candidate));
  if (fromPath) return fromPath;

  try {
    for (const base of readdirSync("/usr/lib/postgresql").sort().reverse()) {
      const candidate = join("/usr/lib/postgresql", base, "bin", name);
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    /* aucune installation locale */
  }
  return null;
}

function toolMajor(binary: string): number {
  const output = execFileSync(binary, ["--version"], { encoding: "utf8" });
  const match = output.match(/(\d+)(\.\d+)?/);
  return match ? Number(match[1]) : 0;
}

const PG_DUMP = findTool("pg_dump");
const PG_RESTORE = findTool("pg_restore");
const PSQL = findTool("psql");
const TOOLS_AVAILABLE = Boolean(PG_DUMP && PG_RESTORE && PSQL);

if (!TOOLS_AVAILABLE) {
  console.warn(
    "[api-e2e] Outils clients PostgreSQL (pg_dump/pg_restore/psql) absents : " +
      "le test de sauvegarde/restauration est ignoré ici. Il s'exécute en CI."
  );
}

/** Exécute un binaire en échouant proprement si le code de sortie n'est pas 0. */
function run(binary: string, args: string[]): string {
  return execFileSync(binary, args, { encoding: "utf8" });
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

httpSuite("Sauvegarde et restauration PostgreSQL", () => {
  let db: SqlClient;
  let api: RunningApi;
  let sourceUrl: string;
  let restoreDatabase: string;
  let restoreUrl: string;
  let dumpPath: string;
  let seeded: { companyId: string; reference: string; missionId: string; proofId: string };

  const suite = TOOLS_AVAILABLE ? it : it.skip;

  beforeAll(async () => {
    db = await connect();
    await migrateFresh(db);
  }, 120_000);

  afterAll(async () => {
    await api?.stop();
    if (dumpPath && existsSync(dumpPath)) rmSync(dumpPath);
    await db?.close();
  });

  suite("restaure une sauvegarde complète dans une base isolée et vérifie l'intégrité", async () => {
    sourceUrl = process.env.DATABASE_URL as string;
    const serverMajor = await scalar(db, `SELECT current_setting('server_version_num')::int / 10000 AS value`);
    // Un client plus ancien que le serveur refuse de s'y connecter : on le
    // vérifie explicitement pour ne pas produire un échec incompréhensible.
    for (const tool of [PG_DUMP as string, PG_RESTORE as string]) {
      expect(toolMajor(tool), `${tool} doit être au moins de la version du serveur`).toBeGreaterThanOrEqual(
        serverMajor
      );
    }

    // 1. Un jeu de données réaliste : entreprise, utilisateur, mission, preuve,
    //    mouvement de caisse et trace d'audit (via l'API, donc par les vrais
    //    chemins d'écriture).
    const slug = `backup-${Date.now().toString(36)}`;
    const companyId = await seedCompany(db, slug);
    const manager = await seedActor(db, { companyId, role: "MANAGER" });
    const missionId = await seedMission(db, {
      companyId,
      reference: "SAUVEGARDE-1",
      status: "LIVREE",
      expectedAmount: 12000,
      collectedAmount: 12000,
      assignedUserId: manager.userId,
    });
    await db.query(
      `INSERT INTO cash_movements (id, "companyId", "missionId", type, amount, "actorUserId", "idempotencyKey", "requestHash")
       VALUES ($1, $2, $3, 'ENCAISSEMENT', 12000, $4, 'sauvegarde-0001', 'empreinte')`,
      [randomUUID(), companyId, missionId, manager.userId]
    );
    await db.query(
      `INSERT INTO audit_logs (id, "companyId", "userId", action, "entityType", "entityId")
       VALUES ($1, $2, $3, 'PAYMENT_COLLECTED', 'Mission', $4)`,
      [randomUUID(), companyId, manager.userId, missionId]
    );

    api = await startApi({ env: { TRUST_PROXY_HOPS: "1" } });
    const token = await login(api, slug, manager);
    const proof = await uploadProof(api, token, missionId);
    expect(proof.status).toBe(201);

    seeded = { companyId, reference: "SAUVEGARDE-1", missionId, proofId: proof.body.id };

    // 2. Sauvegarde.
    dumpPath = join(tmpdir(), `jotoliko-sauvegarde-${randomUUID()}.dump`);
    run(PG_DUMP as string, [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      `--file=${dumpPath}`,
      sourceUrl,
    ]);
    expect(existsSync(dumpPath)).toBe(true);

    // 3. Restauration dans une base neuve et isolée.
    restoreDatabase = `jotoliko_restauration_${randomUUID().slice(0, 8)}`;
    restoreUrl = withDatabase(sourceUrl, restoreDatabase);
    const admin = await PgClient.create(withDatabase(sourceUrl, "postgres"));
    await admin.exec(`CREATE DATABASE "${restoreDatabase}"`);
    await admin.close();

    run(PG_RESTORE as string, ["--no-owner", "--no-privileges", `--dbname=${restoreUrl}`, dumpPath]);

    // 4. Contrôles sur la base restaurée : les données sont là…
    const restored = await PgClient.create(restoreUrl);
    try {
      const mission = await restored.query<{ reference: string; expectedAmount: number; collectedAmount: number }>(
        `SELECT reference, "expectedAmount", "collectedAmount" FROM missions WHERE id = $1`,
        [seeded.missionId]
      );
      expect(mission.rows[0]).toMatchObject({
        reference: "SAUVEGARDE-1",
        expectedAmount: 12000,
        collectedAmount: 12000,
      });

      const proof = await restored.query<{ sha256: string; sizeBytes: number }>(
        `SELECT "sha256", "sizeBytes" FROM proof_files WHERE id = $1`,
        [seeded.proofId]
      );
      expect(proof.rows[0]?.sha256).toHaveLength(64);
      expect(proof.rows[0]?.sizeBytes).toBeGreaterThan(0);

      const cash = await restored.query<{ total: number }>(
        `SELECT coalesce(sum(amount), 0)::int AS total FROM cash_movements WHERE "companyId" = $1`,
        [seeded.companyId]
      );
      expect(cash.rows[0]?.total).toBe(12000);

      const audit = await restored.query<{ action: string }>(
        `SELECT action FROM audit_logs WHERE "entityId" = $1`,
        [seeded.missionId]
      );
      expect(audit.rows.map((row) => row.action)).toContain("PAYMENT_COLLECTED");

      // …et les protections sont toujours là : une sauvegarde qui restaure des
      // données sans leurs contraintes produit une base silencieusement fausse.
      await expect(
        restored.query(`INSERT INTO missions (id, "companyId", reference, "clientName", "updatedAt")
                        VALUES ($1, 'entreprise-inexistante', 'SAUVEGARDE-FK', 'x', NOW())`, [randomUUID()])
      ).rejects.toThrow(/violates foreign key constraint/);

      await expect(
        restored.query(`INSERT INTO missions (id, "companyId", reference, "clientName", "updatedAt")
                        VALUES ($1, $2, 'SAUVEGARDE-1', 'x', NOW())`, [randomUUID(), seeded.companyId])
      ).rejects.toThrow(/duplicate key value/);

      await expect(
        restored.query(`UPDATE missions SET "expectedAmount" = -1 WHERE id = $1`, [seeded.missionId])
      ).rejects.toThrow(/violates check constraint/);

      await expect(
        restored.query(`INSERT INTO missions (id, "companyId", reference, "clientName", "remittedAmount", "collectedAmount", "updatedAt")
                        VALUES ($1, $2, 'SAUVEGARDE-REMISE', 'x', 5000, 1000, NOW())`,
          [randomUUID(), seeded.companyId])
      ).rejects.toThrow(/violates check constraint/);

      const migrations = await restored.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`
      );
      expect(migrations.rows[0]?.count).toBeGreaterThan(0);
    } finally {
      await restored.close();
    }

    // 5. Nettoyage vérifié par le test suivant : la base de restauration est un
    //    environnement jetable, jamais une copie persistante de la production.
    const cleanup = await PgClient.create(withDatabase(sourceUrl, "postgres"));
    await cleanup.exec(`DROP DATABASE IF EXISTS "${restoreDatabase}" WITH (FORCE)`);
    await cleanup.close();
  }, 180_000);

  if (TOOLS_AVAILABLE) {
    it("nettoie la base de restauration et ne laisse aucune donnée derrière", async () => {
      const admin = await PgClient.create(withDatabase(process.env.DATABASE_URL as string, "postgres"));
      try {
        const remaining = await admin.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM pg_database WHERE datname = $1`,
          [restoreDatabase]
        );
        expect(remaining.rows[0]?.count).toBe(0);
      } finally {
        await admin.close();
      }
    });
  }
});
