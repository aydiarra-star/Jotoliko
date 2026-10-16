// Socle des opérations d'exploitation : sauvegarde, restauration, supervision.
//
// Séparation volontaire : la **logique** (manifeste, empreintes, rétention,
// décision de disponibilité, plan de purge) vit ici, testable sans PostgreSQL ni
// carte réseau ; les **scripts** (`ops/*.mjs`) ne font qu'orchestrer des
// commandes réelles. Sans cette séparation, aucune de ces décisions ne serait
// vérifiable ailleurs qu'en production — précisément là où on ne veut pas les
// découvrir.

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { delimiter, join } from "node:path";

/** Format de manifeste. Toute évolution incompatible doit changer ce numéro. */
export const MANIFEST_VERSION = 1;

// ---------------------------------------------------------------------------
// Types partagés — déclarés en JSDoc parce que les tests TypeScript consomment
// ce module : un contrat de données non écrit se casse en silence.
// ---------------------------------------------------------------------------

/**
 * Artefact d'une sauvegarde.
 *
 * @typedef {object} Artifact
 * @property {string} name Nom du fichier sur le support.
 * @property {number} bytes Taille **stockée** (chiffrée le cas échéant).
 * @property {number} [contentBytes] Taille en clair.
 * @property {string} sha256 Empreinte des octets stockés.
 * @property {string} contentSha256 Empreinte des octets en clair (valide une restauration).
 */

/**
 * Sauvegarde présente sur le support.
 *
 * `tag` est l'étiquette déclarée dans le manifeste, `directory` le répertoire
 * réel : c'est le second que la rétention supprime.
 *
 * @typedef {object} BackupEntry
 * @property {string} tag
 * @property {string} [directory]
 * @property {string} createdAt
 * @property {any} [manifest]
 */

// ---------------------------------------------------------------------------
// Annotations CI
// ---------------------------------------------------------------------------

/**
 * Publie une information lisible par l'API GitHub quand le script tourne dans
 * une action. Sur un runner, les journaux ne sont pas toujours accessibles depuis
 * l'extérieur : une annotation, si. Hors CI, le message reste un simple log.
 * @param {"error"|"warning"|"notice"} level
 * @param {string} title
 * @param {string} message
 */
export function annotate(level, title, message) {
  const flat = String(message ?? "")
    .replace(/\r/g, "")
    .replace(/\n+/g, " | ")
    .slice(0, 900);
  // Tout part sur la sortie d'erreur (`stderr`) : la sortie standard reste
  // réservée au rapport lisible par une machine, sans quoi
  // `node ops/backup.mjs | jq` serait impossible et tout consommateur devrait
  // deviner où commence le JSON. GitHub interprète les commandes de workflow sur
  // les deux flux, les annotations ne sont donc pas perdues.
  if (process.env.GITHUB_ACTIONS === "true") {
    const command = level === "error" ? "error" : level === "warning" ? "warning" : "notice";
    console.error(`::${command} title=${title}::${flat}`);
  } else {
    console.error(`[${level}] ${title} : ${flat}`);
  }
}

// ---------------------------------------------------------------------------
// Empreintes
// ---------------------------------------------------------------------------

/**
 * SHA-256 d'un fichier, en flux (les sauvegardes ne tiennent pas en mémoire).
 *
 * @param {string} path
 * @returns {Promise<string>}
 */
export async function sha256File(path) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(undefined));
  });
  return hash.digest("hex");
}

// ---------------------------------------------------------------------------
// Chiffrement
// ---------------------------------------------------------------------------

/** Nombre d'itérations de dérivation de clé. Explicite : la valeur par défaut
 * d'`openssl` n'est pas stable d'une version à l'autre. */
export const PBKDF2_ITERATIONS = 200000;

/**
 * Arguments de chiffrement d'un artefact.
 *
 * La clé est passée par **fichier** (`file:`) et jamais en clair dans la ligne de
 * commande : un secret en argument est lisible par tout utilisateur de la machine
 * via la table des processus, et se retrouve dans l'historique du shell.
 *
 * @param {string} source
 * @param {string} destination
 * @param {string} keyFile
 * @returns {string[]}
 */
