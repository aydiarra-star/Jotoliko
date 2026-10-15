// Tests HTTP — isolation multi-entreprise et périmètre par rôle.
//
// Ces cas visent la faille la plus coûteuse pour un pilote : l'entreprise A qui
// lit ou modifie les données de l'entreprise B, ou un livreur qui agit sur le
// travail d'un autre. Chaque refus est vérifié côté réponse **et** côté base :
// un `403` sans effet est correct, un `403` accompagné d'une écriture ne l'est pas.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  cashMovements,
  connect,
  httpSuite,
  login,
  migrateFresh,
  missionRow,
  request,
  seedActor,
  seedCompany,
  seedMission,
  startApi,
  type Actor,
  type RunningApi,
  type SqlClient,
} from "./harness";

let db: SqlClient;
let api: RunningApi;
let slug: string;
let companyId: string;
let otherSlug: string;
let otherCompanyId: string;

let owner: Actor;
let driverOne: Actor;
let driverTwo: Actor;
let viewer: Actor;
let seller: Actor;
let otherOwner: Actor;

let ownerToken: string;
let driverOneToken: string;
let driverTwoToken: string;
let viewerToken: string;
let sellerToken: string;
let otherOwnerToken: string;

httpSuite("HTTP — isolation entre entreprises et périmètre des rôles", () => {
  beforeAll(async () => {
    db = await connect();
    await migrateFresh(db);
    api = await startApi({ env: { TRUST_PROXY_HOPS: "1" } });
    slug = `iso-${Date.now().toString(36)}`;
    otherSlug = `${slug}-b`;
    companyId = await seedCompany(db, slug);
    otherCompanyId = await seedCompany(db, otherSlug);

    owner = await seedActor(db, { companyId, role: "OWNER" });
    driverOne = await seedActor(db, { companyId, role: "DRIVER" });
    driverTwo = await seedActor(db, { companyId, role: "DRIVER" });
    viewer = await seedActor(db, { companyId, role: "VIEWER" });
    seller = await seedActor(db, { companyId, role: "SELLER" });
    otherOwner = await seedActor(db, { companyId: otherCompanyId, role: "OWNER" });

    ownerToken = await login(api, slug, owner);
    driverOneToken = await login(api, slug, driverOne);
    driverTwoToken = await login(api, slug, driverTwo);
    viewerToken = await login(api, slug, viewer);
    sellerToken = await login(api, slug, seller);
    otherOwnerToken = await login(api, otherSlug, otherOwner);
  }, 120_000);

  afterAll(async () => {
    await api?.stop();
    await db?.close();
  });

  it("un livreur ne voit que ses propres missions dans la liste", async () => {
    const listCompanyId = await seedCompany(db, `${slug}-liste`);
    const listDriver = await seedActor(db, { companyId: listCompanyId, role: "DRIVER" });
    const listOtherDriver = await seedActor(db, { companyId: listCompanyId, role: "DRIVER" });
    const listManager = await seedActor(db, { companyId: listCompanyId, role: "MANAGER" });
    const listDriverToken = await login(api, `${slug}-liste`, listDriver);
    const listManagerToken = await login(api, `${slug}-liste`, listManager);

    await seedMission(db, {
      companyId: listCompanyId,
      reference: "LISTE-MIENNE",
      status: "EN_ROUTE",
      assignedUserId: listDriver.userId,
    });
    await seedMission(db, {
      companyId: listCompanyId,
      reference: "LISTE-AUTRE",
      status: "EN_ROUTE",
      assignedUserId: listOtherDriver.userId,
    });
    await seedMission(db, { companyId: listCompanyId, reference: "LISTE-SANS", status: "A_AFFECTER" });

    const mine = await request<{ items: { reference: string }[] }>(api, {
      path: "/missions",
      token: listDriverToken,
    });
    expect(mine.status).toBe(200);
    expect(mine.body.items.map((m) => m.reference)).toEqual(["LISTE-MIENNE"]);

    const all = await request<{ items: { reference: string }[] }>(api, {
      path: "/missions",
      token: listManagerToken,
    });
    expect(all.body.items.map((m) => m.reference).sort()).toEqual(["LISTE-AUTRE", "LISTE-MIENNE", "LISTE-SANS"]);
  });

  it("un livreur ne peut pas agir sur la mission d'un autre livreur", async () => {
    const missionId = await seedMission(db, {
      companyId,
      reference: "ISO-DRIVER-AUTRE",
      status: "EN_ROUTE",
      assignedUserId: driverTwo.userId,
      expectedAmount: 5000,
    });

    const transition = await request(api, {
      path: `/missions/${missionId}/transition`,
      token: driverOneToken,
      body: { to: "ARRIVE" },
    });
    const gps = await request(api, {
      path: `/missions/${missionId}/gps`,
      token: driverOneToken,
      body: { latitude: 14.7, longitude: -17.4 },
    });

    expect(transition.status).toBe(403);
    expect(gps.status).toBe(403);

    const row = await missionRow(db, missionId);
    expect(row.status).toBe("EN_ROUTE");
    expect(row.latitude).toBeNull();
  });

  it("un livreur ne peut pas encaisser sur la mission d'un autre livreur", async () => {
    const missionId = await seedMission(db, {
      companyId,
      reference: "ISO-DRIVER-CAISSE",
      status: "LIVREE",
      assignedUserId: driverTwo.userId,
      expectedAmount: 8000,
    });

    const response = await request(api, {
      path: `/missions/${missionId}/payment`,
      token: driverOneToken,
      headers: { "Idempotency-Key": "iso-driver-caisse" },
      body: { collected: 8000 },
    });

    expect(response.status).toBe(403);
    expect((await missionRow(db, missionId)).collectedAmount).toBe(0);
    expect(await cashMovements(db, missionId)).toHaveLength(0);
  });

  it("un livreur agit normalement sur sa propre mission", async () => {
    const missionId = await seedMission(db, {
      companyId,
      reference: "ISO-DRIVER-PROPRE",
      status: "AFFECTEE",
      assignedUserId: driverOne.userId,
    });

    const response = await request<any>(api, {
      path: `/missions/${missionId}/transition`,
      token: driverOneToken,
      body: { to: "EN_ROUTE" },
    });
    expect(response.status).toBe(201);
    expect(response.body.status).toBe("EN_ROUTE");
  });

  it("ne laisse pas un livreur s'emparer d'une mission non affectée", async () => {
    const missionId = await seedMission(db, { companyId, reference: "ISO-NON-AFFECTEE", status: "A_AFFECTER" });
    const response = await request(api, {
      path: `/missions/${missionId}/transition`,
      token: driverOneToken,
      body: { to: "AFFECTEE" },
    });

    expect(response.status).toBe(403);
    expect((await missionRow(db, missionId)).status).toBe("A_AFFECTER");
  });

  it("refuse à un lecteur toute mutation", async () => {
    const missionId = await seedMission(db, {
      companyId,
      reference: "ISO-LECTEUR",
      status: "EN_ROUTE",
      expectedAmount: 4000,
    });

    const read = await request(api, { path: `/missions/${missionId}`, token: viewerToken });
    const transition = await request(api, {
      path: `/missions/${missionId}/transition`,
      token: viewerToken,
      body: { to: "ARRIVE" },
    });
    const payment = await request(api, {
      path: `/missions/${missionId}/payment`,
      token: viewerToken,
      headers: { "Idempotency-Key": "iso-lecteur-0001" },
      body: { collected: 1000 },
    });
    const gps = await request(api, {
      path: `/missions/${missionId}/gps`,
      token: viewerToken,
      body: { latitude: 14.7, longitude: -17.4 },
    });

    expect(read.status).toBe(200);
    expect(transition.status).toBe(403);
    expect(payment.status).toBe(403);
    expect(gps.status).toBe(403);
    expect((await missionRow(db, missionId)).status).toBe("EN_ROUTE");
  });

  it("refuse à un vendeur la progression des missions", async () => {
    const missionId = await seedMission(db, {
      companyId,
      reference: "ISO-VENDEUR",
      status: "ARRIVE",
      expectedAmount: 3000,
    });

    const transition = await request(api, {
      path: `/missions/${missionId}/transition`,
      token: sellerToken,
      body: { to: "LIVREE", proofId: "preuve-vendeur" },
    });
    expect(transition.status).toBe(403);
    expect((await missionRow(db, missionId)).status).toBe("ARRIVE");
  });

  it("ne laisse pas une entreprise lire, modifier ou encaisser chez une autre", async () => {
    const missionId = await seedMission(db, {
      companyId,
      reference: "ISO-TENANT",
      status: "LIVREE",
      expectedAmount: 7000,
    });

    const read = await request(api, { path: `/missions/${missionId}`, token: otherOwnerToken });
    const transition = await request(api, {
      path: `/missions/${missionId}/transition`,
      token: otherOwnerToken,
      body: { to: "REPROGRAMMEE", reason: "Tentative depuis une autre entreprise" },
    });
    const payment = await request(api, {
      path: `/missions/${missionId}/payment`,
      token: otherOwnerToken,
      headers: { "Idempotency-Key": "iso-tenant-0001" },
      body: { collected: 7000 },
    });
    const remittance = await request(api, {
      path: `/missions/${missionId}/remittance`,
      token: otherOwnerToken,
      headers: { "Idempotency-Key": "iso-tenant-0002" },
      body: { amount: 1000 },
    });
    const assignment = await request(api, {
      path: `/missions/${missionId}/assignment`,
      token: otherOwnerToken,
      body: { assigneeUserId: otherOwner.userId },
    });

    // 404 et non 403 : l'existence de la ressource n'est pas révélée.
    for (const response of [read, transition, payment, remittance, assignment]) {
      expect(response.status).toBe(404);
    }

    const row = await missionRow(db, missionId);
    expect(row.status).toBe("LIVREE");
    expect(row.collectedAmount).toBe(0);
    expect(row.remittedAmount).toBe(0);
    expect(await cashMovements(db, missionId)).toHaveLength(0);
  });

  it("ne laisse pas une entreprise lister les missions d'une autre", async () => {
    const isolatedSlug = `${slug}-c`;
    const isolatedCompanyId = await seedCompany(db, isolatedSlug);
    const isolatedOwner = await seedActor(db, { companyId: isolatedCompanyId, role: "OWNER" });
    const isolatedToken = await login(api, isolatedSlug, isolatedOwner);
    await seedMission(db, { companyId: isolatedCompanyId, reference: "ISO-LISTE-C", status: "EN_ROUTE" });
    await seedMission(db, { companyId: otherCompanyId, reference: "ISO-LISTE-B", status: "EN_ROUTE" });

    const response = await request<{ items: { reference: string }[] }>(api, {
      path: "/missions",
      token: isolatedToken,
    });

    expect(response.status).toBe(200);
    expect(response.body.items.map((m) => m.reference)).toEqual(["ISO-LISTE-C"]);
  });

  it("un jeton reste lié à l'entreprise qui l'a émis", async () => {
    // Le même compte est membre de deux entreprises ; le jeton A ne doit pas
    // donner accès aux données de B.
    const dualSlug = `${slug}-dual`;
    const dualCompanyId = await seedCompany(db, dualSlug);
    const dualUser = await seedActor(db, { companyId, role: "VIEWER", email: `dual-${Date.now()}@jotoliko.test` });
    await db.query(
      `INSERT INTO memberships (id, "userId", "companyId", "roleId")
       SELECT $1, $2, $3, id FROM roles WHERE code = 'OWNER'`,
      [randomUUID(), dualUser.userId, dualCompanyId]
    );

    const tokenForA = await login(api, slug, dualUser);
    const tokenForB = await login(api, dualSlug, dualUser);

    const missionA = await seedMission(db, { companyId, reference: "ISO-DUAL-A", status: "EN_ROUTE" });
    const missionB = await seedMission(db, { companyId: dualCompanyId, reference: "ISO-DUAL-B", status: "EN_ROUTE" });

    expect((await request(api, { path: `/missions/${missionA}`, token: tokenForA })).status).toBe(200);
    expect((await request(api, { path: `/missions/${missionB}`, token: tokenForA })).status).toBe(404);
    expect((await request(api, { path: `/missions/${missionB}`, token: tokenForB })).status).toBe(200);
    expect((await request(api, { path: `/missions/${missionA}`, token: tokenForB })).status).toBe(404);
  });
});
