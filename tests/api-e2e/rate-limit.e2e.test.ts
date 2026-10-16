// Tests HTTP — limitation de débit et adresse client retenue.
//
// Deux configurations sont vérifiées, parce que le produit en a deux :
//
//   * sans proxy déclaré (`TRUST_PROXY_HOPS` absent) : `X-Forwarded-For` est
//     ignoré. Personne ne peut donc contourner la limite en changeant un en-tête ;
//   * avec un proxy déclaré : l'adresse réelle du client est retenue, sinon tous
//     les utilisateurs derrière un répartiteur partageraient un seul quota — ce
//     qui, sur la limite de 5 connexions/minute, mettrait l'API en panne pour
//     tout un bureau.
//
// Les deux suites démarrent leur propre serveur : les compteurs de limitation
// sont en mémoire et ne doivent pas interférer avec les autres tests.

import { afterAll, beforeAll, expect, it } from "vitest";
import {
  DEFAULT_PASSWORD,
  connect,
  httpSuite,
  request,
  seedActor,
  seedCompany,
  startApi,
  type Actor,
  type RunningApi,
  type SqlClient,
} from "./harness";

let db: SqlClient;
let slug: string;
let companyId: string;
let manager: Actor;

const LOGIN_LIMIT_PER_MINUTE = 5;

httpSuite("HTTP — limitation de débit", () => {
  beforeAll(async () => {
    db = await connect();
    slug = `rate-${Date.now().toString(36)}`;
    companyId = await seedCompany(db, slug);
    manager = await seedActor(db, { companyId, role: "MANAGER" });
  }, 120_000);

  afterAll(async () => {
    await db?.close();
  });

  it("ignore X-Forwarded-For et bloque au-delà de la limite de connexions", async () => {
    const api: RunningApi = await startApi();
    try {
      const statuses: number[] = [];
      for (let index = 0; index < LOGIN_LIMIT_PER_MINUTE + 1; index += 1) {
        const response = await request(api, {
          path: "/auth/login",
          // Chaque tentative annonce une adresse différente : si l'en-tête était
          // cru, aucune limite ne serait atteinte.
          ip: `203.0.113.${index + 1}`,
          body: { companyId: slug, email: manager.email, password: `MauvaisMotDePasse-${index}` },
        });
        statuses.push(response.status);
      }

      expect(statuses.slice(0, LOGIN_LIMIT_PER_MINUTE)).toEqual(
        new Array(LOGIN_LIMIT_PER_MINUTE).fill(401)
      );
      expect(statuses[LOGIN_LIMIT_PER_MINUTE]).toBe(429);

      const blocked = await request<any>(api, {
        path: "/auth/login",
        ip: "203.0.113.250",
        body: { companyId: slug, email: manager.email, password: DEFAULT_PASSWORD },
      });
      expect(blocked.status).toBe(429);

      // Un client honnête doit pouvoir savoir quand réessayer.
      const retryAfter = Number(blocked.headers.get("retry-after"));
      expect(Number.isInteger(retryAfter)).toBe(true);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60);

      // La limitation ne concerne pas les autres routes : une limite globale
      // (120/min) reste largement au-dessus de l'usage normal.
      const health = await request(api, { path: "/health" });
      expect(health.status).toBe(200);
    } finally {
      await api.stop();
    }
  }, 60_000);

  it("retient l'adresse annoncée quand un proxy est déclaré", async () => {
    const api: RunningApi = await startApi({ env: { TRUST_PROXY_HOPS: "1" } });
    try {
      const statuses: number[] = [];
      for (let index = 0; index < LOGIN_LIMIT_PER_MINUTE + 1; index += 1) {
        const response = await request(api, {
          path: "/auth/login",
          ip: `198.51.100.${index + 1}`,
          body: { companyId: slug, email: manager.email, password: `MauvaisMotDePasse-${index}` },
        });
        statuses.push(response.status);
      }

      // Chaque adresse dispose de son propre quota : aucune tentative n'est
      // bloquée par les précédentes.
      expect(statuses.every((status) => status === 401)).toBe(true);

      // En revanche, une même adresse est bien comptée.
      const sameIp = "198.51.100.99";
      for (let index = 0; index < LOGIN_LIMIT_PER_MINUTE; index += 1) {
        const response = await request(api, {
          path: "/auth/login",
          ip: sameIp,
          body: { companyId: slug, email: manager.email, password: `MauvaisMotDePasse-${index}` },
        });
        expect(response.status).toBe(401);
      }
      const blocked = await request(api, {
        path: "/auth/login",
        ip: sameIp,
        body: { companyId: slug, email: manager.email, password: "MauvaisMotDePasse-encore" },
      });
      expect(blocked.status).toBe(429);
    } finally {
      await api.stop();
    }
  }, 60_000);
});
