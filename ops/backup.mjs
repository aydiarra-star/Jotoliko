#!/usr/bin/env node
// Sauvegarde opérationnelle : base PostgreSQL **et** volume de preuves.
//
// Ce script est celui qui tourne sur un planificateur (cron, timer systemd,
// tâche planifiée de l'hébergeur). Il est donc écrit pour être exploitable :
//   - il refuse de démarrer sur une configuration incomplète ;
//   - il sauvegarde les **deux** éléments, ou échoue en le disant ;
//   - il chiffre si une clé est fournie, jamais avec un secret passé en ligne de
//     commande (visible dans la table des processus) ;
//   - il vérifie ce qu'il vient d'écrire (relecture et empreintes) ;
//   - il applique la rétention sans jamais supprimer la sauvegarde en cours ;
//   - il signale tout échec par un code de sortie non nul **et** un message
//     exploitable, avec un crochet d'alerte optionnel.
//
// Usage :
//   node ops/backup.mjs [--dry-run] [--skip-retention]
//
// Variables : BACKUP_DIR, DATABASE_URL, PROOF_STORAGE_DIR,
// BACKUP_KEEP_DAILY, BACKUP_KEEP_WEEKLY, BACKUP_ENCRYPTION,
// BACKUP_ENCRYPTION_KEY_FILE, BACKUP_MIN_FREE_BYTES, BACKUP_ALERT_COMMAND.
//
// Ce que ce script ne fait pas : planifier, répliquer sur un site distant,
// alerter par lui-même sans destinataire configuré. Ces trois points relèvent de
// l'exploitant et sont listés dans docs/OPERATIONS-RUNBOOK.md.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  annotate,
  backupPaths,
  binarySearchPath,
  buildManifest,
  freeBytesOf,
  listBackups,
  loadBackupConfig,
  opensslEncryptArgs,
  postgresConnection,
  selectPrunable,
  sha256File,
  timestampTag,
  verifyBackupIntegrity,
} from "./lib/ops-core.mjs";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const SKIP_RETENTION = args.has("--skip-retention");

const { problems, config } = loadBackupConfig();
if (problems.length > 0) {
  annotate("error", "SAUVEGARDE-CONFIG", problems.join(" | "));
  console.error("\nConfiguration de sauvegarde invalide :\n- " + problems.join("\n- "));
  process.exit(1);
}

/** Exécute une commande en échouant proprement, sans jamais afficher de secret. */
function run(binary, cmdArgs, { label, env = {} }) {
  const result = spawnSync(binary, cmdArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PATH: binarySearchPath(), ...env },
  });
  if (result.error) throw new Error(`${label} : ${binary} introuvable (${result.error.message})`);
  if (result.status !== 0) {
    // La sortie d'erreur utile est conservée, tronquée. Le mot de passe de la
    // base ne peut pas y apparaître : il n'est transmis ni en argument de
    // commande, ni dans la sortie des outils (il passe par `PGPASSWORD`).
    const detail = (result.stderr || result.stdout || "").trim().split("\n").slice(-3).join(" | ");
    throw new Error(`${label} : code ${result.status}${detail ? ` — ${detail.slice(0, 400)}` : ""}`);
  }
  return result.stdout ?? "";
}

/**
 * Vérifie qu'un binaire est utilisable.
 *
 * La sonde est passée explicitement : `openssl --version` n'existe pas (la forme
 * est `openssl version`), et une sonde unique aurait déclaré openssl absent alors
 * qu'il est installé — donc désactivé le chiffrement des sauvegardes pour une
 * raison fausse.
 */
function requireBinary(binary, label, probeArgs = ["--version"]) {
  const probe = spawnSync(binary, probeArgs, { encoding: "utf8", env: { ...process.env, PATH: binarySearchPath() } });
  if (probe.error || probe.status !== 0) {
    throw new Error(
      `${label} : ${binary} est absent de l'environnement d'exécution ` +
        `(complétez PG_BIN_DIR si les clients PostgreSQL ne sont pas dans le PATH)`
    );
  }
}

