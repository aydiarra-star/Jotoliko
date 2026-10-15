#!/usr/bin/env node
// Contrôle HTTP hors ligne de l'API.
//
// Portée exacte, volontairement limitée : ce script vérifie ce qui **ne dépend
// pas de la base de données** — démarrage, configuration, gardes
// d'authentification, validation des entrées, limitation de débit, CORS,
// en-têtes de durcissement, identifiant de corrélation, gestion des erreurs et
// routes exposées.
//
// Il ne prétend pas vérifier le métier : les requêtes qui touchent la base
// échouent avec le substitut Prisma local, et c'est assumé. Les parcours
// complets sont couverts par `npm run test:e2e:api` (PostgreSQL réel, en CI).
//
// Usage : npm run api:build && node scripts/api-offline-smoke.mjs

import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { createServer } from "node:net";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const ENTRYPOINT = join(REPO_ROOT, "apps/api/dist/apps/api/src/main.js");
const AUTH_SECRET = "jotoliko-smoke-secret-0123456789-abcdefghijklmnop";
const CORS_ORIGIN = "https://ops.jotoliko.test";
const LOGIN_LIMIT_PER_MINUTE = 5;

if (!existsSync(ENTRYPOINT)) {
  console.error(`API non construite (${ENTRYPOINT}). Lancez « npm run api:build ».`);
  process.exit(1);
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

const instances = [];

/**
 * Démarre l'API compilée, telle qu'elle est livrée, et attend qu'elle réponde.
 * Plusieurs instances peuvent coexister : la limitation de débit est comptée
 * par adresse, donc un contrôle « quota neuf » exige un processus neuf.
 */
async function startApiInstance(label, extraEnv = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, [ENTRYPOINT], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      DATABASE_URL: "postgresql://smoke:smoke@127.0.0.1:5432/smoke_sans_base",
      AUTH_SECRET,
      CORS_ORIGIN,
      PROOF_STORAGE_DIR: mkdtempSync(join(tmpdir(), "jotoliko-smoke-")),
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const chunks = [];
  child.stdout.on("data", (c) => chunks.push(c.toString()));
  child.stderr.on("data", (c) => chunks.push(c.toString()));
  const instance = {
    label,
    baseUrl: `http://127.0.0.1:${port}`,
    logs: () => chunks.join(""),
    loginAttempts: 0,
    stop: async () => {
      child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 200));
      child.kill("SIGKILL");
    },
  };
  instances.push(instance);

  const deadline = Date.now() + 20_000;
  let ready = false;
  let exited = false;
  child.on("exit", () => {
    exited = true;
  });
  while (Date.now() < deadline && !ready) {
    if (exited) {
      console.error(`[${label}] L'API s'est arrêtée au démarrage.\n${chunks.join("")}`);
      process.exit(1);
    }
    try {
      ready = (await fetch(`${instance.baseUrl}/health/live`)).ok;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  if (!ready) {
    console.error(`[${label}] L'API n'a pas répondu.\n${chunks.join("")}`);
    process.exit(1);
  }

  instance.json = async (path, init = {}) => {
    if (path === "/auth/login") instance.loginAttempts += 1;
    const response = await fetch(`${instance.baseUrl}${path}`, init);
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { response, body };
  };
  return instance;
}

const results = [];
async function check(label, run) {
  try {
    const { ok, detail } = await run();
    results.push({ label, ok, detail });
  } catch (error) {
    results.push({ label, ok: false, detail: error.message });
  }
}

const login = (instance, forwardedFor) =>
  instance.json("/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(forwardedFor ? { "X-Forwarded-For": forwardedFor } : {}),
    },
    body: JSON.stringify({ companyId: "x", email: "a@b.co", password: "motdepasse1" }),
  });

// Les jetons sont signés ici avec le même secret que le serveur : la
// vérification d'un jeton est une décision de sécurité, elle doit être
// confrontée au vrai contrôleur HTTP, pas seulement à une fonction isolée.
const mint = (claims, issuedAtMs, secret = AUTH_SECRET) => {
  const body = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(`v1.${body}.${issuedAtMs}`).digest("hex");
  return `v1.${body}.${issuedAtMs}.${signature}`;
};
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

const api = await startApiInstance("api");

await check("santé (vivacité)", async () => {
  const { response, body } = await api.json("/health/live");
  return { ok: response.status === 200 && body.status === "ok", detail: `HTTP ${response.status}` };
});

await check("santé (disponibilité) signale la base injoignable", async () => {
  const { response, body } = await api.json("/health/ready");
  return {
    ok: response.status === 503 && body.checks?.database === "unreachable",
    detail: `HTTP ${response.status} — base ${body.checks?.database}`,
  };
});

