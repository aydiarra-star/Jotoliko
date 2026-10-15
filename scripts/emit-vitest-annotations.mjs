#!/usr/bin/env node
// Publie le résultat des tests vitest en annotations GitHub.
//
// Deux usages :
//   - en cas d'échec, chaque cas fautif devient une annotation d'erreur lisible
//     via l'API des check-runs ;
//   - en cas de succès, un bilan est publié en annotation « notice », pour que le
//     nombre de cas réellement exécutés (et ignorés) soit vérifiable sans
//     télécharger d'artefact.
//
// Pourquoi : les journaux d'exécution des runners ne sont pas toujours
// accessibles depuis l'environnement qui pilote la CI, alors que les annotations
// d'un check-run le sont via l'API. Sans cela, un échec de test ne serait
// diagnosticable que par une personne ayant ouvert l'onglet Actions.
//
// Usage : node scripts/emit-vitest-annotations.mjs <rapport-json> [journal-texte]

import { existsSync, readFileSync } from "node:fs";

const MAX_ANNOTATIONS = 40;
const MAX_MESSAGE = 900;

/** Les retours à la ligne cassent les annotations : ils sont aplatis. */
function flatten(value) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\n+/g, " | ")
    .replace(/\|(\s*\|)+/g, "|")
    .slice(0, MAX_MESSAGE);
}

/**
 * `level` vaut « error » pour un échec et « notice » pour un bilan : une suite
 * verte ne doit pas apparaître comme un avertissement dans l'interface.
 */
function emit(title, message, level = "error") {
  const command = level === "error" ? "error" : "notice";
  console.log(`::${command} title=${title}::${flatten(message)}`);
}

const [reportPath, logPath] = process.argv.slice(2);
const annotations = [];

if (reportPath && existsSync(reportPath)) {
  try {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const files = Array.isArray(report.testResults) ? report.testResults : [];
    for (const file of files) {
      const name = String(file.name ?? "?").replace(`${process.cwd()}/`, "");
      const assertions = Array.isArray(file.assertionResults) ? file.assertionResults : [];
      const failed = [];
      for (const assertion of assertions) {
        if (assertion.status !== "failed") continue;
        const messages = Array.isArray(assertion.failureMessages) ? assertion.failureMessages : [];
        failed.push({ title: "E2E", message: `${name} › ${assertion.fullName ?? assertion.title}\n${messages.join("\n")}` });
      }
      annotations.push(...failed);
      // Un fichier peut échouer sans qu'aucun cas ne soit nommé : échec de
      // `beforeAll`, import cassé, erreur non capturée. Ne pas le rapporter
      // reviendrait à publier une CI rouge sans cause lisible.
      if (failed.length === 0 && file.status === "failed") {
        annotations.push({
          title: "E2E-FICHIER",
          message: `${name} : ${file.message ?? "échec de fichier sans cas associé"}`,
        });
      }
    }
    if (annotations.length === 0 && report.success === false) {
      annotations.push({
        title: "E2E-COLLECTE",
        message: `vitest a échoué sans cas en échec. Bilan : ${report.numFailedTests ?? "?"} en échec, ${report.numFailedTestSuites ?? "?"} fichiers en échec.`,
      });
    }
  } catch (error) {
    annotations.push({ title: "E2E-RAPPORT", message: `Rapport illisible : ${error.message}` });
  }
}

// Bilan, publié qu'il y ait échec ou non.
//
// Raison : « la CI est verte » ne dit pas combien de cas ont été exécutés ni
// combien ont été ignorés. Sans ce bilan, l'affirmation « la suite HTTP de bout
// en bout est passée » ne serait pas vérifiable depuis l'extérieur.
const summary = [];
try {
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const files = Array.isArray(report.testResults) ? report.testResults : [];
  const perFile = files
    .map((file) => {
      const name = String(file.name ?? "?").replace(`${process.cwd()}/`, "");
      const assertions = Array.isArray(file.assertionResults) ? file.assertionResults : [];
      const passed = assertions.filter((a) => a.status === "passed").length;
      const skipped = assertions.filter((a) => a.status === "skipped" || a.status === "pending").length;
      const failed = assertions.filter((a) => a.status === "failed").length;
      return `${name} : ${passed} réussi(s), ${failed} échec(s), ${skipped} ignoré(s)`;
    })
    .join(" | ");
  summary.push(
    `cas exécutés : ${report.numTotalTests ?? "?"} — réussis : ${report.numPassedTests ?? "?"} — ` +
      `échoués : ${report.numFailedTests ?? "?"} — ignorés : ${report.numPendingTests ?? "?"} — ` +
      `fichiers : ${report.numTotalTestSuites ?? "?"}`
  );
  if (perFile) summary.push(perFile);
} catch (error) {
  summary.push(`bilan indisponible (rapport illisible : ${error.message})`);
}
emit("E2E-BILAN", summary.join("\n"), annotations.length === 0 ? "notice" : "error");

if (annotations.length === 0 && logPath && existsSync(logPath)) {
  // Repli : un échec de build ou d'import n'apparaît pas dans le rapport JSON.
  const lines = readFileSync(logPath, "utf8").split("\n").filter((line) => line.trim().length > 0);
  for (const line of lines.slice(-MAX_ANNOTATIONS)) {
    annotations.push({ title: "E2E-LOG", message: line });
  }
}

for (const annotation of annotations.slice(0, MAX_ANNOTATIONS)) {
  emit(annotation.title, annotation.message, "error");
}
// Bilan toujours publié quand le script est appelé (donc quand la suite a
// échoué) : le nombre de cas en échec est l'information la plus utile.
console.log(
  `Annotations publiées : ${Math.min(annotations.length, MAX_ANNOTATIONS)} (total détecté : ${annotations.length})`
);
