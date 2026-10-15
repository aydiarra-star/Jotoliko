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
// Usage : node ops/healthcheck.mjs [--url=https://api.example.org] [--timeout=12000]
//
// Variable : API_BASE_URL.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { evaluateHealth, annotate } from "./lib/ops-core.mjs";
import { sendNtfyNotification } from "./lib/ntfy.mjs";

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
// Le délai par défaut dépasse le budget de diagnostic interne de l'API
// (`CONNECT_ATTEMPT_TIMEOUT_MS`, 10 s) : en deçà, une base seulement lente est
// classée « injoignable » et l'astreinte redémarre une instance qui n'a pas
// besoin de l'être. Le défaut doit satisfaire la règle, pas exiger de la connaître.
const timeoutMs = Number(options.get("timeout") ?? 12_000);

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
// Notifications optionnelles vers ntfy (gratuit). Le sujet doit être aléatoire et
// privé : ntfy ne fournit pas de confidentialité aux sujets publics.
const ntfyUrl = process.env.JOTOLIKO_NTFY_URL?.trim();
if (ntfyUrl) {
  const statePath = process.env.HEALTHCHECK_ALERT_STATE_FILE?.trim() ||
    join(tmpdir(), "jotoliko-healthcheck-alert-state.json");
  const cooldownMs = Number(process.env.HEALTHCHECK_ALERT_COOLDOWN_MS ?? 1_800_000);
  let previous = null;
  try {
    if (existsSync(statePath)) previous = JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    // État local illisible : on alerte plutôt que de faire taire un incident.
  }

  const failing = verdict.exitCode !== 0;
  const now = Date.now();
  const lastSentAt = Number(previous?.lastSentAt ?? 0);
  const changedState = previous?.state !== verdict.state;
  const cooldownElapsed = now - lastSentAt >= (Number.isFinite(cooldownMs) && cooldownMs >= 60_000 ? cooldownMs : 1_800_000);
  const recovery = !failing && previous?.failing === true;
  const shouldNotify = failing ? (changedState || cooldownElapsed) : recovery;

  if (shouldNotify) {
    const title = recovery ? "Jotoliko — service rétabli" : `Jotoliko — ${verdict.state}`;
    const message = recovery
      ? `Le service répond de nouveau normalement à ${payload.checkedAt}.`
      : `État : ${verdict.state}. Motif : ${verdict.reason}. Contrôlé à ${payload.checkedAt}. Vérifier les sondes et les journaux.`;
    try {
      await sendNtfyNotification(ntfyUrl, message, { title, priority: failing ? 4 : 3 });
      writeFileSync(statePath, JSON.stringify({
        state: verdict.state,
        failing,
        lastSentAt: now,
        lastReason: verdict.reason,
      }, null, 2), { mode: 0o600 });
      console.error("[ALERTE] Notification envoyée.");
    } catch (error) {
      // Ne jamais imprimer l'URL de notification : elle contient le sujet privé.
      console.error(`[ALERTE NON TRANSMISE] ${error instanceof Error ? error.message : "échec inconnu"}`);
    }
  }
}

process.exit(verdict.exitCode);
