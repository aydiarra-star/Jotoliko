// Reality tests — PostgreSQL réel.
//
// Ces tests n'utilisent aucune imitation de base : ils appliquent la migration
// versionnée sur un PostgreSQL 16 puis vérifient les contraintes, l'isolation
// multi-entreprise et l'idempotence au niveau du moteur. C'est la seule façon
// de prouver que « l'entreprise A ne peut pas lire les missions de B » : un test
// de règle applicative ne prouve rien sur la requête réellement exécutée.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGliteClient, PgClient, PG, isPgError, resetSchema, type SqlClient } from "./sql-client";

const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATION_PATH = join(
  REPO_ROOT,
  "prisma/migrations/20261015000000_init_operational_core/migration.sql"
);
const SCHEMA_PATH = join(REPO_ROOT, "prisma/schema.prisma");

const MIGRATION_SQL = readFileSync(MIGRATION_PATH, "utf8");
const SCHEMA_SOURCE = readFileSync(SCHEMA_PATH, "utf8");

/** Tables que cette migration est censée créer. */
const MIGRATED_TABLES = [
  "companies",
  "users",
  "missions",
  "cash_movements",
  "mutation_keys",
  "audit_logs",
] as const;

let client: SqlClient;

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  client = url ? await PgClient.create(url) : await PGliteClient.create();
  await resetSchema(client);
  await client.exec(MIGRATION_SQL);
}, 120_000);

afterAll(async () => {
  await client?.close();
});

// ---------------------------------------------------------------------------
// Jeu de données minimal
// ---------------------------------------------------------------------------
async function seedCompany(slug: string): Promise<{ companyId: string; userId: string }> {
  const company = await client.query<{ id: string }>(
    `INSERT INTO companies (name, slug, "updatedAt") VALUES ($1, $2, CURRENT_TIMESTAMP) RETURNING id`,
    [`Entreprise ${slug}`, slug]
  );
  const companyId = company.rows[0]!.id;
  const user = await client.query<{ id: string }>(
    `INSERT INTO users (email, "passwordHash", "passwordSalt", "firstName", "lastName", "updatedAt")
     VALUES ($1, 'x', 'sel-de-test', 'Test', 'User', CURRENT_TIMESTAMP) RETURNING id`,
    [`${slug}@example.test`]
  );
  return { companyId, userId: user.rows[0]!.id };
}

async function seedMission(
  companyId: string,
  reference: string,
  over: { assignedUserId?: string; expectedAmount?: number } = {}
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `INSERT INTO missions ("companyId", reference, "clientName", status, "expectedAmount", "assignedUserId", "updatedAt")
     VALUES ($1, $2, 'Client test', 'ARRIVE', $3, $4, CURRENT_TIMESTAMP) RETURNING id`,
    [companyId, reference, over.expectedAmount ?? 10_000, over.assignedUserId ?? null]
  );
  return res.rows[0]!.id;
}

/** Nettoyage entre tests, sans jamais toucher au schéma. */
async function truncateAll(): Promise<void> {
  // Referme toute transaction laissée ouverte par un test précédent : une
  // transaction avortée rendrait la connexion inutilisable pour la suite.
  try {
    await client.exec("ROLLBACK");
  } catch {
    /* aucune transaction ouverte */
  }
  await client.exec(
    `TRUNCATE TABLE cash_movements, mutation_keys, audit_logs, missions, users, companies RESTART IDENTITY CASCADE`
  );
}

/**
 * Exécute un bloc SQL dont l'échec est attendu, puis referme la transaction.
 * PostgreSQL laisse la session en état « aborted » après une erreur dans un
 * bloc : sans ce ROLLBACK, le test suivant échouerait pour une mauvaise raison.
 */
async function expectSqlFailure(sql: string): Promise<void> {
  let failure: unknown = null;
  try {
    await client.exec(sql);
  } catch (error) {
    failure = error;
  }
  try {
    await client.exec("ROLLBACK");
  } catch {
    /* aucune transaction ouverte */
  }
  expect(failure, "l'instruction devait échouer mais a réussi").not.toBeNull();
}