async function main() {
  const startedAt = Date.now();
  const tag = timestampTag();
  const encrypted = config.encryption !== "none";
  const paths = backupPaths(config.backupDir, tag, { encrypted });

  if (!DRY_RUN) mkdirSync(config.backupDir, { recursive: true });

  // Un support de sauvegarde qui déborde fait échouer toutes les sauvegardes
  // suivantes : c'est signalé **avant** de commencer, pas après.
  const freeBytes = await freeBytesOf(config.backupDir);
  if (freeBytes !== null && freeBytes < config.minFreeBytes) {
    throw new Error(
      `espace insuffisant sur le support de sauvegarde : ${Math.round(freeBytes / 1048576)} Mio libres, ` +
        `seuil ${Math.round(config.minFreeBytes / 1048576)} Mio`
    );
  }

  if (!existsSync(config.proofStorageDir)) {
    // Sauvegarder la base seule en le taisant laisserait les preuves sans
    // protection : c'est exactement le risque à ne pas couvrir d'un silence.
    throw new Error(
      `volume de preuves introuvable (${config.proofStorageDir}) : sauvegarder la base seule laisserait ` +
        "les fichiers de preuve sans protection"
    );
  }

  if (DRY_RUN) {
    const existing = await listBackups(config.backupDir);
    const prunable = selectPrunable(existing, { keepDaily: config.keepDaily, keepWeekly: config.keepWeekly });
    annotate(
      "notice",
      "SAUVEGARDE-SIMULATION",
      `aucune écriture — destination ${paths.directory}, ${existing.length} sauvegarde(s) présente(s), ` +
        `${prunable.length} à purger selon la rétention`
    );
    console.log(JSON.stringify({ dryRun: true, directory: paths.directory, prunable: prunable.map((b) => b.tag) }, null, 2));
    return 0;
  }

  mkdirSync(paths.directory, { recursive: true });
  const staging = mkdtempSync(join(tmpdir(), "jotoliko-sauvegarde-"));
  try {
    requireBinary("pg_dump", "sauvegarde de la base");
    requireBinary("tar", "archivage des preuves");

    // 1. Base de données — format personnalisé : restaurable sélectivement, et
    //    vérifiable par `pg_restore --list` sans restauration.
    const dumpTemp = join(staging, "database.dump");
    // Connexion décomposée : le mot de passe passe par l'environnement, jamais par
    // la ligne de commande (voir `postgresConnection`).
    const connection = postgresConnection(config.databaseUrl);
    run(
      "pg_dump",
      ["--format=custom", "--no-owner", "--no-privileges", `--file=${dumpTemp}`, ...connection.args],
      { label: "sauvegarde de la base", env: connection.env }
    );

    // 2. Volume de preuves — archive compressée, contenu inchangé.
    const proofsTemp = join(staging, "proofs.tar.gz");
    run("tar", ["-czf", proofsTemp, "-C", config.proofStorageDir, "."], { label: "archivage des preuves" });

    // 3. Empreintes du **contenu en clair**, calculées maintenant : après
    //    chiffrement, ce contenu n'existe plus (et le garder annulerait le
    //    chiffrement de la sauvegarde).
    const dumpContentSha = await sha256File(dumpTemp);
    const proofsContentSha = await sha256File(proofsTemp);
    const dumpBytes = statSync(dumpTemp).size;
    const proofsBytes = statSync(proofsTemp).size;

    // 4. Chiffrement, si configuré. La clé vient d'un **fichier** : un secret en
    //    argument de commande apparaîtrait dans la table des processus.
    const store = (source, destination, label) => {
      if (!encrypted) {
        copyFileSync(source, destination);
        return;
      }
      requireBinary("openssl", "chiffrement de la sauvegarde", ["version"]);
      run("openssl", opensslEncryptArgs(source, destination, config.keyFile), { label });
    };

    store(dumpTemp, paths.database, "chiffrement de la base");
    store(proofsTemp, paths.proofs, "chiffrement des preuves");
    rmSync(staging, { recursive: true, force: true });

    // 5. Manifeste : empreinte des octets stockés (sur le support) **et** du
    //    contenu en clair (pour vérifier une restauration).
    const manifest = buildManifest({
      tag,
      createdAt: new Date().toISOString(),
      encrypted,
      database: {
        name: `database.dump${encrypted ? ".enc" : ""}`,
        bytes: statSync(paths.database).size,
        contentBytes: dumpBytes,
        sha256: await sha256File(paths.database),
        contentSha256: dumpContentSha,
      },
      proofs: {
        name: `proofs.tar.gz${encrypted ? ".enc" : ""}`,
        bytes: statSync(paths.proofs).size,
        contentBytes: proofsBytes,
        sha256: await sha256File(paths.proofs),
        contentSha256: proofsContentSha,
      },
      counts: { proofStorageBytes: proofsBytes },
    });
    writeFileSync(paths.manifest, JSON.stringify(manifest, null, 2));

    // 6. Vérification de ce qui vient d'être écrit : une sauvegarde non relue
    //    n'est qu'une intention de sauvegarde.
    const integrity = await verifyBackupIntegrity(paths.directory, manifest);

    // 7. Rétention. Elle s'exécute même si l'intégrité est en défaut — mais la
    //    sauvegarde en cours n'est jamais supprimée, et une sauvegarde
    //    invérifiable est signalée plutôt que conservée en silence.
    const pruned = [];
    if (!SKIP_RETENTION) {
      const existing = await listBackups(config.backupDir);
      for (const backup of selectPrunable(existing, { keepDaily: config.keepDaily, keepWeekly: config.keepWeekly })) {
        // Suppression par **nom de répertoire**, jamais par l'étiquette déclarée
        // dans le manifeste : une étiquette divergente ferait supprimer une autre
        // sauvegarde que celle visée.
        rmSync(join(config.backupDir, backup.directory ?? backup.tag), { recursive: true, force: true });
        pruned.push(backup.tag);
      }
    }

    const status = {
      tag,
      ok: integrity.ok,
      at: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      encrypted,
      artifacts: manifest.artifacts.map((artifact) => ({ name: artifact.name, bytes: artifact.bytes })),
      totalBytes: manifest.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0),
      pruned,
      problems: integrity.problems,
    };
    writeFileSync(paths.status, JSON.stringify(status, null, 2));

    // Pointeur `latest` : la restauration d'urgence ne doit pas exiger de
    // retrouver un horodatage dans une liste.
    writeFileSync(paths.latestPointer, JSON.stringify({ tag, directory: paths.directory }, null, 2));

    if (!integrity.ok) {
      throw new Error(`sauvegarde écrite mais non vérifiable : ${integrity.problems.join(" | ")}`);
    }

    annotate(
      "notice",
      "SAUVEGARDE",
      `${tag} — ${(status.totalBytes / 1048576).toFixed(1)} Mio, chiffrée : ${encrypted ? "oui" : "non"}, ` +
        `vérifiée, ${status.durationMs} ms${pruned.length > 0 ? `, ${pruned.length} ancienne(s) purgée(s)` : ""}`
    );
    console.log(JSON.stringify(status, null, 2));
    return 0;
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

try {
  process.exit(await main());
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  annotate("error", "SAUVEGARDE-ECHEC", message);
  console.error(`\n[ÉCHEC] Sauvegarde interrompue : ${message}`);

  // Crochet d'alerte : exécuté seulement s'il est configuré. Une alerte sans
  // destinataire réel n'existe pas — le message précédent est la seule trace.
  if (config?.alertCommand) {
    const alert = spawnSync(config.alertCommand, [message], { encoding: "utf8", shell: false });
    if (alert.error || alert.status !== 0) {
      console.error(`[ALERTE NON TRANSMISE] ${config.alertCommand} : ${alert.error?.message ?? `code ${alert.status}`}`);
    } else {
      console.error("Alerte transmise.");
    }
  } else {
    console.error(
      "Aucun BACKUP_ALERT_COMMAND configuré : cette défaillance n'est signalée que par ce message et ce code de sortie."
    );
  }
  process.exit(1);
}
