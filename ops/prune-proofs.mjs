#!/usr/bin/env node
// Purge physique des preuves de livraison dont la durée de conservation est
// échue.
//
// Trois principes, tous destinés à rendre impossible une suppression non voulue :
//
//   1. **Aucune durée par défaut.** La date limite est obligatoirement fournie
//      (`--before=AAAA-MM-JJ`). Une durée de conservation est une décision métier
//      et juridique : la coder en dur reviendrait à la prendre à la place du
//      client, sur un sujet où une erreur ne se rattrape pas.
//   2. **Rien n'est supprimé sans `--confirm`.** Le mode par défaut décrit ce qui
//      serait supprimé et s'arrête. Un script de purge qui agit par défaut est un
//      incident en attente.
//   3. **Seules les preuves déjà supprimées logiquement sont purgées.** Une
//      preuve active reste, quelle que soit son ancienneté : elle peut encore
//      servir de pièce justificative. Les lignes en base ne sont **jamais**
//      touchées ici : le journal d'audit et les références restent lisibles.
//
// La validation des chemins est celle de l'API (module compilé) : une règle de
// sécurité dupliquée est une règle qui divergera.
//
// Usage :
//   npm run api:build
//   node ops/prune-proofs.mjs --before=2026-01-01 [--confirm] [--limit=1000]
//
// Variables : DATABASE_URL, PROOF_STORAGE_DIR.

import { existsSync, unlinkSync } from "node:fs";
import { annotate, planProofPurge } from "./lib/ops-core.mjs";

const options = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value ?? "true"];
    })
);

const before = options.get("before");
const confirm = options.has("confirm");
const limit = Number(options.get("limit") ?? 1000);

if (!before) {
  annotate(
    "error",
    "PURGE-CONFIG",
    "aucune date limite : --before=AAAA-MM-JJ est obligatoire. Aucune durée de conservation n'est appliquée par défaut."
  );
  console.error(
    "\nRefus : la durée de conservation des preuves est une décision humaine.\n" +
      "Indiquez explicitement la date limite, par exemple : --before=2026-01-01\n" +
      "Voir docs/SECURITY-MODEL.md (§ Rétention des preuves).\n"
  );
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
const proofStorageDir = process.env.PROOF_STORAGE_DIR;
if (!databaseUrl || !proofStorageDir) {
  annotate("error", "PURGE-CONFIG", "DATABASE_URL et PROOF_STORAGE_DIR sont requis");
  process.exit(1);
}

// Le module compilé de l'API est la source unique de la règle de chemin.
const storageModulePath = new URL("../apps/api/dist/apps/api/src/proofs/proof-storage.js", import.meta.url);
if (!existsSync(storageModulePath)) {
  annotate("error", "PURGE-CONFIG", "API non construite : lancez « npm run api:build » avant la purge");
  process.exit(1);
}
const { ProofStorage } = await import(storageModulePath.href);
const storage = new ProofStorage(proofStorageDir);

const { Client } = await import("pg");
const client = new Client({ connectionString: databaseUrl });
await client.connect();

let report;
try {
  const rows = await client.query(
    `SELECT id, "storageKey", "deletedAt"
       FROM proof_files
      WHERE "deletedAt" IS NOT NULL AND "deletedAt" <= $1
      ORDER BY "deletedAt" ASC
      LIMIT $2`,
    [new Date(before).toISOString(), limit]
  );

  const allRows = await client.query(
    `SELECT count(*)::int AS actives FROM proof_files WHERE "deletedAt" IS NULL`
  );

  const plan = planProofPurge(rows.rows, { before });
  if (plan.problems.length > 0) {
    annotate("error", "PURGE-PLAN", plan.problems.join(" | "));
    process.exit(1);
  }

  const results = [];
  for (const item of plan.deletions) {
    let absolute;
    try {
      // Même validation que l'API : segments sûrs, chemin confiné au volume.
      absolute = storage.absolutePath(item.storageKey);
    } catch (error) {
      results.push({ id: item.id, status: "CHEMIN_REFUSE", detail: error.message });
      continue;
    }
    if (!existsSync(absolute)) {
      // Idempotence : un fichier déjà absent n'est pas une erreur. La ligne reste.
      results.push({ id: item.id, status: "DEJA_ABSENT" });
      continue;
    }
    if (!confirm) {
      results.push({ id: item.id, status: "SERAIT_SUPPRIME", path: absolute });
      continue;
    }
    unlinkSync(absolute);
    results.push({ id: item.id, status: "SUPPRIME" });
  }

  report = {
    mode: confirm ? "EXECUTION" : "SIMULATION",
    before,
    softDeletedInWindow: rows.rowCount,
    activeProofsUntouched: allRows.rows[0].actives,
    skipped: plan.skipped.length,
    deletions: results,
  };

  const counts = results.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts)
    .map(([status, n]) => `${n} ${status.toLowerCase()}`)
    .join(", ");

  annotate(
    confirm ? "warning" : "notice",
    confirm ? "PURGE-EXECUTION" : "PURGE-SIMULATION",
    `${before} — ${summary || "rien à purger"} ; ${allRows.rows[0].actives} preuve(s) active(s) non touchée(s)` +
      (confirm ? "" : " (simulation : aucun fichier supprimé, relancer avec --confirm)")
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await client.end();
}