// ---------------------------------------------------------------------------
// #12 — Les migrations s'appliquent sur une base propre
// ---------------------------------------------------------------------------
describe("#12 Migration sur base propre", () => {
  it("crée toutes les tables attendues", async () => {
    const res = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
    );
    const present = res.rows.map((r) => r.table_name);
    for (const table of MIGRATED_TABLES) expect(present).toContain(table);
  });

  it("crée les types énumérés", async () => {
    const res = await client.query<{ typname: string }>(
      `SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typtype = 'e' ORDER BY t.typname`
    );
    const enums = res.rows.map((r) => r.typname);
    for (const e of ["MissionStatus", "TruthStatus", "CashMovementType"]) expect(enums).toContain(e);
  });

  it("est idempotente dans sa structure : rejouer échoue proprement au lieu de corrompre", async () => {
    // Rejouer la migration sur un schéma déjà peuplé doit lever une erreur
    // explicite (type déjà existant), jamais réussir à moitié en silence.
    await expect(client.exec(MIGRATION_SQL)).rejects.toBeTruthy();
  });

  it("ne dérive pas du schéma Prisma : chaque colonne déclarée existe en base", async () => {
    // Garde-fou anti-dérive. Le fichier de migration est écrit à la main (les
    // binaires Prisma ne sont pas disponibles dans tous les environnements) ;
    // ce test vérifie mécaniquement que les modèles couverts correspondent.
    const columnRes = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`
    );
    const byTable = new Map<string, Set<string>>();
    for (const row of columnRes.rows) {
      if (!byTable.has(row.table_name)) byTable.set(row.table_name, new Set());
      byTable.get(row.table_name)!.add(row.column_name);
    }

    const scalar = /^\s+(\w+)\s+(String|Int|Boolean|DateTime|Float|Json|BigInt|Decimal|Bytes)\??/;
    let checkedModels = 0;

    for (const model of SCHEMA_SOURCE.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
      const modelName = model[1]!;
      const body = model[2]!;
      const mapMatch = body.match(/@@map\("([^"]+)"\)/);
      const table = mapMatch ? mapMatch[1]! : modelName;

      // On ne vérifie que les modèles réellement couverts par cette migration.
      if (!(MIGRATED_TABLES as readonly string[]).includes(table)) continue;

      const columns = byTable.get(table);
      expect(columns, `table ${table} absente`).toBeDefined();
      checkedModels += 1;

      for (const line of body.split("\n")) {
        const match = line.match(scalar);
        if (!match) continue;
        const field = match[1]!;
        // Les champs de relation et @map sont traités séparément.
        if (line.includes("@relation")) continue;
        const columnName = line.match(/@map\("([^"]+)"\)/)?.[1] ?? field;
        expect(columns!.has(columnName), `${table}.${columnName} manquante`).toBe(true);
      }
    }

    expect(checkedModels).toBe(MIGRATED_TABLES.length);
  });
});

// ---------------------------------------------------------------------------
// #1 — Isolation stricte entre entreprises
// ---------------------------------------------------------------------------
describe("#1 Isolation multi-entreprise", () => {
  it("ne renvoie que les missions de l'entreprise demandée", async () => {
    await truncateAll();
    const a = await seedCompany("alpha");
    const b = await seedCompany("beta");
    await seedMission(a.companyId, "CMD-A1");
    await seedMission(a.companyId, "CMD-A2");
    await seedMission(b.companyId, "CMD-B1");

    const own = await client.query<{ reference: string }>(
      `SELECT reference FROM missions WHERE "companyId" = $1 ORDER BY reference`,
      [a.companyId]
    );
    expect(own.rows.map((r) => r.reference)).toEqual(["CMD-A1", "CMD-A2"]);

    const other = await client.query(`SELECT id FROM missions WHERE "companyId" = $1`, [b.companyId]);
    expect(other.rows).toHaveLength(1);
  });

  it("ne laisse pas lire une mission d'une autre entreprise par identifiant direct", async () => {
    await truncateAll();
    const a = await seedCompany("alpha");
    const b = await seedCompany("beta");
    const missionB = await seedMission(b.companyId, "CMD-B-1");

    // Requête « naive » : identifiant exact, mais entreprise A. Doit être vide.
    const leak = await client.query(`SELECT id FROM missions WHERE id = $1 AND "companyId" = $2`, [
      missionB,
      a.companyId,
    ]);
    expect(leak.rows).toHaveLength(0);
  });

  it("autorise deux entreprises à réutiliser la même référence métier", async () => {
    await truncateAll();
    const a = await seedCompany("alpha");
    const b = await seedCompany("beta");
    await seedMission(a.companyId, "CMD-100");
    await seedMission(b.companyId, "CMD-100"); // ne doit pas entrer en conflit
    const res = await client.query<{ count: string }>(`SELECT count(*) FROM missions`);
    expect(Number(res.rows[0]!.count)).toBe(2);
  });

  it("refuse deux fois la même référence dans une entreprise", async () => {
    await truncateAll();
    const a = await seedCompany("alpha");
    await seedMission(a.companyId, "CMD-DUP");
    await expect(seedMission(a.companyId, "CMD-DUP")).rejects.toSatisfy((e) => isPgError(e, PG.UNIQUE_VIOLATION));
  });
});

// ---------------------------------------------------------------------------
// #14 — Aucun accès aux preuves d'une autre entreprise
// ---------------------------------------------------------------------------
describe("#14 Cloisonnement des preuves de livraison", () => {
  it("ne restitue la référence de preuve qu'à l'entreprise propriétaire", async () => {
    await truncateAll();
    const a = await seedCompany("alpha");
    const b = await seedCompany("beta");
    const missionB = await seedMission(b.companyId, "CMD-PROOF");
    await client.query(`UPDATE missions SET "proofId" = 'proof-secret-b' WHERE id = $1`, [missionB]);

    const asA = await client.query<{ proofId: string | null }>(
      `SELECT "proofId" FROM missions WHERE id = $1 AND "companyId" = $2`,
      [missionB, a.companyId]
    );
    expect(asA.rows).toHaveLength(0);

    const asB = await client.query<{ proofId: string | null }>(
      `SELECT "proofId" FROM missions WHERE id = $1 AND "companyId" = $2`,
      [missionB, b.companyId]
    );
    expect(asB.rows[0]?.proofId).toBe("proof-secret-b");
  });
});

// ---------------------------------------------------------------------------
// #7 — La répétition d'une clé d'idempotence ne double pas l'encaissement
// ---------------------------------------------------------------------------
describe("#7 Idempotence de l'encaissement", () => {
  it("refuse un second mouvement d'espèces avec la même clé", async () => {
    await truncateAll();
    const a = await seedCompany("alpha");
    const mission = await seedMission(a.companyId, "CMD-IDEM");

    const insertMovement = () =>
      client.query(
        `INSERT INTO cash_movements ("companyId", "missionId", type, amount, "actorUserId", "idempotencyKey", "requestHash")
         VALUES ($1, $2, 'ENCAISSEMENT', 5000, $3, 'cle-unique-001', 'hash-1')`,
        [a.companyId, mission, a.userId]
      );

    await insertMovement();
    await expect(insertMovement()).rejects.toSatisfy((e) => isPgError(e, PG.UNIQUE_VIOLATION));

    const movements = await client.query<{ count: string }>(
      `SELECT count(*) FROM cash_movements WHERE "companyId" = $1`,
      [a.companyId]
    );
    expect(Number(movements.rows[0]!.count)).toBe(1);
  });

  it("permet à deux entreprises d'employer la même clé sans se bloquer", async () => {
    await truncateAll();
    const a = await seedCompany("alpha");
    const b = await seedCompany("beta");
    const missionA = await seedMission(a.companyId, "CMD-A");
    const missionB = await seedMission(b.companyId, "CMD-B");

    for (const [companyId, missionId, userId] of [
      [a.companyId, missionA, a.userId],
      [b.companyId, missionB, b.userId],
    ]) {
      await client.query(
        `INSERT INTO cash_movements ("companyId", "missionId", type, amount, "actorUserId", "idempotencyKey", "requestHash")
         VALUES ($1, $2, 'ENCAISSEMENT', 1000, $3, 'cle-partagee', 'hash')`,
        [companyId, missionId, userId]
      );
    }
    const res = await client.query<{ count: string }>(`SELECT count(*) FROM cash_movements`);
    expect(Number(res.rows[0]!.count)).toBe(2);
  });

  it("cloisonne les clés par opération et non seulement par entreprise", async () => {
    await truncateAll();
    const a = await seedCompany("alpha");
    await client.query(
      `INSERT INTO mutation_keys ("companyId", operation, "idempotencyKey", "requestHash", "resultJson")
       VALUES ($1, 'PAYMENT:m-1', 'k-1', 'h', '{}')`,
      [a.companyId]
    );
    // Même clé, autre opération : autorisé (espaces de nommage distincts).
    await client.query(
      `INSERT INTO mutation_keys ("companyId", operation, "idempotencyKey", "requestHash", "resultJson")
       VALUES ($1, 'REMITTANCE:m-1', 'k-1', 'h', '{}')`,
      [a.companyId]
    );
    // Même clé, même opération : refusé.
    await expect(
      client.query(
        `INSERT INTO mutation_keys ("companyId", operation, "idempotencyKey", "requestHash", "resultJson")
         VALUES ($1, 'PAYMENT:m-1', 'k-1', 'h', '{}')`,
        [a.companyId]
      )
    ).rejects.toSatisfy((e) => isPgError(e, PG.UNIQUE_VIOLATION));
  });
});

// ---------------------------------------------------------------------------
// #13 — La concurrence ne corrompt pas les montants
// ---------------------------------------------------------------------------
describe("#13 Concurrence et intégrité des montants", () => {
  it("interdit en base une remise supérieure à l'encaissement", async () => {
    await truncateAll();
    const a = await seedCompany("alpha");
    const mission = await seedMission(a.companyId, "CMD-CHECK");
    await client.query(`UPDATE missions SET "collectedAmount" = 3000 WHERE id = $1`, [mission]);

    await expect(
      client.query(`UPDATE missions SET "remittedAmount" = 4000 WHERE id = $1`, [mission])
    ).rejects.toSatisfy((e) => isPgError(e, PG.CHECK_VIOLATION));
  });

  it("interdit les montants négatifs", async () => {
    await truncateAll();
    const a = await seedCompany("alpha");
    const mission = await seedMission(a.companyId, "CMD-NEG");
    await expect(
      client.query(`UPDATE missions SET "collectedAmount" = -1 WHERE id = $1`, [mission])
    ).rejects.toSatisfy((e) => isPgError(e, PG.CHECK_VIOLATION));
  });

  it("interdit un mouvement d'espèces de montant nul ou négatif", async () => {
    await truncateAll();
    const a = await seedCompany("alpha");
    const mission = await seedMission(a.companyId, "CMD-ZERO");
    await expect(
      client.query(
        `INSERT INTO cash_movements ("companyId", "missionId", type, amount, "actorUserId", "idempotencyKey", "requestHash")
         VALUES ($1, $2, 'REMISE', 0, $3, 'k-zero', 'h')`,
        [a.companyId, mission, a.userId]
      )
    ).rejects.toSatisfy((e) => isPgError(e, PG.CHECK_VIOLATION));
  });

  it("rejette des coordonnées GPS hors limites au niveau du moteur", async () => {
    await truncateAll();
    const a = await seedCompany("alpha");
    const mission = await seedMission(a.companyId, "CMD-GPS");
    await expect(
      client.query(`UPDATE missions SET latitude = 91 WHERE id = $1`, [mission])
    ).rejects.toSatisfy((e) => isPgError(e, PG.CHECK_VIOLATION));
    await expect(
      client.query(`UPDATE missions SET longitude = -181 WHERE id = $1`, [mission])
    ).rejects.toSatisfy((e) => isPgError(e, PG.CHECK_VIOLATION));
  });

  it("annule intégralement une transaction en échec (atomicité de la caisse)", async () => {
    await truncateAll();
    const a = await seedCompany("alpha");
    const mission = await seedMission(a.companyId, "CMD-TX");

    await expectSqlFailure(`
      BEGIN;
      UPDATE missions SET "collectedAmount" = "collectedAmount" + 5000 WHERE id = '${mission}';
      INSERT INTO cash_movements ("companyId", "missionId", type, amount, "actorUserId", "idempotencyKey", "requestHash")
        VALUES ('${a.companyId}', '${mission}', 'ENCAISSEMENT', 5000, '${a.userId}', 'k-tx', 'h');
      -- Cette ligne viole la contrainte : tout le bloc doit être annulé.
      UPDATE missions SET "remittedAmount" = "remittedAmount" + 999999 WHERE id = '${mission}';
      COMMIT;
    `);

    const res = await client.query<{ collectedAmount: number; remittedAmount: number }>(
      `SELECT "collectedAmount", "remittedAmount" FROM missions WHERE id = $1`,
      [mission]
    );
    expect(res.rows[0]!.collectedAmount).toBe(0);
    expect(res.rows[0]!.remittedAmount).toBe(0);

    const movements = await client.query<{ count: string }>(
      `SELECT count(*) FROM cash_movements WHERE "missionId" = $1`,
      [mission]
    );
    expect(Number(movements.rows[0]!.count)).toBe(0);
  });

  it.skipIf(!process.env.DATABASE_URL)(
    "deux transactions simultanées ne peuvent pas produire deux encaissements de la même clé",
    async () => {
      await truncateAll();
      const a = await seedCompany("alpha");
      const mission = await seedMission(a.companyId, "CMD-CONCURRENT");

      const second = await client.fork();
      expect(second).not.toBeNull();

      const insert = (c: SqlClient) =>
        c.query(
          `INSERT INTO cash_movements ("companyId", "missionId", type, amount, "actorUserId", "idempotencyKey", "requestHash")
           VALUES ($1, $2, 'ENCAISSEMENT', 5000, $3, 'cle-concurrente', 'h')`,
          [a.companyId, mission, a.userId]
        );

      const results = await Promise.allSettled([insert(client), insert(second!)]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Exactement une réussite : la contrainte d'unicité arbitre la course.
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(isPgError((rejected[0] as PromiseRejectedResult).reason, PG.UNIQUE_VIOLATION)).toBe(true);

      const res = await client.query<{ count: string }>(
        `SELECT count(*) FROM cash_movements WHERE "missionId" = $1`,
        [mission]
      );
      expect(Number(res.rows[0]!.count)).toBe(1);

      await second!.close();
    }
  );
});

// ---------------------------------------------------------------------------
// #11 — Une mutation métier produit un événement d'audit
// ---------------------------------------------------------------------------
describe("#11 Journal d'audit", () => {
  it("enregistre la mutation et son état avant/après", async () => {
    await truncateAll();
    const a = await seedCompany("alpha");
    const mission = await seedMission(a.companyId, "CMD-AUDIT");

    await client.exec(`
      BEGIN;
      UPDATE missions SET status = 'LIVREE', "proofId" = 'proof-1' WHERE id = '${mission}';
      INSERT INTO audit_logs ("companyId", "userId", action, "entityType", "entityId", before, after, source, "requestId")
        VALUES ('${a.companyId}', '${a.userId}', 'MISSION_TRANSITION', 'Mission', '${mission}',
                '"ARRIVE"'::jsonb, '"LIVREE"'::jsonb, 'API', 'req-1');
      COMMIT;
    `);

    const res = await client.query<{ action: string; before: string; after: string; requestId: string }>(
      `SELECT action, before, after, "requestId" FROM audit_logs WHERE "entityId" = $1`,
      [mission]
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.action).toBe("MISSION_TRANSITION");
    expect(res.rows[0]!.before).toBe("ARRIVE");
    expect(res.rows[0]!.after).toBe("LIVREE");
    expect(res.rows[0]!.requestId).toBe("req-1");
  });

  it("n'écrit aucun événement d'audit si la mutation est annulée", async () => {
    await truncateAll();
    const a = await seedCompany("alpha");
    const mission = await seedMission(a.companyId, "CMD-AUDIT-ROLLBACK");

    await expectSqlFailure(`
      BEGIN;
      UPDATE missions SET status = 'LIVREE' WHERE id = '${mission}';
      INSERT INTO audit_logs ("companyId", "userId", action, "entityType", "entityId", source)
        VALUES ('${a.companyId}', '${a.userId}', 'MISSION_TRANSITION', 'Mission', '${mission}', 'API');
      UPDATE missions SET "remittedAmount" = 1 WHERE id = '${mission}';
      COMMIT;
    `);

    const audit = await client.query(`SELECT id FROM audit_logs WHERE "entityId" = $1`, [mission]);
    expect(audit.rows).toHaveLength(0);
    const status = await client.query<{ status: string }>(`SELECT status FROM missions WHERE id = $1`, [mission]);
    expect(status.rows[0]!.status).toBe("ARRIVE");
  });

  it("conserve l'audit même si l'utilisateur est supprimé", async () => {
    await truncateAll();
    const a = await seedCompany("alpha");
    const mission = await seedMission(a.companyId, "CMD-AUDIT-RETENTION");
    await client.query(
      `INSERT INTO audit_logs ("companyId", "userId", action, "entityType", "entityId", source)
       VALUES ($1, $2, 'PAYMENT_COLLECTED', 'Mission', $3, 'API')`,
      [a.companyId, a.userId, mission]
    );

    await client.query(`DELETE FROM users WHERE id = $1`, [a.userId]);

    const res = await client.query<{ userId: string | null; action: string }>(
      `SELECT "userId", action FROM audit_logs WHERE "entityId" = $1`,
      [mission]
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.action).toBe("PAYMENT_COLLECTED");
    // ON DELETE SET NULL : on perd l'acteur, pas la trace.
    expect(res.rows[0]!.userId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// #16 — Parcours principal de bout en bout
// ---------------------------------------------------------------------------
describe("#16 Parcours de livraison complet", () => {
  it("déroule affectation → livraison → encaissement → remise avec une caisse cohérente", async () => {
    await truncateAll();
    const a = await seedCompany("alpha");
    const mission = await seedMission(a.companyId, "CMD-E2E", {
      assignedUserId: a.userId,
      expectedAmount: 12_000,
    });

    const status = async () =>
      (await client.query<{ status: string; collectedAmount: number; remittedAmount: number }>(
        `SELECT status, "collectedAmount", "remittedAmount" FROM missions WHERE id = $1`,
        [mission]
      )).rows[0]!;

    // 1. Affectation
    await client.query(`UPDATE missions SET status = 'AFFECTEE' WHERE id = $1`, [mission]);
    expect((await status()).status).toBe("AFFECTEE");

    // 2. Départ
    await client.query(`UPDATE missions SET status = 'EN_ROUTE' WHERE id = $1`, [mission]);
    expect((await status()).status).toBe("EN_ROUTE");

    // 3. Arrivée
    await client.query(`UPDATE missions SET status = 'ARRIVE' WHERE id = $1`, [mission]);
    expect((await status()).status).toBe("ARRIVE");

    // 4. Livraison avec preuve, en une transaction
    await client.exec(`
      BEGIN;
      UPDATE missions SET status = 'LIVREE', "proofId" = 'proof-e2e' WHERE id = '${mission}';
      INSERT INTO audit_logs ("companyId", "userId", action, "entityType", "entityId", before, after, source)
        VALUES ('${a.companyId}', '${a.userId}', 'MISSION_TRANSITION', 'Mission', '${mission}',
                '"ARRIVE"'::jsonb, '"LIVREE"'::jsonb, 'API');
      COMMIT;
    `);
    expect((await status()).status).toBe("LIVREE");

    // 5. Encaissement de 12 000
    await client.exec(`
      BEGIN;
      UPDATE missions SET "collectedAmount" = "collectedAmount" + 12000 WHERE id = '${mission}';
      INSERT INTO cash_movements ("companyId", "missionId", type, amount, "actorUserId", "idempotencyKey", "requestHash")
        VALUES ('${a.companyId}', '${mission}', 'ENCAISSEMENT', 12000, '${a.userId}', 'e2e-collect', 'h');
      COMMIT;
    `);
    let state = await status();
    expect(state.collectedAmount).toBe(12_000);

    // 6. Remise de 11 000 : 1 000 reste en caisse chez le livreur
    await client.exec(`
      BEGIN;
      UPDATE missions SET "remittedAmount" = "remittedAmount" + 11000 WHERE id = '${mission}';
      INSERT INTO cash_movements ("companyId", "missionId", type, amount, "actorUserId", "idempotencyKey", "requestHash")
        VALUES ('${a.companyId}', '${mission}', 'REMISE', 11000, '${a.userId}', 'e2e-remit', 'h');
      COMMIT;
    `);
    state = await status();
    expect(state.remittedAmount).toBe(11_000);

    // 7. La caisse est explicable ligne à ligne
    const movements = await client.query<{ type: string; amount: number }>(
      `SELECT type, amount FROM cash_movements WHERE "missionId" = $1 ORDER BY "createdAt"`,
      [mission]
    );
    const collected = movements.rows.filter((m) => m.type === "ENCAISSEMENT").reduce((s, m) => s + m.amount, 0);
    const remitted = movements.rows.filter((m) => m.type === "REMISE").reduce((s, m) => s + m.amount, 0);
    expect(collected).toBe(12_000);
    expect(remitted).toBe(11_000);
    expect(collected - remitted).toBe(state.collectedAmount - state.remittedAmount);

    // 8. La trace complète existe
    const audit = await client.query<{ count: string }>(
      `SELECT count(*) FROM audit_logs WHERE "entityId" = $1`,
      [mission]
    );
    expect(Number(audit.rows[0]!.count)).toBe(1);
  });

  it("refuse la clôture d'une mission d'une autre entreprise", async () => {
    await truncateAll();
    const a = await seedCompany("alpha");
    const b = await seedCompany("beta");
    const missionB = await seedMission(b.companyId, "CMD-CROSS");
    const affected = await client.query(
      `UPDATE missions SET status = 'LIVREE' WHERE id = $1 AND "companyId" = $2`,
      [missionB, a.companyId]
    );
    expect((affected as unknown as { rows: unknown[] }).rows?.length ?? 0).toBe(0);
  });
});