await check("refus sans jeton", async () => {
  const { response } = await api.json("/missions");
  return { ok: response.status === 401, detail: `HTTP ${response.status}` };
});

await check("refus d'un jeton non signé", async () => {
  const { response } = await api.json("/missions", { headers: bearer("v1.aaa.1.bbb") });
  return { ok: response.status === 401, detail: `HTTP ${response.status}` };
});

await check("validation des entrées (connexion)", async () => {
  const { response, body } = await api.json("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: "x", email: "pas-un-email", password: "court" }),
  });
  return { ok: response.status === 400 && Array.isArray(body.message), detail: `HTTP ${response.status}` };
});

await check("propriété non déclarée rejetée", async () => {
  const { response } = await api.json("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: "x", email: "a@b.co", password: "motdepasse1", role: "OWNER" }),
  });
  return { ok: response.status === 400, detail: `HTTP ${response.status}` };
});

await check("corps illisible → 400 corrélé", async () => {
  const { response, body } = await api.json("/missions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ pas du json",
  });
  return {
    ok: response.status === 400 && typeof body.requestId === "string",
    detail: `HTTP ${response.status}, identifiant de corrélation ${body.requestId ? "présent" : "absent"}`,
  };
});

await check("charge utile hors limite → 413", async () => {
  const response = await fetch(`${api.baseUrl}/missions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: "a".repeat(8 * 1024 * 1024) }),
  });
  return { ok: response.status === 413, detail: `HTTP ${response.status}` };
});

await check("origine autorisée", async () => {
  const { response } = await api.json("/health/live", { headers: { Origin: CORS_ORIGIN } });
  return {
    ok: response.headers.get("access-control-allow-origin") === CORS_ORIGIN,
    detail: response.headers.get("access-control-allow-origin") ?? "aucun en-tête CORS",
  };
});

await check("origine refusée", async () => {
  const { response } = await api.json("/health/live", { headers: { Origin: "https://attaquant.example" } });
  return {
    ok: response.headers.get("access-control-allow-origin") === null,
    detail: response.headers.get("access-control-allow-origin") ?? "aucun en-tête CORS",
  };
});

await check("préflight CORS", async () => {
  const response = await fetch(`${api.baseUrl}/missions`, {
    method: "OPTIONS",
    headers: {
      Origin: CORS_ORIGIN,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,idempotency-key",
    },
  });
  return { ok: response.status === 204, detail: `HTTP ${response.status}` };
});

await check("en-têtes de durcissement", async () => {
  const { response } = await api.json("/health/live");
  return {
    ok:
      response.headers.get("x-content-type-options") === "nosniff" &&
      response.headers.get("referrer-policy") === "no-referrer",
    detail: "nosniff + no-referrer",
  };
});

await check("identifiant de corrélation fourni conservé", async () => {
  const { response } = await api.json("/health/live", { headers: { "X-Request-Id": "smoke-offline-0001" } });
  return { ok: response.headers.get("x-request-id") === "smoke-offline-0001", detail: response.headers.get("x-request-id") ?? "absent" };
});

await check("route inconnue → 404", async () => {
  const { response } = await api.json("/route-inexistante");
  return { ok: response.status === 404, detail: `HTTP ${response.status}` };
});

await check("routes de preuves protégées", async () => {
  const { response } = await api.json("/missions/quelconque/proofs", { method: "POST" });
  return { ok: response.status === 401, detail: `HTTP ${response.status}` };
});

await check("jeton expiré refusé", async () => {
  const token = mint({ sub: "u1", cid: "c1", role: "OWNER", tv: 0 }, Date.now() - 9 * 60 * 60 * 1000);
  const { response } = await api.json("/missions", { headers: bearer(token) });
  return { ok: response.status === 401, detail: `HTTP ${response.status}` };
});

await check("jeton daté dans le futur refusé", async () => {
  const token = mint({ sub: "u1", cid: "c1", role: "OWNER", tv: 0 }, Date.now() + 10 * 60 * 1000);
  const { response } = await api.json("/missions", { headers: bearer(token) });
  return { ok: response.status === 401, detail: `HTTP ${response.status}` };
});

await check("jeton signé avec un autre secret refusé", async () => {
  const token = mint({ sub: "u1", cid: "c1", role: "OWNER", tv: 0 }, Date.now(), "mauvais-secret-de-test-0123456789");
  const { response } = await api.json("/missions", { headers: bearer(token) });
  return { ok: response.status === 401, detail: `HTTP ${response.status}` };
});

await check("charge utile altérée refusée", async () => {
  const token = mint({ sub: "u1", cid: "c1", role: "DRIVER", tv: 0 }, Date.now());
  const [version, , issued, signature] = token.split(".");
  const forgee = Buffer.from(JSON.stringify({ sub: "u1", cid: "c1", role: "OWNER", tv: 0 }), "utf8").toString("base64url");
  const { response } = await api.json("/missions", { headers: bearer(`${version}.${forgee}.${issued}.${signature}`) });
  return { ok: response.status === 401, detail: `HTTP ${response.status}` };
});

await check("jeton valide accepté puis refusé par la base absente", async () => {
  const token = mint({ sub: "u1", cid: "c1", role: "OWNER", tv: 0 }, Date.now());
  const response = await fetch(`${api.baseUrl}/missions`, { headers: bearer(token) });
  // La signature passe : le refus ne peut plus venir que de la résolution en
  // base, absente dans ce contrôle hors ligne. Un 401 ici signifierait que le
  // jeton valide a été rejeté — donc un défaut de vérification.
  return { ok: response.status !== 401, detail: `HTTP ${response.status} (base absente, attendu ≠ 401)` };
});

await check("limitation de débit des connexions", async () => {
  // La limite est comptée par adresse et par route : les connexions déjà
  // envoyées plus haut dans ce script consomment le même quota. Le contrôle
  // s'y adapte au lieu de supposer un compteur vierge.
  const remaining = Math.max(0, LOGIN_LIMIT_PER_MINUTE - api.loginAttempts);
  const statuses = [];
  for (let i = 0; i < remaining + 2; i += 1) {
    statuses.push((await login(api)).response.status);
  }
  const allowed = statuses.slice(0, remaining);
  const blocked = statuses.slice(remaining);
  return {
    ok: remaining > 0 && !allowed.includes(429) && blocked.length === 2 && blocked.every((s) => s === 429),
    detail: `${api.loginAttempts - statuses.length} connexions précédentes, puis ${statuses.join(" → ")}`,
  };
});

await check("aucun secret dans les réponses", async () => {
  const { body } = await api.json("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: "x", email: "a@b.co", password: "motdepasse1" }),
  });
  const serialized = JSON.stringify(body);
  return { ok: !serialized.includes(AUTH_SECRET), detail: "réponse sans secret" };
});

// ---------------------------------------------------------------------------
// Confiance au proxy.
//
// Deux comportements opposés sont exigés, et les confondre est une faille :
//  - sans proxy déclaré, `X-Forwarded-For` doit être **ignoré**, sinon un client
//    forge l'en-tête et contourne la limitation de débit ;
//  - avec un proxy déclaré, il doit être **honoré**, sinon tous les clients
//    d'un même répartiteur de charge partagent un seul quota.
// ---------------------------------------------------------------------------

await check("X-Forwarded-For ignoré sans proxy déclaré (pas de contournement)", async () => {
  const direct = await startApiInstance("api-sans-proxy");
  const statuses = [];
  // Une adresse différente à chaque essai : si l'en-tête était cru, chaque
  // essai ouvrirait son propre quota et aucun 429 n'apparaîtrait jamais.
  for (let i = 0; i < LOGIN_LIMIT_PER_MINUTE + 1; i += 1) {
    statuses.push((await login(direct, `203.0.113.${i + 1}`)).response.status);
  }
  await direct.stop();
  const blocked = statuses.filter((s) => s === 429).length;
  return {
    ok: statuses.slice(0, LOGIN_LIMIT_PER_MINUTE).every((s) => s !== 429) && statuses[LOGIN_LIMIT_PER_MINUTE] === 429,
    detail: `${LOGIN_LIMIT_PER_MINUTE + 1} adresses annoncées, ${blocked} refus — ${statuses.join(" → ")}`,
  };
});

await check("X-Forwarded-For honoré avec proxy déclaré", async () => {
  const proxied = await startApiInstance("api-derriere-proxy", { TRUST_PROXY_HOPS: "1" });
  const statuses = [];
  for (let i = 0; i < LOGIN_LIMIT_PER_MINUTE + 1; i += 1) {
    statuses.push((await login(proxied, "198.51.100.7")).response.status);
  }
  const autre = (await login(proxied, "198.51.100.8")).response.status;
  await proxied.stop();
  return {
    ok: statuses[LOGIN_LIMIT_PER_MINUTE] === 429 && autre !== 429,
    detail: `même adresse : ${statuses.join(" → ")} ; autre adresse : ${autre}`,
  };
});

for (const instance of instances) await instance.stop();

let failed = 0;
console.log("\nContrôle HTTP hors ligne (couches indépendantes de la base)\n");
for (const result of results) {
  if (!result.ok) failed += 1;
  console.log(`  ${result.ok ? "OK  " : "ÉCHEC"}  ${result.label} — ${result.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} contrôles réussis.`);
console.log(
  "Rappel : les parcours métier (missions, caisse, preuves, GPS) exigent PostgreSQL et sont vérifiés par « npm run test:e2e:api ».\n"
);
process.exit(failed === 0 ? 0 : 1);