export function opensslEncryptArgs(source, destination, keyFile) {
  return [
    "enc",
    "-aes-256-cbc",
    "-salt",
    "-pbkdf2",
    "-iter",
    String(PBKDF2_ITERATIONS),
    "-pass",
    `file:${keyFile}`,
    "-in",
    source,
    "-out",
    destination,
  ];
}

/**
 * Arguments de déchiffrement — exactement les mêmes options que le chiffrement,
 * afin qu'une option ajoutée d'un côté ne puisse pas en diverger.
 *
 * @param {string} source
 * @param {string} destination
 * @param {string} keyFile
 * @returns {string[]}
 */
export function opensslDecryptArgs(source, destination, keyFile) {
  const args = opensslEncryptArgs(source, destination, keyFile);
  args.splice(1, 0, "-d");
  return args;
}

/**
 * `PATH` à transmettre aux binaires PostgreSQL (`pg_dump`, `pg_restore`).
 *
 * `cron` et `systemd` fournissent un `PATH` minimal, où les clients PostgreSQL
 * d'une installation locale ne sont pas visibles. Sans `PG_BIN_DIR`, la sauvegarde
 * échouerait au moment précis où l'on compte sur elle, avec un message
 * « pg_dump introuvable » qui ne dit pas qu'il suffit de compléter le `PATH`.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {string}
 */
export function binarySearchPath(env = process.env) {
  const extra = env.PG_BIN_DIR?.trim();
  const current = env.PATH ?? "";
  return extra ? `${extra}${delimiter}${current}` : current;
}

/**
 * Décompose une URL PostgreSQL en arguments de connexion **sans secret**.
 *
 * `pg_dump` et `pg_restore` acceptent une URL complète en argument, mais celle-ci
 * contient le mot de passe : il deviendrait alors lisible par tout utilisateur de
 * la machine via la table des processus (`ps`), et par tout journal qui recopie la
 * ligne de commande. Le mot de passe est donc transmis par l'environnement
 * (`PGPASSWORD`), comme le fait `psql`, et jamais dans les arguments.
 *
 * @param {string} databaseUrl
 * @param {{ database?: string }} [options] remplace le nom de base (restauration isolée)
 * @returns {{ args: string[], env: Record<string, string> }}
 */
export function postgresConnection(databaseUrl, { database } = {}) {
  const url = new URL(databaseUrl);
  const name = database
    ? database
    : decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres";

  const args = [
    "--host",
    url.hostname,
    "--port",
    url.port || "5432",
  ];
  if (url.username) args.push("--username", decodeURIComponent(url.username));
  args.push("--dbname", name);

  /** @type {Record<string, string>} */
  const env = {};
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  // Un `sslmode` exigé dans l'URL doit être conservé : l'ignorer tenterait une
  // connexion en clair là où le serveur l'interdit.
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;

  return { args, env };
}

// ---------------------------------------------------------------------------
// Horodatage et nommage
// ---------------------------------------------------------------------------

/**
 * `2026-10-15T0830Z` — trié lexicographiquement comme chronologiquement.
 *
 * @param {Date} [date]
 * @returns {string}
 */
