#!/usr/bin/env node
// Rapport d'audit des dépendances, lisible dans les annotations CI.
//
// Pourquoi un script plutôt qu'une ligne `npm audit` :
//
// `npm audit` sort en **erreur** dès qu'il trouve un avis. Avec
// `continue-on-error: true`, GitHub Actions marque bien l'étape en succès, mais
// publie tout de même une annotation de niveau **erreur** (« Process completed
// with exit code 1 »). Résultat observé en CI : un job entièrement vert porteur
// d'une annotation d'échec. Apprendre à ignorer les annotations d'un job vert est
// exactement ce qu'il ne faut pas enseigner à une équipe d'astreinte.
//
// Ce script capture donc la sortie de `npm audit` et publie le constat avec le
// **bon niveau de gravité** — en distinguant trois situations qui n'ont rien à
// voir entre elles :
//
//   - audit réussi, aucun avis          → notice
//   - audit réussi, des avis présents   → warning, avec le décompte par gravité
//   - audit impossible (registre, etc.) → warning nommant l'échec de l'audit
//
// Le troisième cas est le plus important : un audit qui n'a pas pu s'exécuter ne
// doit **jamais** être présenté comme « aucune vulnérabilité ».
//
// Usage : node scripts/npm-audit-summary.mjs <répertoire> <libellé>
// Sortie : toujours 0 — cette vérification informe, elle ne bloque pas.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const directory = process.argv[2] ?? ".";
const label = process.argv[3] ?? directory;

/** Publie une annotation de niveau `warning` : jamais un succès inventé. */
function inconclusive(reason) {
  console.log(
    `::warning title=AUDIT-DÉPENDANCES::${label} : ${reason} — **aucune conclusion** sur les vulnérabilités`
  );
  process.exit(0);
}

let raw = "";
try {
  // `npm audit` sort en erreur dès qu'un avis existe : ce n'est pas un échec du
  // contrôle, c'est son résultat. La sortie standard porte le rapport JSON dans
  // les deux cas — d'où la lecture de `error.stdout`.
  raw = (await run("npm", ["audit", "--json", "--audit-level=moderate"], { cwd: directory, maxBuffer: 64 * 1024 * 1024 })).stdout;
} catch (error) {
  raw = error?.stdout ?? "";
  if (!raw) inconclusive(`l'audit n'a pas pu s'exécuter (${error?.message?.split("\n")[0] ?? "erreur inconnue"})`);
}

let report;
try {
  report = JSON.parse(raw);
} catch {
  inconclusive("rapport d'audit illisible");
}

// `error` est présent quand npm lui-même a échoué (registre injoignable,
// `package-lock.json` absent, etc.). À ne pas confondre avec « aucun avis ».
if (report.error) {
  inconclusive(`audit impossible (${report.error.summary ?? report.error.code ?? "erreur inconnue"})`);
}

const counts = report.metadata?.vulnerabilities ?? {};
const total = counts.total ?? 0;

if (total === 0) {
  console.log(
    `::notice title=AUDIT-DÉPENDANCES::${label} : aucun avis de sécurité signalé (${report.metadata?.dependencies?.total ?? "?"} dépendances)`
  );
  process.exit(0);
}

console.log(
  `::warning title=AUDIT-DÉPENDANCES::${label} : ${total} avis — critiques:${counts.critical ?? 0} élevés:${counts.high ?? 0} modérés:${counts.moderate ?? 0} faibles:${counts.low ?? 0} — informatif, aucune remédiation automatique appliquée`
);

// Les avis **directs** sont ceux que le projet peut réellement corriger : les
// nommer évite de renvoyer l'équipe à un rapport qu'elle ne lira pas.
const direct = Object.entries(report.vulnerabilities ?? {})
  .filter(([, entry]) => entry?.isDirect)
  .map(([name, entry]) => `${name}(${entry.severity})`);

if (direct.length > 0) {
  console.log(
    `::notice title=AUDIT-DÉPENDANCES-DIRECTES::${label} : ${direct.join(", ")} — décision de mise à jour à prendre : elle n'est pas appliquée automatiquement, une montée majeure peut exiger une revalidation des migrations`
  );
}

process.exit(0);
