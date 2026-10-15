#!/usr/bin/env node
// Publie les échecs de tests vitest en annotations GitHub.
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

function emit(title, message) {
  console.log(`::error title=${title}::${flatten(message)}`);
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
      for (const assertion of assertions) {
        if (assertion.status !== "failed") continue;
        const messages = Array.isArray(assertion.failureMessages) ? assertion.failureMessages : [];
        annotations.push({
          title: "E2E",
          message: `${name} › ${assertion.fullName ?? assertion.title}\n${messages.join("\n")}`,
        });
      }
    }
    if (annotations.length === 0 && report.success === false) {
      annotations.push({ title: "E2E-COLLECTE", message: "vitest a échoué sans cas en échec (erreur de chargement ou de configuration)." });
    }
  } catch (error) {
    annotations.push({ title: "E2E-RAPPORT", message: `Rapport illisible : ${error.message}` });
  }
}

if (annotations.length === 0 && logPath && existsSync(logPath)) {
  // Repli : un échec de build ou d'import n'apparaît pas dans le rapport JSON.
  const lines = readFileSync(logPath, "utf8").split("\n").filter((line) => line.trim().length > 0);
  for (const line of lines.slice(-MAX_ANNOTATIONS)) {
    annotations.push({ title: "E2E-LOG", message: line });
  }
}

for (const annotation of annotations.slice(0, MAX_ANNOTATIONS)) {
  emit(annotation.title, annotation.message);
}
console.log(`Annotations publiées : ${Math.min(annotations.length, MAX_ANNOTATIONS)}`);
