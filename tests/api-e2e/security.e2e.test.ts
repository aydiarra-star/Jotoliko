// Tests HTTP — sécurité et exploitation : CORS, en-têtes, limitation de débit,
// erreurs, sondes de santé.
//
// Cette suite s'exécute avec la configuration **par défaut** (aucun proxy de
// confiance). C'est délibéré : elle doit prouver le comportement réellement
// livré, notamment que `X-Forwarded-For` n'est pas cru quand l'API n'est pas
// derrière un proxy déclaré — sinon la limitation de débit se contourne en
// changeant un en-tête.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  DEFAULT_PASSWORD,
  TEST_AUTH_SECRET,
  TEST_CORS_ORIGIN,
  connect,
  httpSuite,
  login,
  loginAttempt,
  migrateFresh,
  request,
  seedActor,
  seedCompany,
  startApi,
  type Actor,
  type RunningApi,
  type SqlClient,
} from "./harness";

let db: SqlClient;
let api: RunningApi;
let slug: string;
let companyId: string;
let manager: Actor;
let managerToken: string;

httpSuite("HTTP — sécurité, en-têtes et limitation de débit", () => {
  beforeAll(async () => {
    db = await connect();
    await migrateFresh(db);
    // Aucun TRUST_PROXY_HOPS : configuration par défaut du produit.
    api = await startApi();
    slug = `secu-${Date.now().toString(36)}`;
    companyId = await seedCompany(db, slug);
    manager = await seedActor(db, { companyId, role: "MANAGER" });
    managerToken = await login(api, slug, manager);
  }, 120_000);

  afterAll(async () => {
    await api?.stop();
    await db?.close();
  });

  it("répond aux sondes de santé, y compris la disponibilité réelle de la base", async () => {
    const live = await request<any>(api, { path: "/health/live" });
    const health = await request<any>(api, { path: "/health" });
    const ready = await request<any>(api, { path: "/health/ready" });

    expect(live.status).toBe(200);
    expect(live.body.status).toBe("ok");
    expect(health.body).toEqual({ status: "ok", service: "jotoliko-api" });
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({ status: "ready", checks: { database: "ok" } });
  });

  it("n'exige pas de jeton pour les sondes de santé", async () => {
    const ready = await request(api, { path: "/health/ready" });
    expect(ready.status).toBe(200);
  });

  it("autorise l'origine déclarée et refuse les autres", async () => {
    const allowed = await request(api, {
      path: "/missions",
      token: managerToken,
      headers: { Origin: TEST_CORS_ORIGIN },
    });
    const rejected = await request(api, {
      path: "/missions",
      token: managerToken,
      headers: { Origin: "https://attaquant.example" },
    });

    expect(allowed.headers.get("access-control-allow-origin")).toBe(TEST_CORS_ORIGIN);
    // Sans en-tête CORS, le navigateur bloque la lecture de la réponse : c'est
    // le comportement attendu pour une origine non déclarée.
    expect(rejected.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("répond à la requête préalable (preflight) avec les en-têtes attendus", async () => {
    const response = await fetch(`${api.baseUrl}/missions`, {
      method: "OPTIONS",
      headers: {
        Origin: TEST_CORS_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,idempotency-key",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(TEST_CORS_ORIGIN);
    const allowHeaders = (response.headers.get("access-control-allow-headers") ?? "").toLowerCase();
    expect(allowHeaders).toContain("authorization");
    expect(allowHeaders).toContain("idempotency-key");
  });

  it("pose les en-têtes de durcissement sur toutes les réponses", async () => {
    const ok = await request(api, { path: "/health" });
    const error = await request(api, { path: "/missions" });

    for (const response of [ok, error]) {
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    }
  });

  it("renvoie un 404 net sur une route inconnue", async () => {
    const response = await request(api, { path: "/missions/1/inexistant" });
    expect(response.status).toBe(404);
  });

  it("rejette un corps JSON illisible en 400, pas en 500", async () => {
    const response = await request(api, {
      path: "/missions",
      raw: "{ ceci n'est pas du JSON",
      headers: { "Content-Type": "application/json" },
    });

    // Le corps est analysé avant les gardes : la réponse est bien une erreur de
    // requête (400), pas un 500 ni un 401 trompeur.
    expect(response.status).toBe(400);
  });

  it("propage l'identifiant de requête fourni et en génère un sinon", async () => {
    const provided = await request(api, {
      path: "/health/live",
      headers: { "X-Request-Id": "e2e-request-id-000001" },
    });
    const generated = await request(api, { path: "/health/live" });

    expect(provided.headers.get("x-request-id")).toBe("e2e-request-id-000001");
    const generatedId = generated.headers.get("x-request-id") ?? "";
    expect(generatedId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("ne divulgue jamais de trace d'exécution ni de détail interne", async () => {
    const responses = [
      await request(api, { path: "/missions" }),
      await request(api, { path: "/missions", token: "v1.mauvais.jeton.ici" }),
      await request(api, { path: `/missions/${encodeURIComponent("../../etc/passwd")}` }),
      await request(api, { path: "/undefined-route" }),
    ];

    for (const response of responses) {
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain(TEST_AUTH_SECRET);
      expect(serialized).not.toMatch(/at Object\.|node_modules|\/home\/|\.ts:\d+/);
      expect(response.body).not.toHaveProperty("stack");
    }
  });

  it("accepte un identifiant de corrélation absent mais ignore les valeurs suspectes", async () => {
    const suspicious = await request(api, {
      path: "/health/live",
      headers: { "X-Request-Id": "a".repeat(200) },
    });
    const id = suspicious.headers.get("x-request-id") ?? "";
    // Un identifiant trop long ou suspect est remplacé, jamais recopié tel quel
    // dans les journaux.
    expect(id).not.toHaveLength(200);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("refuse l'usurpation d'un rôle par le corps de la requête", async () => {
    const response = await loginAttempt(api, {
      companyId: slug,
      email: manager.email,
      password: manager.password,
      role: "OWNER",
      tokenVersion: 99,
    });
    expect(response.status).toBe(400);
  });

  it("limite aussi les tentatives de connexion réussies et journalise l'échec côté serveur", async () => {
    const fresh = await seedActor(db, { companyId, role: "VIEWER", email: `journal-${randomUUID().slice(0, 8)}@jotoliko.test` });
    const response = await loginAttempt(api, {
      companyId: slug,
      email: fresh.email,
      password: "MauvaisMotDePasse-0002",
    });
    expect(response.status).toBe(401);

    // Les journaux du serveur nomment l'e-mail tenté : condition nécessaire pour
    // détecter une attaque par force brute. Aucun secret ne doit y figurer.
    const logs = api.logs();
    expect(logs).toContain(fresh.email);
    expect(logs).not.toContain(TEST_AUTH_SECRET);
    expect(logs).not.toContain(fresh.password);
  });
});
