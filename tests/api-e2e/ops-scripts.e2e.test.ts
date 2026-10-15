// Test système des scripts d'exploitation — `ops/backup.mjs`,
// `ops/restore-verify.mjs`, `ops/prune-proofs.mjs`, `ops/healthcheck.mjs`.
//
// Pourquoi une suite distincte de `backup-restore.e2e.test.ts` : celle-ci prouve
// que PostgreSQL sait sauvegarder et restaurer ; celle-ci prouve que **les
// scripts réellement appelés en exploitation** fonctionnent — chiffrement,
// manifeste, rétention, décision de disponibilité, refus de purger sans date
// limite. Un script d'exploitation jamais exécuté est une intention, pas un
// outil : c'est exactement ce qui est vérifié ici, sur une vraie base.
//
// Aucun secret réel n'est utilisé : la clé de chiffrement est jetable et vit dans
// un répertoire temporaire.
//
// La production n'est jamais touchée : la restauration va dans une base tirée au
// sort, supprimée par le script lui-même.

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { verifyBackupIntegrity } from "../../ops/lib/ops-core.mjs";
import {
  connect,
  expectStatus,
  httpSuite,
  login,
  migrateFresh,
  pngBytes,
  proofPathOnDisk,
  REPO_ROOT,
  seedActor,
  seedCompany,
  seedMission,
  sha256OfFile,
  startApi,
  uploadProof,
  type RunningApi,
  type SqlClient,
} from "./harness";

/** Cherche un binaire PostgreSQL sur le PATH puis dans les installations locales. */
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

const PG_DUMP = findTool("pg_dump");
const PG_RESTORE = findTool("pg_restore");
const PG_BIN = PG_DUMP ? dirname(PG_DUMP) : "";
const TOOLS_AVAILABLE = Boolean(PG_DUMP && PG_RESTORE);

type OpsRun = { status: number | null; stdout: string; stderr: string };

