// Tests HTTP — cycle de vie des missions : création, affectation, transitions,
// pagination, audit.
//
// Les transitions interdites sont vérifiées par HTTP (donc après les gardes et la
// validation), puis confirmées en base : une réponse `409` qui aurait tout de
// même modifié la ligne serait un faux succès.

import { afterAll, beforeAll, expect, it } from "vitest";
import {
  auditActionsFor,
  auditRequestIds,
  connect,
  httpSuite,
  login,
  migrateFresh,
  missionRow,
  scalar,
  seedActor,
  seedCompany,
  seedMission,
  seedSetting,
  startApi,
  request,
  type Actor,
  type RunningApi,
  type SqlClient,
} from "./harness";

let db: SqlClient;
let api: RunningApi;
let slug: string;
let companyId: string;
let manager: Actor;
let driver: Actor;
let token: string;
let otherCompanyId: string;
let foreignDriver: Actor;

async function createMission(reference: string, extra: Record<string, unknown> = {}): Promise<string> {
  const response = await request<{ id: string }>(api, {
    path: "/missions",
    token,
    body: { reference, clientName: `Client ${reference}`, expectedAmount: 12000, ...extra },
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.id;
}

httpSuite("HTTP — missions : création, affectation, transitions", () => {
  beforeAll(async () => {
    db = await connect();
    await migrateFresh(db);
    api = await startApi({ env: { TRUST_PROXY_HOPS: "1" } });
    slug = `missions-${Date.now().toString(36)}`;
    companyId = await seedCompany(db, slug);
    otherCompanyId = await seedCompany(db, `${slug}-autre`);
    manager = await seedActor(db, { companyId, role: "MANAGER" });
    driver = await seedActor(db, { companyId, role: "DRIVER" });
    foreignDriver = await seedActor(db, { companyId: otherCompanyId, role: "DRIVER" });
    token = await login(api, slug, manager);
  }, 120_000);

  afterAll(async () => {
    await api?.stop();
    await db?.close();
  });

  it("crée une mission et renvoie une vue complète", async () => {
    const response = await request<any>(api, {
      path: "/missions",
      token,
      body: { reference: "CMD-CREATE-1", clientName: "Awa Ndiaye", expectedAmount: 12500, phone: "+221770000000" },
    });

    expect(response.status).toBe(201);
    expect(response.body.reference).toBe("CMD-CREATE-1");
    expect(response.body.status).toBe("A_AFFECTER");
    expect(response.body.money).toEqual({ expected: 12500, collected: 0, remitted: 0, difference: 12500 });
    expect(response.body.proofRequired).toBe(true);

    const row = await missionRow(db, response.body.id);
    expect(row.status).toBe("A_AFFECTER");
    expect(row.expectedAmount).toBe(12500);
  });

  it("journalise la création dans l'audit avec l'identifiant de corrélation", async () => {
    const requestId = "e2e-create-audit-0001";
    const response = await request<{ id: string }>(api, {
      path: "/missions",
      token,
      headers: { "X-Request-Id": requestId },
      body: { reference: "CMD-CREATE-AUDIT", clientName: "Client audit" },
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("x-request-id")).toBe(requestId);

    expect(await auditActionsFor(db, response.body.id)).toContain("MISSION_CREATED");
    expect(await auditRequestIds(db, response.body.id)).toContain(requestId);
  });

  it("refuse une référence déjà utilisée dans la même entreprise", async () => {
    await createMission("CMD-DUPLICATE");
    const duplicate = await request(api, {
      path: "/missions",
      token,
      body: { reference: "CMD-DUPLICATE", clientName: "Doublon" },
    });
    expect(duplicate.status).toBe(409);
  });

  it("autorise la même référence dans une autre entreprise", async () => {
    const otherManager = await seedActor(db, { companyId: otherCompanyId, role: "MANAGER" });
    const otherToken = await login(api, `${slug}-autre`, otherManager);
    const response = await request(api, {
      path: "/missions",
      token: otherToken,
      body: { reference: "CMD-DUPLICATE", clientName: "Même référence, autre entreprise" },
    });
    expect(response.status).toBe(201);
  });

  it("rejette un champ non déclaré, y compris companyId", async () => {
    const response = await request(api, {
      path: "/missions",
      token,
      body: { reference: "CMD-INJECT", clientName: "Injection", companyId: otherCompanyId },
    });
    expect(response.status).toBe(400);
  });

  it("rejette une entrée invalide et un montant non entier", async () => {
    const empty = await request(api, { path: "/missions", token, body: { reference: "", clientName: "x" } });
    const floatAmount = await request(api, {
      path: "/missions",
      token,
      body: { reference: "CMD-FLOAT", clientName: "x", expectedAmount: 10.5 },
    });
    const longReference = await request(api, {
      path: "/missions",
      token,
      body: { reference: "R".repeat(61), clientName: "x" },
    });

    expect(empty.status).toBe(400);
    expect(floatAmount.status).toBe(400);
    expect(longReference.status).toBe(400);
  });

  it("refuse la création à un livreur", async () => {
    const driverToken = await login(api, slug, driver);
    const response = await request(api, {
      path: "/missions",
      token: driverToken,
      body: { reference: "CMD-DRIVER-CREATE", clientName: "Interdit" },
    });
    expect(response.status).toBe(403);
  });

  it("refuse une affectation à un utilisateur d'une autre entreprise", async () => {
    const missionId = await createMission("CMD-FOREIGN-ASSIGN");
    const response = await request(api, {
      path: `/missions/${missionId}/assignment`,
      token,
      body: { assigneeUserId: foreignDriver.userId },
    });
    expect(response.status).toBe(400);

    const row = await missionRow(db, missionId);
    expect(row.assignedUserId).toBeNull();
  });

  it("affecte une mission à un livreur de la même entreprise puis la désaffecte", async () => {
    const missionId = await createMission("CMD-ASSIGN");

    const assigned = await request<any>(api, {
      path: `/missions/${missionId}/assignment`,
      token,
      body: { assigneeUserId: driver.userId },
    });
    expect(assigned.status).toBe(201);
    expect(assigned.body.assignedUserId).toBe(driver.userId);
    expect(assigned.body.status).toBe("A_AFFECTER");
    expect(await auditActionsFor(db, missionId)).toContain("MISSION_ASSIGNED");

    const unassigned = await request<any>(api, {
      path: `/missions/${missionId}/assignment`,
      token,
      body: { assigneeUserId: null },
    });
    expect(unassigned.status).toBe(201);
    expect(unassigned.body.assignedUserId).toBeNull();
  });

  it("refuse l'affectation à un livreur inactif", async () => {
    const inactiveDriver = await seedActor(db, { companyId, role: "DRIVER", isActive: false });
    const missionId = await createMission("CMD-INACTIVE-ASSIGN");
    const response = await request(api, {
      path: `/missions/${missionId}/assignment`,
      token,
      body: { assigneeUserId: inactiveDriver.userId },
    });
    expect(response.status).toBe(400);
  });

  it("accepte la transition autorisée A_AFFECTER → AFFECTEE", async () => {
    const missionId = await createMission("CMD-TRANSITION-OK");
    const response = await request<any>(api, {
      path: `/missions/${missionId}/transition`,
      token,
      body: { to: "AFFECTEE" },
    });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe("AFFECTEE");
    expect(await auditActionsFor(db, missionId)).toContain("MISSION_TRANSITION");
  });

  it("refuse une transition interdite par le graphe et ne touche pas la base", async () => {
    const missionId = await createMission("CMD-TRANSITION-KO");
    const response = await request(api, {
      path: `/missions/${missionId}/transition`,
      token,
      body: { to: "LIVREE", proofId: "preuve-quelconque" },
    });

    expect(response.status).toBe(409);
    expect((await missionRow(db, missionId)).status).toBe("A_AFFECTER");
  });

  it("refuse un statut cible inconnu", async () => {
    const missionId = await createMission("CMD-TRANSITION-UNKNOWN");
    const response = await request(api, {
      path: `/missions/${missionId}/transition`,
      token,
      body: { to: "EXPEDIEE" },
    });
    expect(response.status).toBe(400);
    expect((await missionRow(db, missionId)).status).toBe("A_AFFECTER");
  });

  it("exige un motif pour un échec", async () => {
    const missionId = await seedMission(db, { companyId, reference: "CMD-ECHEC", status: "EN_ROUTE" });

    const withoutReason = await request(api, {
      path: `/missions/${missionId}/transition`,
      token,
      body: { to: "ECHEC" },
    });
    expect(withoutReason.status).toBe(400);

    const withReason = await request<any>(api, {
      path: `/missions/${missionId}/transition`,
      token,
      body: { to: "ECHEC", reason: "Client injoignable" },
    });
    expect(withReason.status).toBe(201);
    expect(withReason.body.status).toBe("ECHEC");
  });

  it("exige une preuve avant de clôturer une livraison (politique par défaut)", async () => {
    const missionId = await seedMission(db, { companyId, reference: "CMD-PREUVE", status: "ARRIVE" });

    const withoutProof = await request(api, {
      path: `/missions/${missionId}/transition`,
      token,
      body: { to: "LIVREE" },
    });
    expect(withoutProof.status).toBe(400);
    expect((await missionRow(db, missionId)).status).toBe("ARRIVE");

    const withProof = await request<any>(api, {
      path: `/missions/${missionId}/transition`,
      token,
      body: { to: "LIVREE", proofId: "preuve-1" },
    });
    expect(withProof.status).toBe(201);
    expect(withProof.body.status).toBe("LIVREE");
    expect(withProof.body.proofId).toBe("preuve-1");
  });

  it("respecte une politique de preuve désactivée dans les réglages", async () => {
    const noProofCompany = await seedCompany(db, `${slug}-sans-preuve`);
    const noProofManager = await seedActor(db, { companyId: noProofCompany, role: "MANAGER" });
    await seedSetting(db, noProofCompany, { proofRequired: false });
    const noProofToken = await login(api, `${slug}-sans-preuve`, noProofManager);

    const missionId = await seedMission(db, { companyId: noProofCompany, reference: "CMD-SANS-PREUVE", status: "ARRIVE" });

    const before = await request<any>(api, { path: `/missions/${missionId}`, token: noProofToken });
    expect(before.body.proofRequired).toBe(false);

    const closed = await request<any>(api, {
      path: `/missions/${missionId}/transition`,
      token: noProofToken,
      body: { to: "LIVREE" },
    });
    expect(closed.status).toBe(201);
    expect(closed.body.status).toBe("LIVREE");
    expect(closed.body.proofRequired).toBe(false);
  });

  it("n'applique qu'une seule fois deux transitions concurrentes", async () => {
    const missionId = await createMission("CMD-CONCURRENT");

    const [first, second] = await Promise.all([
      request<any>(api, { path: `/missions/${missionId}/transition`, token, body: { to: "AFFECTEE" } }),
      request<any>(api, { path: `/missions/${missionId}/transition`, token, body: { to: "AFFECTEE" } }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect((await missionRow(db, missionId)).status).toBe("AFFECTEE");
  });

  it("filtre par statut et par recherche, et refuse une pagination hors bornes", async () => {
    const filterCompany = await seedCompany(db, `${slug}-filtre`);
    const filterManager = await seedActor(db, { companyId: filterCompany, role: "MANAGER" });
    const filterToken = await login(api, `${slug}-filtre`, filterManager);
    await seedMission(db, { companyId: filterCompany, reference: "FILTRE-A", status: "AFFECTEE", clientName: "Alpha" });
    await seedMission(db, { companyId: filterCompany, reference: "FILTRE-B", status: "LIVREE", clientName: "Beta" });

    const byStatus = await request<{ items: { reference: string }[] }>(api, {
      path: "/missions?status=LIVREE",
      token: filterToken,
    });
    expect(byStatus.status).toBe(200);
    expect(byStatus.body.items.map((m) => m.reference)).toEqual(["FILTRE-B"]);

    const bySearch = await request<{ items: { reference: string }[] }>(api, {
      path: "/missions?search=Alpha",
      token: filterToken,
    });
    expect(bySearch.body.items.map((m) => m.reference)).toEqual(["FILTRE-A"]);

    const tooBig = await request(api, { path: "/missions?take=101", token: filterToken });
    const zero = await request(api, { path: "/missions?take=0", token: filterToken });
    const unknownStatus = await request(api, { path: "/missions?status=EXPEDIEE", token: filterToken });
    expect(tooBig.status).toBe(400);
    expect(zero.status).toBe(400);
    expect(unknownStatus.status).toBe(400);
  });

  it("ne renvoie qu'une page et poursuit avec le curseur", async () => {
    const cursorCompany = await seedCompany(db, `${slug}-curseur`);
    const cursorManager = await seedActor(db, { companyId: cursorCompany, role: "MANAGER" });
    const cursorToken = await login(api, `${slug}-curseur`, cursorManager);
    for (let index = 0; index < 5; index += 1) {
      await seedMission(db, {
        companyId: cursorCompany,
        reference: `CURSEUR-${index}`,
        status: "A_AFFECTER",
        clientName: `Client ${index}`,
      });
    }

    const firstPage = await request<{ items: { id: string }[]; nextCursor: string | null }>(api, {
      path: "/missions?take=2",
      token: cursorToken,
    });
    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.nextCursor).toBeTruthy();

    const secondPage = await request<{ items: { id: string }[]; nextCursor: string | null }>(api, {
      path: `/missions?take=2&cursor=${encodeURIComponent(firstPage.body.nextCursor as string)}`,
      token: cursorToken,
    });
    expect(secondPage.body.items).toHaveLength(2);

    const seen = new Set([...firstPage.body.items, ...secondPage.body.items].map((m) => m.id));
    expect(seen.size).toBe(4);

    const broken = await request(api, { path: "/missions?cursor=pas-un-curseur", token: cursorToken });
    expect(broken.status).toBe(400);
  });

  it("répond 404 sur une mission inexistante ou d'un identifiant absurde", async () => {
    const unknown = await request(api, { path: "/missions/00000000-0000-4000-8000-000000000000", token });
    const nonsense = await request(api, { path: `/missions/${encodeURIComponent("'; DROP TABLE missions; --")}`, token });
    expect(unknown.status).toBe(404);
    expect(nonsense.status).toBe(404);

    const stillThere = await scalar(db, `SELECT count(*)::text AS value FROM missions WHERE "companyId" = $1`, [
      companyId,
    ]);
    expect(stillThere).toBeGreaterThan(0);
  });

  it("exige un jeton pour toutes les routes de mission", async () => {
    const noToken = await request(api, { path: "/missions" });
    const badToken = await request(api, { path: "/missions", token: "v1.aaa.1.bbb" });
    expect(noToken.status).toBe(401);
    expect(badToken.status).toBe(401);
  });
});
