#!/usr/bin/env node
// Sonde de supervision : interroge les deux sondes de l'API et conclut.
//
// Destinée à être appelée par un ordonnanceur de supervision (uptime, cron,
// sonde de l'hébergeur). Codes de sortie — c'est le contrat avec l'outil
// appelant, et il distingue deux situations qui n'appellent pas la même réponse :
//
//   0  disponible
//   1  dégradé    → alerter, l'instance est retirée du routage mais le processus vit
//   2  injoignable → intervenir, le service ne répond pas du tout
//
// Usage : node ops/healthcheck.mjs [--url=https://api.example.org] [--timeout=5000]
//
// Variable : API_BASE_URL.

import { evaluateHealth, annotate } from "./lib/ops-core.mjs";

const options = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value ?? "true"];
    })
);

const baseUrl = (options.get("url") ?? process.env.API_BASE_URL ?? "").replace(/\/$/, "");
const timeoutMs = Number(options.get("timeout") ?? 5_000);

if (!baseUrl) {
  annotate("error", "SONDE-CONFIG", "aucune adresse d'API (--url= ou API_BASE_URL)");
  process.exit(2);
}

/** Interroge une sonde sans jamais lever : une panne réseau est une donnée. */
async function probe(path) {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json" },
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { reachable: true, status: response.status, body };
  } catch (error) {
    return { reachable: false, error: `${path} : ${error.name === "TimeoutError" ? `délai dépassé (${timeoutMs} ms)` : error.message}` };
  }
}

const [live, ready] = await Promise.all([probe("/health/live"), probe("/health/ready")]);
const verdict = evaluateHealth({ live, ready });

// La charge utile est publiée telle quelle : un outil de supervision a besoin des
// détails (base, stockage, espace libre) pour router l'alerte au bon endroit.
const payload = {
  state: verdict.state,
  reason: verdict.reason,
  url: baseUrl,
  checkedAt: new Date().toISOString(),
  checks: ready.body?.checks ?? null,
  storageFreeBytes: ready.body?.storageFreeBytes ?? null,
  storageMinFreeBytes: ready.body?.storageMinFreeBytes ?? null,
};

annotate(
  verdict.exitCode === 0 ? "notice" : verdict.exitCode === 1 ? "warning" : "error",
  `SONDE-${verdict.state}`,
  `${baseUrl} — ${verdict.reason}`
);
console.log(JSON.stringify(payload, null, 2));
process.exit(verdict.exitCode);
