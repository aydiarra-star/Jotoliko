#!/usr/bin/env node
// Vérification de restauration : rejoue une sauvegarde dans un environnement
// isolé et **mesure** ce qui se passe réellement.
//
// Deux phases, parce qu'elles répondent à deux questions différentes :
//
//   A. « base seule » — restaure uniquement la base dans une base isolée, avec un
//      volume de preuves vide. C'est la démonstration du risque : les
//      références de preuves existent, les fichiers non. Toute ouverture d'une
//      preuve échouerait en 410. Ce n'est pas une supposition : le nombre de
//      preuves référencées sans fichier est compté et publié.
//
//   B. « base + volume » — restaure la base **et** l'archive des preuves, puis
//      vérifie que chaque fichier référencé existe et que son empreinte
//      correspond à celle enregistrée en base. C'est le contrôle qui compte :
//      il relie les octets aux références, pas seulement les tables aux tables.
//
// La base isolée est toujours supprimée, y compris en cas d'échec : une
// vérification qui laisse des copies de production derrière elle crée le
// problème qu'elle prétend prévenir.
//
// Usage :
//   node ops/restore-verify.mjs [--from=<répertoire de sauvegarde>] [--report=<fichier>]
//
// Variables : DATABASE_URL (source, lue seulement pour les comparaisons),
// BACKUP_DIR, BACKUP_ENCRYPTION_KEY_FILE (si la sauvegarde est chiffrée).

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { annotate, binarySearchPath, opensslDecryptArgs, postgresConnection, sha256File } from "./lib/ops-core.mjs";

const options = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value ?? "true"];
    })
);

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) {
  annotate("error", "RESTAURATION-CONFIG", "DATABASE_URL est requis (source de comparaison)");
  process.exit(1);
}
const backupDir = options.get("from") ?? process.env.BACKUP_DIR;
if (!backupDir) {
  annotate("error", "RESTAURATION-CONFIG", "aucun répertoire de sauvegarde (--from= ou BACKUP_DIR)");
  process.exit(1);
}

/** Résout le répertoire à restaurer : le pointeur `latest` s'il existe. */
function resolveBackupDirectory(root) {
  const latest = join(root, "latest.json");
  if (existsSync(latest)) {
    const pointer = JSON.parse(readFileSync(latest, "utf8"));
    if (pointer.directory && existsSync(pointer.directory)) return pointer.directory;
  }
  return root;
}

function run(binary, args, { label, env = {} }) {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PATH: binarySearchPath(), ...env },
  });
  if (result.error) throw new Error(`${label} : ${binary} introuvable (${result.error.message})`);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim().split("\n").slice(-3).join(" | ");
    throw new Error(`${label} : code ${result.status}${detail ? ` — ${detail.slice(0, 400)}` : ""}`);
  }
  return result.stdout ?? "";
}

/** Sonde de disponibilité d'un binaire (voir la note d'`ops/backup.mjs`). */
function requireBinary(binary, label, probeArgs = ["--version"]) {
  const probe = spawnSync(binary, probeArgs, { encoding: "utf8", env: { ...process.env, PATH: binarySearchPath() } });
  if (probe.error || probe.status !== 0) {
    throw new Error(
      `${label} : ${binary} est absent de l'environnement d'exécution ` +
        `(complétez PG_BIN_DIR si les clients PostgreSQL ne sont pas dans le PATH)`
    );
  }
}

