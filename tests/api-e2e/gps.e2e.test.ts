// Tests HTTP — GPS : écriture, lecture, fraîcheur, périmètre.
//
// Régression ciblée : la vue renvoyait `gps.at`, `gps.latitude` et
// `gps.longitude` à `null` alors que les colonnes étaient bien lues. Ces tests
// échouent sur le code d'avant la correction et passent après — c'est ce qui
// distingue un correctif vérifié d'un correctif annoncé.
//
// Second invariant : une position périmée n'est jamais présentée comme actuelle,
// y compris lorsqu'elle a été enregistrée « à l'heure » puis a vieilli en base.

import { afterAll, beforeAll, expect, it } from "vitest";
import {
  auditActionsFor,
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
let manager: Actor;
let driver: Actor;
let otherManager: Actor;
let managerToken: string;
let driverToken: string;
let otherToken: string;

const DAKAR = { latitude: 14.6928, longitude: -17.4467 };

function record(missionId: string, body: unknown, token = managerToken) {
  return request<any>(api, { path: `/missions/${missionId}/gps`, token, body });
}

function view(missionId: string, token = managerToken) {
  return request<any>(api, { path: `/missions/${missionId}`, token });
}

httpSuite("HTTP — GPS : écriture, lecture et fraîcheur", () => {
  beforeAll(async () => {
    db = await connect();
    await migrateFresh(db);
    api = await startApi({ env: { TRUST_PROXY_HOPS: "1" } });
    slug = `gps-${Date.now().toString(36)}`;
    otherSlug = `${slug}-voisine`;
    companyId = await seedCompany(db, slug);
    otherCompanyId = await seedCompany(db, otherSlug);
    manager = await seedActor(db, { companyId, role: "MANAGER" });
    driver = await seedActor(db, { companyId, role: "DRIVER" });
    otherManager = await seedActor(db, { companyId: otherCompanyId, role: "MANAGER" });
    managerToken = await login(api, slug, manager);
    driverToken = await login(api, slug, driver);
    otherToken = await login(api, otherSlug, otherManager);
  }, 120_000);

  afterAll(async () => {
    await api?.stop();
    await db?.close();
  });

  it("renvoie les coordonnées réellement enregistrées", async () => {
    const missionId = await seedMission(db, {
      companyId,
      reference: "GPS-LECTURE",
      status: "EN_ROUTE",
      assignedUserId: driver.userId,
    });

    const written = await record(missionId, DAKAR);
    expect(written.status).toBe(201);

    const read = await view(missionId);
    expect(read.status).toBe(200);
    expect(read.body.gps.truth).toBe("REEL");
    expect(read.body.gps.latitude).toBeCloseTo(DAKAR.latitude, 6);
    expect(read.body.gps.longitude).toBeCloseTo(DAKAR.longitude, 6);
    expect(read.body.gps.at).toBeTruthy();
    expect(Math.abs(Date.parse(read.body.gps.at) - Date.now())).toBeLessThan(30_000);

    const row = await missionRow(db, missionId);
    expect(row.latitude).toBeCloseTo(DAKAR.latitude, 6);
    expect(row.gpsTruth).toBe("REEL");
  });

  it("conserve l'horodatage de mesure et le classe correctement", async () => {
    const missionId = await seedMission(db, { companyId, reference: "GPS-MESURE", status: "EN_ROUTE" });
    const recordedAt = new Date(Date.now() - 5 * 60_000).toISOString();

    const response = await record(missionId, { ...DAKAR, recordedAt });
    expect(response.status).toBe(201);

    const read = await view(missionId);
    expect(read.body.gps.truth).toBe("DERNIERE_POSITION_CONNUE");
    expect(read.body.gps.latitude).toBeCloseTo(DAKAR.latitude, 6);
    expect(Math.abs(Date.parse(read.body.gps.at) - Date.parse(recordedAt))).toBeLessThan(1000);
  });

  it("ne présente jamais une position périmée comme actuelle", async () => {
    // Enregistrée « à l'heure » (gpsTruth = REEL) mais vieille de 40 minutes en
    // base : la lecture doit reclasser la position, pas la relayer telle quelle.
    const missionId = await seedMission(db, {
      companyId,
      reference: "GPS-PERIMEE",
      status: "EN_ROUTE",
      gps: { ...DAKAR, ageSeconds: 2400, truth: "REEL" },
    });

    const read = await view(missionId);
    expect(read.body.gps.truth).toBe("INDISPONIBLE");
    expect(read.body.gps.latitude).toBeNull();
    expect(read.body.gps.longitude).toBeNull();
    // L'horodatage reste exposé : « dernière mesure connue », explicitement non
    // exploitable comme position courante.
    expect(read.body.gps.at).toBeTruthy();
  });

  it("expose une dernière position connue tant qu'elle reste exploitable", async () => {
    const missionId = await seedMission(db, {
      companyId,
      reference: "GPS-DERNIERE",
      status: "EN_ROUTE",
      gps: { ...DAKAR, ageSeconds: 840, truth: "REEL" },
    });

    const read = await view(missionId);
    expect(read.body.gps.truth).toBe("DERNIERE_POSITION_CONNUE");
    expect(read.body.gps.latitude).toBeCloseTo(DAKAR.latitude, 6);
    expect(read.body.gps.longitude).toBeCloseTo(DAKAR.longitude, 6);
  });

  it("renvoie une position absente comme indisponible, sans valeur inventée", async () => {
    const missionId = await seedMission(db, { companyId, reference: "GPS-ABSENTE", status: "EN_ROUTE" });
    const read = await view(missionId);

    expect(read.body.gps).toEqual({ truth: "INDISPONIBLE", at: null, latitude: null, longitude: null });
  });

  it("refuse une mesure trop ancienne et laisse la base intacte", async () => {
    const missionId = await seedMission(db, {
      companyId,
      reference: "GPS-TROP-VIEILLE",
      status: "EN_ROUTE",
      gps: { ...DAKAR, ageSeconds: 120 },
    });

    const response = await record(missionId, { latitude: 14.5, longitude: -17.5, recordedAt: new Date(Date.now() - 20 * 60_000).toISOString() });

    expect(response.status).toBe(400);
    const row = await missionRow(db, missionId);
    expect(row.latitude).toBeCloseTo(DAKAR.latitude, 6);
  });

  it("refuse un horodatage dans le futur", async () => {
    const missionId = await seedMission(db, { companyId, reference: "GPS-FUTUR", status: "EN_ROUTE" });
    const response = await record(missionId, {
      ...DAKAR,
      recordedAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    expect(response.status).toBe(400);
  });

  it("refuse des coordonnées hors limites ou non numériques", async () => {
    const missionId = await seedMission(db, { companyId, reference: "GPS-HORS-BORNES", status: "EN_ROUTE" });

    const latitudeTooHigh = await record(missionId, { latitude: 91, longitude: 0 });
    const latitudeTooLow = await record(missionId, { latitude: -91, longitude: 0 });
    const longitudeTooHigh = await record(missionId, { latitude: 0, longitude: 181 });
    const longitudeTooLow = await record(missionId, { latitude: 0, longitude: -181 });
    const notANumber = await record(missionId, { latitude: "nord", longitude: "ouest" });
    const missing = await record(missionId, { latitude: 14.6 });
    const unknownField = await record(missionId, { ...DAKAR, altitude: 12 });

    for (const response of [latitudeTooHigh, latitudeTooLow, longitudeTooHigh, longitudeTooLow, notANumber, missing, unknownField]) {
      expect(response.status).toBe(400);
    }

    const row = await missionRow(db, missionId);
    expect(row.latitude).toBeNull();
    expect(row.gpsTruth).toBe("INDISPONIBLE");
  });

  it("accepte les coordonnées aux limites exactes", async () => {
    const missionId = await seedMission(db, { companyId, reference: "GPS-BORNES", status: "EN_ROUTE" });
    const response = await record(missionId, { latitude: 90, longitude: 180 });
    expect(response.status).toBe(201);
    expect((await view(missionId)).body.gps.latitude).toBe(90);
  });

  it("trace la déclaration GPS dans l'audit avec l'identifiant de corrélation", async () => {
    const missionId = await seedMission(db, { companyId, reference: "GPS-AUDIT", status: "EN_ROUTE" });
    await request(api, {
      path: `/missions/${missionId}/gps`,
      token: managerToken,
      headers: { "X-Request-Id": "e2e-gps-audit-0001" },
      body: DAKAR,
    });

    expect(await auditActionsFor(db, missionId)).toContain("GPS_RECORDED");
  });

  it("un livreur ne déclare une position que sur ses propres missions", async () => {
    const ownMission = await seedMission(db, {
      companyId,
      reference: "GPS-DRIVER-PROPRE",
      status: "EN_ROUTE",
      assignedUserId: driver.userId,
    });
    const otherDriverMission = await seedMission(db, {
      companyId,
      reference: "GPS-DRIVER-AUTRE",
      status: "EN_ROUTE",
      assignedUserId: manager.userId,
    });
    const unassigned = await seedMission(db, { companyId, reference: "GPS-DRIVER-SANS", status: "EN_ROUTE" });

    const own = await record(ownMission, DAKAR, driverToken);
    const foreign = await record(otherDriverMission, DAKAR, driverToken);
    const orphan = await record(unassigned, DAKAR, driverToken);

    expect(own.status).toBe(201);
    // 403 et non 500 : un refus de périmètre est une décision d'autorisation.
    expect(foreign.status).toBe(403);
    expect(orphan.status).toBe(403);
    expect((await missionRow(db, otherDriverMission)).latitude).toBeNull();
  });

  it("ne divulgue ni la position ni l'existence d'une mission d'une autre entreprise", async () => {
    const missionId = await seedMission(db, {
      companyId,
      reference: "GPS-CONFIDENTIEL",
      status: "EN_ROUTE",
      gps: { ...DAKAR, ageSeconds: 30 },
    });

    const read = await view(missionId, otherToken);
    const write = await record(missionId, DAKAR, otherToken);

    expect(read.status).toBe(404);
    expect(write.status).toBe(404);
    expect(JSON.stringify(read.body)).not.toContain(String(DAKAR.latitude));
    expect((await missionRow(db, missionId)).latitude).toBeCloseTo(DAKAR.latitude, 6);
  });

  it("exige un jeton pour lire ou écrire une position", async () => {
    const missionId = await seedMission(db, { companyId, reference: "GPS-AUTH", status: "EN_ROUTE" });
    const read = await request(api, { path: `/missions/${missionId}` });
    const write = await request(api, { path: `/missions/${missionId}/gps`, body: DAKAR });
    expect(read.status).toBe(401);
    expect(write.status).toBe(401);
  });
});