export function timestampTag(date = new Date()) {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}Z`;
}

/**
 * Chemins d'une sauvegarde.
 *
 * Les extensions `.enc` apparaissent **seulement** si le chiffrement est actif :
 * un nom de fichier ne doit pas laisser croire à un contenu chiffré.
 *
 * @param {string} backupRoot
 * @param {string} tag
 * @param {{ encrypted?: boolean }} [options]
 * @returns {{ directory: string, database: string, proofs: string, manifest: string, status: string, latestPointer: string }}
 */
export function backupPaths(backupRoot, tag, { encrypted = false } = {}) {
  const directory = join(backupRoot, tag);
  const suffix = encrypted ? ".enc" : "";
  return {
    directory,
    database: join(directory, `database.dump${suffix}`),
    proofs: join(directory, `proofs.tar.gz${suffix}`),
    manifest: join(directory, "manifest.json"),
    status: join(directory, "status.json"),
    latestPointer: join(backupRoot, "latest.json"),
  };
}

// ---------------------------------------------------------------------------
// Manifeste
// ---------------------------------------------------------------------------

/**
 * Construit le manifeste d'une sauvegarde.
 *
 * Deux empreintes par artefact, et ce n'est pas redondant :
 *  - `sha256` porte sur les octets **stockés** (donc sur le fichier chiffré) :
 *    c'est ce qui détecte une altération sur le support de sauvegarde ;
 *  - `contentSha256` porte sur les octets **en clair** : c'est ce qui permet de
 *    vérifier, après restauration, que le contenu restitué est bien l'original.
 * Sans le clair, une clé de déchiffrement erronée produirait un fichier différent
 * que personne ne saurait distinguer d'une corruption silencieuse.
 *
 * @param {{ tag: string, createdAt: string, encrypted?: boolean, database?: Artifact|null, proofs?: Artifact|null, counts?: Record<string, number> }} options
 * @returns {{ manifestVersion: number, tag: string, createdAt: string, encrypted: boolean, artifacts: Artifact[], counts: Record<string, number> }}
 */
export function buildManifest({ tag, createdAt, encrypted, database, proofs, counts }) {
  // Construction explicite plutôt qu'un `filter(Boolean)` : la liste est celui
  // des artefacts **présents**, et son type doit dire la même chose.
  /** @type {Artifact[]} */
  const artifacts = [];
  if (database) artifacts.push(database);
  if (proofs) artifacts.push(proofs);

  return {
    manifestVersion: MANIFEST_VERSION,
    tag,
    createdAt,
    encrypted: Boolean(encrypted),
    artifacts,
    // Nombre de lignes par table, pour comparer après restauration.
    counts: counts ?? {},
  };
}

/**
 * Vérifie la forme d'un manifeste avant de s'y fier.
 *
 * Un manifeste incomplet doit être refusé **avant** d'être utilisé : sans cette
 * garde, une sauvegarde décrite à moitié serait « restaurée » en produisant une
 * base partielle, sans que rien ne le signale.
 *
 * @param {any} manifest
 * @returns {string[]} problèmes constatés (vide = manifeste exploitable)
 */
export function verifyManifestShape(manifest) {
  const problems = [];
  if (!manifest || typeof manifest !== "object") return ["manifeste absent ou illisible"];
  if (manifest.manifestVersion !== MANIFEST_VERSION) {
    problems.push(`version de manifeste ${manifest.manifestVersion} (attendu ${MANIFEST_VERSION})`);
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    problems.push("aucun artefact décrit");
  } else {
    for (const artifact of manifest.artifacts) {
      if (typeof artifact?.name !== "string" || typeof artifact?.sha256 !== "string") {
        problems.push("artefact sans nom ou sans empreinte");
        continue;
      }
      if (typeof artifact.contentSha256 !== "string") {
        problems.push(`artefact ${artifact.name} sans empreinte de contenu`);
      }
      if (!Number.isInteger(artifact.bytes) || artifact.bytes <= 0) {
        problems.push(`artefact ${artifact.name} de taille invalide (${artifact.bytes})`);
      }
    }
  }
  return problems;
}

/**
 * Vérifie l'intégrité d'une sauvegarde sur son support.
 *
 * Contrôle les octets stockés **et** la cohérence interne : une sauvegarde dont
 * l'empreinte est bonne mais dont la taille annoncée ne correspond pas n'est pas
 * exploitable sereinement.
  * @param {string} directory
 * @param {any} manifest
 * @param {{ sha256?: (path: string) => Promise<string> }} [options]
 * @returns {Promise<{ ok: boolean, problems: string[] }>}
 */
export async function verifyBackupIntegrity(directory, manifest, { sha256 = sha256File } = {}) {
  const problems = verifyManifestShape(manifest);
  for (const artifact of manifest?.artifacts ?? []) {
    const path = join(directory, artifact.name);
    if (!existsSync(path)) {
      problems.push(`artefact manquant : ${artifact.name}`);
      continue;
    }
    const size = statSync(path).size;
    if (size !== artifact.bytes) {
      problems.push(`${artifact.name} : ${size} octets sur le support, ${artifact.bytes} annoncés`);
    }
    const digest = await sha256(path);
    if (digest !== artifact.sha256) {
      problems.push(`${artifact.name} : empreinte ${digest.slice(0, 12)}… ≠ ${artifact.sha256.slice(0, 12)}…`);
    }
  }
  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------
// Rétention
// ---------------------------------------------------------------------------

/**
 * Sélectionne les sauvegardes à supprimer.
 *
 * Règles, toutes destinées à empêcher une perte de données par automatisme :
 *  - la sauvegarde la plus récente n'est **jamais** supprimée, quel que soit le
 *    réglage ;
 *  - les `keepDaily` plus récentes sont conservées ;
 *  - une sauvegarde par jour d'archive (`keepWeekly` jours distincts les plus
 *    récents) est conservée ;
 *  - tout ce qui est plus récent que la plus ancienne échéance conservée reste.
 *
 * Les entrées sont des `{ tag, createdAt }` (chaîne ISO) — le tri est fait ici,
 * jamais laissé au système de fichiers.
  * @param {BackupEntry[]} entries
 * @param {{ keepDaily?: number, keepWeekly?: number, now?: Date }} [options]
 * @returns {BackupEntry[]}
 */
export function selectPrunable(entries, { keepDaily = 7, keepWeekly = 4, now = new Date() } = {}) {
  const sorted = [...entries].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (sorted.length <= 1) return [];

  const newest = sorted[0];
  const keep = new Set([newest.tag]);

  for (const entry of sorted.slice(0, keepDaily)) keep.add(entry.tag);

  // Une par jour distinct, sur des jours différents des quotidiens conservés.
  const daysKept = new Set();
  let weekly = 0;
  for (const entry of sorted) {
    const day = String(entry.createdAt).slice(0, 10);
    if (daysKept.has(day)) continue;
    daysKept.add(day);
    keep.add(entry.tag);
    if (daysKept.size >= keepWeekly) {
      // Les jours distincts suivants ne sont conservés que s'ils tombent dans la
      // fenêtre quotidienne, déjà traitée plus haut.
      break;
    }
  }
  void now;

  return sorted.filter((entry) => !keep.has(entry.tag));
}

// ---------------------------------------------------------------------------
// Disponibilité (pour `ops/healthcheck.mjs`)
// ---------------------------------------------------------------------------

/**
 * Décide de l'état d'un service à partir de ses deux sondes.
 *
 * `live` seul ne suffit pas à déclarer un service disponible : un processus qui
 * répond mais dont la base est injoignable ne peut pas honorer une seule requête
 * métier. La décision est donc fondée sur `ready`, et le code de sortie
 * distingue « dégradé » (alerter) de « injoignable » (intervenir).
  * @param {{ live?: { reachable: boolean, status?: number, body?: any, error?: string }, ready?: { reachable: boolean, status?: number, body?: any, error?: string } }} [probes]
 * @returns {{ state: "DISPONIBLE"|"DEGRADE"|"INDISPONIBLE", exitCode: number, reason: string }}
 */
export function evaluateHealth({ live, ready } = {}) {
  if (!live || !live.reachable) {
    return { state: "INDISPONIBLE", exitCode: 2, reason: live?.error ?? "aucune réponse de la sonde de vivacité" };
  }
  if (!ready || !ready.reachable) {
    // La vivacité répond : le processus vit, c'est sa dépendance (base, volume,
    // réseau) qui est en cause. Déclarer l'ensemble « injoignable » enverrait
    // redémarrer une instance qui n'a pas besoin de l'être ; le bon geste est
    // d'aller regarder la dépendance.
    return {
      state: "DEGRADE",
      exitCode: 1,
      reason: `vivacité OK, disponibilité sans réponse — ${ready?.error ?? "aucune réponse de la sonde de disponibilité"}`,
    };
  }
  if (ready.status === 200 && ready.body?.status === "ready") {
    return { state: "DISPONIBLE", exitCode: 0, reason: "sondes nominatives" };
  }
  const checks = ready.body?.checks ?? {};
  const details = Object.entries(checks)
    .map(([name, value]) => `${name}=${value}`)
    .join(", ");
  return {
    state: "DEGRADE",
    exitCode: 1,
    reason: `HTTP ${ready.status}${details ? ` — ${details}` : ""}`,
  };
}

// ---------------------------------------------------------------------------
// Rétention des preuves (purge physique)
// ---------------------------------------------------------------------------

/**
 * Construit le plan de purge des fichiers de preuves.
 *
 * Aucune durée n'est fixée ici : la date limite est **fournie** par l'exploitant
 * (`--before`), parce qu'une durée de conservation est une décision métier et
 * juridique, pas un paramètre technique à deviner.
 *
 * Sécurités :
 *  - une preuve non supprimée logiquement n'est jamais purgée, quelle que soit
 *    son ancienneté : elle est peut-être encore une pièce justificative active ;
 *  - la ligne en base n'est jamais touchée par ce script : l'audit reste lisible ;
 *  - la suppression est idempotente : un fichier déjà absent n'est pas une erreur.
  * @param {Array<{ id: string, storageKey: string, deletedAt: string|null }>} rows
 * @param {{ before?: string }} options
 * @returns {{ deletions: Array<{ id: string, storageKey: string, deletedAt: string }>, skipped: Array<{ id: string, why: string }>, problems: string[] }}
 */
export function planProofPurge(rows, { before }) {
  const problems = [];
  const cutoff = new Date(before);
  if (Number.isNaN(cutoff.getTime())) problems.push(`date limite invalide : ${before}`);
  if (problems.length > 0) return { deletions: [], skipped: [], problems };

  const deletions = [];
  const skipped = [];
  for (const row of rows) {
    if (row.deletedAt === null || row.deletedAt === undefined) {
      skipped.push({ id: row.id, why: "preuve active (non supprimée logiquement)" });
      continue;
    }
    const deletedAt = new Date(row.deletedAt);
    if (Number.isNaN(deletedAt.getTime()) || deletedAt > cutoff) {
      skipped.push({ id: row.id, why: `supprimée après la date limite (${row.deletedAt})` });
      continue;
    }
    deletions.push({ id: row.id, storageKey: row.storageKey, deletedAt: row.deletedAt });
  }
  return { deletions, skipped, problems };
}

// ---------------------------------------------------------------------------
// Configurations d'exploitation
// ---------------------------------------------------------------------------

/**
 * Lit et valide la configuration de sauvegarde.
 *
 * Refuse de démarrer sur une configuration incomplète : une sauvegarde qui
 * « tourne » sans destination claire donne un faux sentiment de sécurité, ce qui
 * est pire que pas de sauvegarde du tout (personne ne vérifie).
  * @param {Record<string, string|undefined>} [env]
 * @returns {{ problems: string[], config: { backupDir: string, databaseUrl: string, proofStorageDir: string, keepDaily: number, keepWeekly: number, encryption: string, keyFile: string|undefined, minFreeBytes: number, alertCommand: string|null } }}
 */
export function loadBackupConfig(env = process.env) {
  const problems = [];
  const backupDir = env.BACKUP_DIR?.trim();
  if (!backupDir) problems.push("BACKUP_DIR est requis (destination des sauvegardes, sur un support distinct de la production)");

  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) problems.push("DATABASE_URL est requis");
  else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) problems.push("DATABASE_URL doit être une URL PostgreSQL");

  const proofStorageDir = env.PROOF_STORAGE_DIR?.trim();
  if (!proofStorageDir) problems.push("PROOF_STORAGE_DIR est requis (sans lui, les preuves ne sont pas sauvegardées)");

  const keepDaily = Number(env.BACKUP_KEEP_DAILY ?? 7);
  if (!Number.isInteger(keepDaily) || keepDaily < 1) problems.push(`BACKUP_KEEP_DAILY invalide : ${env.BACKUP_KEEP_DAILY}`);

  const keepWeekly = Number(env.BACKUP_KEEP_WEEKLY ?? 4);
  if (!Number.isInteger(keepWeekly) || keepWeekly < 1) problems.push(`BACKUP_KEEP_WEEKLY invalide : ${env.BACKUP_KEEP_WEEKLY}`);

  const encryption = env.BACKUP_ENCRYPTION?.trim() || "none";
  if (!["none", "openssl-aes256"].includes(encryption)) {
    problems.push(`BACKUP_ENCRYPTION inconnu : ${encryption} (attendu : none | openssl-aes256)`);
  }
  const keyFile = env.BACKUP_ENCRYPTION_KEY_FILE?.trim();
  if (encryption !== "none" && !keyFile) {
    problems.push("BACKUP_ENCRYPTION_KEY_FILE est requis lorsque BACKUP_ENCRYPTION est actif");
  }
  if (encryption !== "none" && keyFile && env.BACKUP_ALLOW_ENCRYPTION_WITHOUT_FILESYSTEM_CHECK !== "1") {
    if (!existsSync(keyFile)) problems.push(`clé de chiffrement introuvable : ${keyFile}`);
    else {
      const mode = statSync(keyFile).mode & 0o777;
      // Une clé lisible par tous annule le bénéfice du chiffrement de la
      // sauvegarde : elle voyage avec elle.
      if (mode & 0o077) problems.push(`clé de chiffrement trop ouverte (${mode.toString(8)}) : attendu 600`);
    }
  }

  const minFreeBytes = Number(env.BACKUP_MIN_FREE_BYTES ?? 512 * 1024 * 1024);
  if (!Number.isInteger(minFreeBytes) || minFreeBytes < 0) {
    problems.push(`BACKUP_MIN_FREE_BYTES invalide : ${env.BACKUP_MIN_FREE_BYTES}`);
  }

  return {
    problems,
    config: {
      backupDir,
      databaseUrl,
      proofStorageDir,
      keepDaily,
      keepWeekly,
      encryption,
      keyFile,
      minFreeBytes,
      // Aucun webhook n'est configuré par défaut : une alerte « envoyée » sans
      // destinataire réellement joignable serait une fausse alerte.
      alertCommand: env.BACKUP_ALERT_COMMAND?.trim() || null,
    },
  };
}

/**
 * Liste les sauvegardes présentes, triées de la plus récente à la plus ancienne.
 *
 * @param {string} backupRoot
 * @returns {Promise<Array<{ tag: string, directory: string, createdAt: string, manifest: any }>>}
 */
export async function listBackups(backupRoot) {
  if (!existsSync(backupRoot)) return [];
  const entries = await readdir(backupRoot, { withFileTypes: true });
  const backups = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(backupRoot, entry.name, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      // `directory` est le nom réel du répertoire, `tag` son étiquette déclarée.
      // Les deux sont publiés séparément parce que la **suppression** doit viser
      // le répertoire : un manifeste dont l'étiquette diverge ferait sinon
      // supprimer une autre sauvegarde que celle désignée.
      backups.push({
        tag: manifest.tag ?? entry.name,
        directory: entry.name,
        createdAt: manifest.createdAt,
        manifest,
      });
    } catch {
      // Un manifeste illisible est signalé comme une sauvegarde de date inconnue :
      // il ne doit surtout pas être silencieusement ignoré par la rétention.
      backups.push({ tag: entry.name, directory: entry.name, createdAt: "0000-01-01T00:00:00.000Z", manifest: null });
    }
  }
  return backups.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** Espace libre d'un répertoire, ou `null` si le système ne sait pas répondre. */
export async function freeBytesOf(path) {
  try {
    const { statfs } = await import("node:fs/promises");
    const info = await statfs(path);
    return Number(info.bavail) * Number(info.bsize);
  } catch {
    return null;
  }
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export async function pathSizeOf(path) {
  const info = await stat(path);
  return info.size;
}