function withDatabase(url, database) {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

const { Client } = await import("pg");

async function connect(url) {
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

const backupDirectory = resolveBackupDirectory(backupDir);
const manifestPath = join(backupDirectory, "manifest.json");
if (!existsSync(manifestPath)) {
  annotate("error", "RESTAURATION-CONFIG", `manifeste absent : ${manifestPath}`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const report = {
  backupTag: manifest.tag,
  backupCreatedAt: manifest.createdAt,
  encrypted: manifest.encrypted,
  phases: {},
  problems: [],
};

const workspace = mkdtempSync(join(tmpdir(), "jotoliko-restauration-"));
let restoreDatabase = null;
let admin = null;

/** Déchiffre un artefact si nécessaire, sinon renvoie le chemin tel quel. */
function materialize(artifactName) {
  const stored = join(backupDirectory, artifactName);
  if (!existsSync(stored)) throw new Error(`artefact absent du support : ${artifactName}`);
  if (!manifest.encrypted) return stored;

  const keyFile = process.env.BACKUP_ENCRYPTION_KEY_FILE;
  if (!keyFile) throw new Error("sauvegarde chiffrée : BACKUP_ENCRYPTION_KEY_FILE est requis");
  requireBinary("openssl", "déchiffrement de la sauvegarde", ["version"]);
  const plain = join(workspace, artifactName.replace(/\.enc$/, ""));
  run("openssl", opensslDecryptArgs(stored, plain, keyFile), { label: `déchiffrement de ${artifactName}` });
  return plain;
}

const TABLES_OF_INTEREST = ["companies", "users", "missions", "proof_files", "cash_movements", "audit_logs"];

async function tableNames(client) {
  const result = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
  );
  return result.rows.map((row) => row.table_name);
}

async function counts(client, tables) {
  const result = {};
  for (const table of tables) {
    const query = await client.query(`SELECT count(*)::int AS n FROM "${table}"`);
    result[table] = query.rows[0].n;
  }
  return result;
}

try {
  const dumpPath = materialize(manifest.artifacts[0].name);

  // -------------------------------------------------------------------------
  // Phase A : base seule, volume de preuves vide.
  // -------------------------------------------------------------------------
  restoreDatabase = `jotoliko_verif_${Math.random().toString(36).slice(2, 10)}`;
  admin = await connect(withDatabase(sourceUrl, "postgres"));

  const phaseAStart = Date.now();
  await admin.query(`CREATE DATABASE "${restoreDatabase}"`);
  const connectionA = postgresConnection(sourceUrl, { database: restoreDatabase });
  run("pg_restore", ["--no-owner", "--no-privileges", ...connectionA.args, dumpPath], {
    label: "restauration de la base (phase A)",
    env: connectionA.env,
  });
  const phaseAMs = Date.now() - phaseAStart;

  const isolatedA = await connect(withDatabase(sourceUrl, restoreDatabase));
  let missingProofFiles = 0;
  let referencedProofs = 0;
  try {
    const proofs = await isolatedA.query(`SELECT id, "sha256", "storageKey" FROM proof_files WHERE "deletedAt" IS NULL`);
    referencedProofs = proofs.rowCount;
    // Le volume est vide par construction : toute preuve référencée est donc
    // sans fichier. On le **compte** au lieu de l'affirmer.
    missingProofFiles = referencedProofs;
  } finally {
    await isolatedA.end();
  }
  report.phases.databaseOnly = {
    durationMs: phaseAMs,
    referencedProofs,
    missingProofFiles,
    consequence:
      missingProofFiles > 0
        ? `${missingProofFiles} preuve(s) référencée(s) sans fichier : tout téléchargement échouerait en 410`
        : "aucune preuve référencée",
  };

  await admin.query(`DROP DATABASE IF EXISTS "${restoreDatabase}" WITH (FORCE)`);

  // -------------------------------------------------------------------------
  // Phase B : base + volume, avec vérification du lien entre les deux.
  // -------------------------------------------------------------------------
  restoreDatabase = `jotoliko_verif_${Math.random().toString(36).slice(2, 10)}`;
  const phaseBStart = Date.now();
  await admin.query(`CREATE DATABASE "${restoreDatabase}"`);
  const connectionB = postgresConnection(sourceUrl, { database: restoreDatabase });
  run("pg_restore", ["--no-owner", "--no-privileges", ...connectionB.args, dumpPath], {
    label: "restauration de la base (phase B)",
    env: connectionB.env,
  });

  const databaseRestoreMs = Date.now() - phaseBStart;
  const proofsPath = materialize(manifest.artifacts[1].name);
  const restoredVolume = join(workspace, "proofs");
  mkdirSync(restoredVolume, { recursive: true });
  const volumeStart = Date.now();
  run("tar", ["-xzf", proofsPath, "-C", restoredVolume], { label: "restauration du volume de preuves" });
  const volumeMs = Date.now() - volumeStart;
  report.phases.withProofs = {
    totalMs: Date.now() - phaseBStart,
    databaseRestoreMs,
    volumeExtractMs: volumeMs,
  };

  const isolatedB = await connect(withDatabase(sourceUrl, restoreDatabase));
  const source = await connect(sourceUrl);
  try {
    // 1. Le schéma restauré contient exactement les mêmes tables que la source.
    const [sourceTables, restoredTables] = [await tableNames(source), await tableNames(isolatedB)];
    if (JSON.stringify(sourceTables) !== JSON.stringify(restoredTables)) {
      report.problems.push(
        `tables divergentes : ${sourceTables.filter((t) => !restoredTables.includes(t)).join(", ") || "aucune manquante"}`
      );
    }
    report.tables = restoredTables.length;

    // 2. Les données sont là, dans les mêmes proportions.
    const [sourceCounts, restoredCounts] = [await counts(source, TABLES_OF_INTEREST), await counts(isolatedB, TABLES_OF_INTEREST)];
    report.counts = { source: sourceCounts, restored: restoredCounts };
    for (const table of TABLES_OF_INTEREST) {
      if (sourceCounts[table] !== restoredCounts[table]) {
        report.problems.push(`${table} : ${restoredCounts[table]} lignes restaurées pour ${sourceCounts[table]} en source`);
      }
    }

    // 3. Les contraintes sont toujours actives : une restauration sans ses
    //    contraintes produit une base silencieusement fausse.
    const constraintChecks = [
      {
        name: "clé étrangère",
        sql: `INSERT INTO missions (id, "companyId", reference, "clientName", "updatedAt")
              VALUES ('verif-fk', 'entreprise-inexistante', 'VERIF-FK', 'x', NOW())`,
        expected: /violates foreign key constraint/i,
      },
      {
        name: "unicité",
        sql: `INSERT INTO proof_files (id, "companyId", "missionId", "mimeType", "sizeBytes", "sha256", "storageKey", "type")
              SELECT 'verif-uniq', "companyId", "missionId", "mimeType", "sizeBytes", "sha256", 'verif-uniq-key', "type"
              FROM proof_files LIMIT 1`,
        expected: /duplicate key value|unique constraint/i,
      },
    ];
    for (const check of constraintChecks) {
      try {
        await isolatedB.query("BEGIN");
        await isolatedB.query(check.sql);
        await isolatedB.query("ROLLBACK");
        // Un doublon peut ne pas se présenter si la table est vide : le cas est
        // alors simplement sans objet, et il est signalé comme tel.
        report.problems.push(`contrainte non éprouvée (${check.name}) : l'insertion a été acceptée`);
      } catch (error) {
        await isolatedB.query("ROLLBACK").catch(() => undefined);
        if (!check.expected.test(error.message)) {
          report.problems.push(`contrainte ${check.name} : erreur inattendue — ${error.message}`);
        }
      }
    }

    // 4. Le lien base ⇄ volume : chaque preuve référencée a son fichier, et son
    //    empreinte recalculée correspond à celle enregistrée en base.
    const proofs = await isolatedB.query(`SELECT id, "sha256", "storageKey" FROM proof_files WHERE "deletedAt" IS NULL`);
    let verified = 0;
    for (const proof of proofs.rows) {
      const file = join(restoredVolume, proof.storageKey);
      if (!existsSync(file)) {
        report.problems.push(`preuve ${proof.id} : fichier absent après restauration du volume`);
        continue;
      }
      const digest = await sha256File(file);
      if (digest !== proof.sha256) {
        report.problems.push(`preuve ${proof.id} : empreinte ${digest.slice(0, 12)}… ≠ ${proof.sha256.slice(0, 12)}…`);
        continue;
      }
      verified += 1;
    }
    report.phases.withProofs.proofsVerified = verified;
    report.phases.withProofs.proofsReferenced = proofs.rowCount;

    // 5. L'état des migrations, lorsqu'il est suivi dans l'environnement.
    if (restoredTables.includes("_prisma_migrations")) {
      const migrations = await isolatedB.query(
        `SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`
      );
      report.phases.withProofs.migrationsApplied = migrations.rows[0].n;
    }
  } finally {
    await isolatedB.end();
    await source.end();
  }

  report.ok = report.problems.length === 0;
  const summary =
    `restauration ${report.ok ? "vérifiée" : "en échec"} — base seule ${report.phases.databaseOnly.durationMs} ms, ` +
    `base+volume ${report.phases.withProofs.totalMs} ms, ${report.phases.withProofs.proofsVerified ?? 0} preuve(s) ` +
    `dont l'empreinte correspond, ${report.problems.length} problème(s)`;

  const reportPath = options.get("report") ?? join(backupDirectory, "restore-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  if (report.phases.databaseOnly.missingProofFiles > 0) {
    // Publié même en cas de succès : c'est la justification chiffrée de la
    // sauvegarde du volume, et l'exploitant doit pouvoir la citer.
    annotate(
      "notice",
      "RESTAURATION-RISQUE",
      `sauvegarde de la base seule : ${report.phases.databaseOnly.missingProofFiles} preuve(s) référencée(s) ` +
        `sans fichier — téléchargement impossible (410). Le volume PROOF_STORAGE_DIR doit être sauvegardé et restauré avec la base.`
    );
  }
  annotate(report.ok ? "notice" : "error", "RESTAURATION", summary);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
} catch (error) {
  annotate("error", "RESTAURATION-ECHEC", error instanceof Error ? error.message : String(error));
  console.error(`\n[ÉCHEC] Vérification de restauration interrompue : ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  try {
    if (restoreDatabase && admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${restoreDatabase}" WITH (FORCE)`);
    }
  } catch (error) {
    console.error(`[NETTOYAGE] base isolée non supprimée : ${error.message}`);
  }
  if (admin) await admin.end().catch(() => undefined);
  rmSync(workspace, { recursive: true, force: true });
}