/** Exécute un script d'exploitation comme le ferait un ordonnanceur. */
function runOps(script: string, args: string[], env: Record<string, string> = {}): OpsRun {
  const result = spawnSync(process.execPath, [join(REPO_ROOT, "ops", script), ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      // Les clients PostgreSQL doivent être joignables. On passe par la variable
      // prévue pour cela (`PG_BIN_DIR`) plutôt que par un `PATH` reconstruit :
      // c'est exactement le chemin de code qu'emprunte un ordonnanceur.
      ...(PG_BIN ? { PG_BIN_DIR: PG_BIN } : {}),
      ...env,
    },
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function readJson<T = any>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** Port libre, puis fermé : simule un service absent. */
async function closedPort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

httpSuite("Scripts d'exploitation : sauvegarde, restauration, rétention, supervision", () => {
  // Deux états : sans les clients PostgreSQL, ces tests ne peuvent pas prouver
  // ce qu'ils annoncent, et le disent au lieu de simuler.
  const suite = TOOLS_AVAILABLE ? it : it.skip;
  if (!TOOLS_AVAILABLE) {
    console.warn(
      "[ops] pg_dump/pg_restore absents : les scripts d'exploitation ne peuvent pas être exécutés ici. " +
        "Ils le sont en CI (job « e2e », image ubuntu-latest avec les clients PostgreSQL)."
    );
  }

  let db: SqlClient;
  let api: RunningApi;
  let companyId: string;
  let missionId: string;
  let proofId: string;
  let proofStorageDir: string;
  let activeProofPath: string;
  let backupRoot: string;
  let encryptedRoot: string;
  let sealedRoot: string;

  const envBase = () => ({
    DATABASE_URL: process.env.DATABASE_URL as string,
    PROOF_STORAGE_DIR: proofStorageDir,
  });

  beforeAll(async () => {
    db = await connect();
    await migrateFresh(db);

    const slug = `ops-${Date.now().toString(36)}`;
    companyId = await seedCompany(db, slug);
    const manager = await seedActor(db, { companyId, role: "MANAGER" });
    missionId = await seedMission(db, {
      companyId,
      reference: "OPS-1",
      status: "LIVREE",
      expectedAmount: 15000,
      collectedAmount: 15000,
      assignedUserId: manager.userId,
    });

    api = await startApi();
    const token = await login(api, slug, manager);
    const content = pngBytes();
    // Le chemin est **recomposé** ici avec la règle du service
    // (`entreprise/mission/empreinte.extension`) : c'est cette convention que la
    // sauvegarde du volume doit retrouver, pas un chemin deviné.
    const digest = createHash("sha256").update(content).digest("hex");
    const proof = await uploadProof(api, token, missionId, { content });
    // `expectStatus` joint la fin des journaux serveur en cas de 500 : sans cela,
    // un échec ici ne dirait rien de la cause depuis les annotations de la CI.
    expectStatus(proof, 201, "dépôt de la preuve d'exercice");
    proofId = proof.body.id;
    proofStorageDir = api.proofStorageDir;
    activeProofPath = proofPathOnDisk(api, companyId, missionId, digest, "png");

    // Le dépôt a réellement écrit un fichier : sans cela, le test de
    // sauvegarde des preuves ne prouverait rien.
    expect(existsSync(activeProofPath)).toBe(true);

    backupRoot = mkdtempSync(join(tmpdir(), "jotoliko-ops-backup-"));
    encryptedRoot = mkdtempSync(join(tmpdir(), "jotoliko-ops-chiffre-"));
    sealedRoot = mkdtempSync(join(tmpdir(), "jotoliko-ops-scelle-"));
  }, 120_000);

  afterAll(async () => {
    await api?.stop();
    for (const root of [backupRoot, encryptedRoot, sealedRoot]) {
      if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
    }
    await db?.close();
  });

  suite("sauvegarde réelle : base et volume de preuves, manifeste vérifiable", async () => {
    const run = runOps("backup.mjs", [], { ...envBase(), BACKUP_DIR: backupRoot });
    expect(run.status, `sauvegarde en échec :\n${run.stdout}\n${run.stderr}`).toBe(0);

    const latest = readJson<{ tag: string; directory: string }>(join(backupRoot, "latest.json"));
    expect(latest.directory).toBeTruthy();

    const manifest = readJson(join(latest.directory, "manifest.json"));
    expect(manifest.manifestVersion).toBe(1);
    // Deux artefacts : une sauvegarde de base sans les preuves laisserait des
    // pièces justificatives sans protection.
    expect(manifest.artifacts).toHaveLength(2);
    for (const artifact of manifest.artifacts) {
      expect(artifact.bytes).toBeGreaterThan(0);
      expect(artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
      // L'empreinte du contenu en clair est celle qui validera une restauration.
      expect(artifact.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    }

    // L'intégrité est revérifiée par le socle commun, sur les octets réellement
    // écrits : c'est le contrôle qu'un ordonnanceur doit pouvoir refaire.
    expect(await verifyBackupIntegrity(latest.directory, manifest)).toEqual({ ok: true, problems: [] });

    // Le manifeste décrit la sauvegarde, pas une intention de sauvegarde.
    expect(manifest.database.rows ?? null).not.toBeNull();
    expect(readJson(join(backupRoot, "status.json")).ok).toBe(true);
  }, 90_000);

  suite("restauration mesurée : les preuves restaurées portent la même empreinte que la base", async () => {
    const reportPath = join(sealedRoot, "restore-report.json");
    const run = runOps("restore-verify.mjs", [`--from=${backupRoot}`, `--report=${reportPath}`], envBase());
    expect(run.status, `restauration en échec :\n${run.stdout}\n${run.stderr}`).toBe(0);

    const report = readJson(reportPath);
    expect(report.problems).toEqual([]);
    expect(report.ok).toBe(true);

    // Phase B — le contrôle qui compte : chaque preuve référencée en base a son
    // fichier restauré, et l'empreinte recalculée correspond.
    expect(report.phases.withProofs.proofsReferenced).toBeGreaterThanOrEqual(1);
    expect(report.phases.withProofs.proofsVerified).toBe(report.phases.withProofs.proofsReferenced);

    // Phase A — la justification chiffrée de sauvegarder le volume : une
    // sauvegarde de la base seule laisse toutes les preuves sans fichier.
    expect(report.phases.databaseOnly.referencedProofs).toBeGreaterThanOrEqual(1);
    expect(report.phases.databaseOnly.missingProofFiles).toBe(report.phases.databaseOnly.referencedProofs);

    // Durées réellement mesurées (RTO). Elles sont publiées dans les annotations
    // du job pour pouvoir être citées dans le rapport de préparation.
    const databaseMs = report.phases.withProofs.databaseRestoreMs;
    const totalMs = report.phases.withProofs.totalMs;
    expect(databaseMs).toBeGreaterThan(0);
    expect(totalMs).toBeGreaterThanOrEqual(databaseMs);
    console.log(
      `::notice title=RTO-MESURÉ::restauration « base + volume » ${totalMs} ms ` +
        `(base ${databaseMs} ms, volume ${report.phases.withProofs.volumeExtractMs} ms) ; ` +
        `sauvegarde produite le ${report.backupCreatedAt} ; ` +
        `${report.phases.withProofs.proofsVerified}/${report.phases.withProofs.proofsReferenced} preuve(s) vérifiée(s) ; ` +
        `base seule : ${report.phases.databaseOnly.durationMs} ms et ${report.phases.databaseOnly.missingProofFiles} preuve(s) sans fichier`
    );
  }, 120_000);

  suite("sauvegarde chiffrée : le support ne contient pas de données en clair", async () => {
    const keyFile = join(sealedRoot, "cle-chiffrement");
    writeFileSync(keyFile, `cle-jetable-${randomUUID()}`, { mode: 0o600 });

    const env = {
      ...envBase(),
      BACKUP_DIR: encryptedRoot,
      BACKUP_ENCRYPTION: "openssl-aes256",
      BACKUP_ENCRYPTION_KEY_FILE: keyFile,
    };
    const run = runOps("backup.mjs", [], env);
    expect(run.status, `sauvegarde chiffrée en échec :\n${run.stdout}\n${run.stderr}`).toBe(0);

    const latest = readJson<{ directory: string }>(join(encryptedRoot, "latest.json"));
    const manifest = readJson(join(latest.directory, "manifest.json"));
    expect(manifest.encrypted).toBe(true);

    const dumpArtifact = manifest.artifacts[0];
    // Le chiffrement a réellement eu lieu : les octets stockés ne portent plus
    // l'en-tête d'un vidage PostgreSQL (« PGDMP »). Une sauvegarde annoncée
    // chiffrée mais stockée en clair serait le pire des deux mondes.
    const stored = readFileSync(join(latest.directory, dumpArtifact.name));
    expect(stored.subarray(0, 5).toString("latin1")).not.toBe("PGDMP");
    expect(dumpArtifact.name.endsWith(".enc")).toBe(true);

    // La sauvegarde chiffrée est restaurable avec la clé, et **seulement** avec
    // elle : une clé erronée doit produire un échec, jamais un fichier
    // silencieusement faux.
    const wrongKey = join(sealedRoot, "mauvaise-cle");
    writeFileSync(wrongKey, "cle-incorrecte", { mode: 0o600 });
    const withWrongKey = runOps("restore-verify.mjs", [`--from=${encryptedRoot}`], {
      ...env,
      BACKUP_ENCRYPTION_KEY_FILE: wrongKey,
    });
    expect(withWrongKey.status).not.toBe(0);
    expect(`${withWrongKey.stdout}${withWrongKey.stderr}`).toMatch(/RESTAURATION-ECHEC|déchiffrement/);

    const withRightKey = runOps("restore-verify.mjs", [`--from=${encryptedRoot}`, `--report=${join(sealedRoot, "chiffre.json")}`], env);
    expect(withRightKey.status, `restauration chiffrée en échec :\n${withRightKey.stdout}\n${withRightKey.stderr}`).toBe(0);
    expect(readJson(join(sealedRoot, "chiffre.json")).ok).toBe(true);
  }, 180_000);

  suite("purge des preuves : rien n'est supprimé sans date limite ni confirmation", async () => {
    // Trois preuves : une active (celle déposée par l'API), une supprimée il y a
    // longtemps, une supprimée récemment.
    const makeProof = (suffix: string) => {
      const storageKey = `${companyId}/${missionId}/purge-${suffix}.png`;
      const path = join(proofStorageDir, storageKey);
      writeFileSync(path, Buffer.from(`preuve ${suffix}`));
      return { storageKey, path, sha256: sha256OfFile(path) };
    };

    const ancienne = makeProof("ancienne");
    const recente = makeProof("recente");
    const rows: [ReturnType<typeof makeProof>, string][] = [
      [ancienne, "2025-06-01T00:00:00.000Z"],
      [recente, new Date().toISOString()],
    ];
    for (const [proof, deletedAt] of rows) {
      await db.query(
        `INSERT INTO proof_files (id, "companyId", "missionId", "mimeType", "sizeBytes", "sha256", "storageKey", "type", "deletedAt")
         VALUES ($1, $2, $3, 'image/png', $4, $5, $6, 'PHOTO', $7::timestamp)`,
        [randomUUID(), companyId, missionId, statSync(proof.path).size, proof.sha256, proof.storageKey, deletedAt]
      );
    }

    const env = envBase();

    // 1. Sans date limite : refus. La durée de conservation est une décision
    //    humaine, elle ne peut pas être implicite.
    const sansDate = runOps("prune-proofs.mjs", ["--confirm"], env);
    expect(sansDate.status).not.toBe(0);
    expect(`${sansDate.stdout}${sansDate.stderr}`).toMatch(/durée de conservation|--before/);
    expect(existsSync(ancienne.path)).toBe(true);

    // 2. Simulation : la preuve échue serait supprimée, mais rien ne l'est.
    const simulation = runOps("prune-proofs.mjs", ["--before=2026-01-01"], env);
    expect(simulation.status).toBe(0);
    const planSimule = JSON.parse(simulation.stdout);
    expect(planSimule.mode).toBe("SIMULATION");
    expect(planSimule.deletions.map((d: { status: string }) => d.status)).toContain("SERAIT_SUPPRIME");
    expect(existsSync(ancienne.path)).toBe(true);

    // 3. Exécution réelle : seule la preuve supprimée avant la date limite part.
    const execution = runOps("prune-proofs.mjs", ["--before=2026-01-01", "--confirm"], env);
    expect(execution.status, `purge en échec :\n${execution.stdout}\n${execution.stderr}`).toBe(0);
    const rapport = JSON.parse(execution.stdout);
    expect(rapport.mode).toBe("EXECUTION");
    expect(existsSync(ancienne.path)).toBe(false);
    // La preuve supprimée récemment et la preuve active sont intactes.
    expect(existsSync(recente.path)).toBe(true);
    expect(existsSync(activeProofPath)).toBe(true);

    // 4. Les lignes en base sont conservées : l'auditabilité survit à la
    //    suppression du fichier, et le contrôle d'intégrité doit continuer à
    //    voir une base cohérente.
    const row = await db.query<{ n: string }>(
      `SELECT count(*)::int AS n FROM proof_files WHERE "storageKey" = $1`,
      [ancienne.storageKey]
    );
    expect(Number(row.rows[0]?.n ?? 0)).toBe(1);
    const active = await db.query<{ n: string }>(`SELECT count(*)::int AS n FROM proof_files WHERE id = $1`, [proofId]);
    expect(Number(active.rows[0]?.n ?? 0)).toBe(1);
    expect(rapport.activeProofsUntouched).toBeGreaterThanOrEqual(1);
  }, 90_000);

  suite("supervision : la sonde distingue disponible, dégradé et injoignable", async () => {
    // 1. Service nominal.
    const nominal = runOps("healthcheck.mjs", [`--url=${api.baseUrl}`], {});
    expect(nominal.status).toBe(0);
    const disponible = JSON.parse(nominal.stdout);
    expect(disponible.state).toBe("DISPONIBLE");
    expect(disponible.checks.storage).toBe("ok");
    expect(disponible.storageFreeBytes).toBeGreaterThan(0);
    expect(disponible.storageMinFreeBytes).toBeGreaterThan(0);

    // 2. Service absent : code 2 — « intervenir », pas « surveiller ».
    const absent = runOps("healthcheck.mjs", [`--url=http://127.0.0.1:${await closedPort()}`], {});
    expect(absent.status).toBe(2);
    expect(JSON.parse(absent.stdout).state).toBe("INDISPONIBLE");

    // 3. Service vivant mais base indisponible : code 1 — dégradé. C'est le cas
    //    qui doit alerter sans redémarrer l'instance en boucle.
    const baseAbsente = `postgresql://jotoliko:jotoliko@localhost:5432/jotoliko_absente_${randomUUID().slice(0, 8)}`;
    const degradeApi = await startApi({ env: { DATABASE_URL: baseAbsente }, timeoutMs: 60_000 });
    try {
      const degrade = runOps("healthcheck.mjs", [`--url=${degradeApi.baseUrl}`, "--timeout=40000"], {});
      expect(degrade.status).toBe(1);
      const verdict = JSON.parse(degrade.stdout);
      expect(verdict.state).toBe("DEGRADE");
      expect(verdict.checks.database).toBe("unreachable");
      // Le service reste vivant : il n'est pas question de le redémarrer.
      expect(verdict.checks.storage).toBe("ok");
    } finally {
      await degradeApi.stop();
    }
  }, 120_000);

  suite("la sonde n'invente pas de succès quand rien ne répond", async () => {
    // Un outil de supervision qui renvoie 0 sans avoir joint le service est plus
    // dangereux que pas d'outil du tout.
    const run = runOps("healthcheck.mjs", [`--url=http://127.0.0.1:${await closedPort()}`, "--timeout=2000"], {});
    expect(run.status).toBe(2);
    expect(run.stdout).toMatch(/INDISPONIBLE/);
  }, 30_000);

  suite("les scripts refusent une configuration incomplète plutôt que de produire un faux succès", () => {
    const sansUrl = runOps("backup.mjs", [], { BACKUP_DIR: sealedRoot, PROOF_STORAGE_DIR: proofStorageDir });
    expect(sansUrl.status).not.toBe(0);
    expect(`${sansUrl.stdout}${sansUrl.stderr}`).toMatch(/DATABASE_URL/);

    // Une sauvegarde de la base seule : les preuves resteraient sans protection.
    const sansPreuves = runOps("backup.mjs", [], {
      DATABASE_URL: process.env.DATABASE_URL as string,
      BACKUP_DIR: sealedRoot,
    });
    expect(sansPreuves.status).not.toBe(0);
    expect(`${sansPreuves.stdout}${sansPreuves.stderr}`).toMatch(/PROOF_STORAGE_DIR/);
  }, 60_000);
});

// Garde-fou du harnais : le chemin des scripts d'exploitation doit exister, même
// lorsque la suite est ignorée faute de base. Un renommage silencieux ferait
// passer une suite vide pour une suite réussie.
it("les scripts d'exploitation sont présents à l'emplacement documenté", () => {
  for (const script of ["backup.mjs", "restore-verify.mjs", "prune-proofs.mjs", "healthcheck.mjs"]) {
    expect(existsSync(join(REPO_ROOT, "ops", script)), script).toBe(true);
  }
  expect(existsSync(join(REPO_ROOT, "docs", "OPERATIONS-RUNBOOK.md"))).toBe(true);
});
