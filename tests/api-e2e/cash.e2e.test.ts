// Tests HTTP — caisse : encaissements, remises, idempotence, concurrence.
//
// L'argent est le domaine où une erreur ne se rattrape pas : chaque test vérifie
// la réponse HTTP **et** l'état persisté (compteurs de mission, journal
// `cash_movements`, journal d'audit). Un `201` sans mouvement serait un faux
// succès.

import { afterAll, beforeAll, expect, it } from "vitest";
import {
  auditActionsFor,
  cashMovements,
  connect,
  httpSuite,
  login,
  migrateFresh,
  missionRow,
  seedActor,
  seedCompany,
  seedMission,
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
let managerToken: string;
let driverToken: string;

/** Mission livrée, prête à être encaissée. */
async function deliveredMission(reference: string, expected = 12000, assignedUserId?: string): Promise<string> {
  return seedMission(db, {
    companyId,
    reference,
    status: "LIVREE",
    expectedAmount: expected,
    assignedUserId: assignedUserId ?? null,
    proofId: "preuve-livraison",
  });
}

function pay(missionId: string, collected: number, options: { key?: string; token?: string } = {}) {
  return request<any>(api, {
    path: `/missions/${missionId}/payment`,
    token: options.token ?? managerToken,
    headers: options.key === undefined ? {} : { "Idempotency-Key": options.key },
    body: { collected },
  });
}

function remit(missionId: string, amount: number, options: { key?: string; token?: string } = {}) {
  return request<any>(api, {
    path: `/missions/${missionId}/remittance`,
    token: options.token ?? managerToken,
    headers: options.key === undefined ? {} : { "Idempotency-Key": options.key },
    body: { amount },
  });
}

httpSuite("HTTP — caisse : encaissements, remises, idempotence", () => {
  beforeAll(async () => {
    db = await connect();
    await migrateFresh(db);
    api = await startApi({ env: { TRUST_PROXY_HOPS: "1" } });
    slug = `cash-${Date.now().toString(36)}`;
    companyId = await seedCompany(db, slug);
    manager = await seedActor(db, { companyId, role: "MANAGER" });
    driver = await seedActor(db, { companyId, role: "DRIVER" });
    managerToken = await login(api, slug, manager);
    driverToken = await login(api, slug, driver);
  }, 120_000);

  afterAll(async () => {
    await api?.stop();
    await db?.close();
  });

  it("refuse un encaissement avant LIVREE", async () => {
    const missionId = await seedMission(db, { companyId, reference: "CASH-AVANT-LIVREE", status: "ARRIVE" });
    const response = await pay(missionId, 5000, { key: "e2e-avant-livree" });

    expect(response.status).toBe(400);
    expect((await missionRow(db, missionId)).collectedAmount).toBe(0);
    expect(await cashMovements(db, missionId)).toHaveLength(0);
  });

  it("exige une clé d'idempotence", async () => {
    const missionId = await deliveredMission("CASH-SANS-CLE");
    const response = await pay(missionId, 1000);

    expect(response.status).toBe(400);
    expect(await cashMovements(db, missionId)).toHaveLength(0);
  });

  it("refuse une clé d'idempotence trop courte", async () => {
    const missionId = await deliveredMission("CASH-CLE-COURTE");
    const response = await pay(missionId, 1000, { key: "court" });
    expect(response.status).toBe(400);
  });

  it("refuse un encaissement supérieur au reste dû", async () => {
    const missionId = await deliveredMission("CASH-DEPASSEMENT", 10000);
    const response = await pay(missionId, 10001, { key: "e2e-depassement" });

    expect(response.status).toBe(400);
    expect((await missionRow(db, missionId)).collectedAmount).toBe(0);
    expect(await cashMovements(db, missionId)).toHaveLength(0);
  });

  it("refuse un montant non entier, nul ou négatif", async () => {
    const missionId = await deliveredMission("CASH-MONTANTS");

    const float = await pay(missionId, 10.5, { key: "e2e-float-0001" });
    const zero = await pay(missionId, 0, { key: "e2e-zero-0001" });
    const negative = await pay(missionId, -500, { key: "e2e-negative-1" });

    expect(float.status).toBe(400);
    expect(zero.status).toBe(400);
    expect(negative.status).toBe(400);
    expect(await cashMovements(db, missionId)).toHaveLength(0);
  });

  it("encaisse, écrit le mouvement et la trace d'audit", async () => {
    const missionId = await deliveredMission("CASH-OK", 12000);
    const response = await pay(missionId, 12000, { key: "e2e-encaissement-1" });

    expect(response.status).toBe(201);
    expect(response.body.money).toMatchObject({
      expected: 12000,
      collected: 12000,
      remitted: 0,
      // `difference` = attendu - remis (règle du domaine) : encaisser ne
      // l'annule pas, seule la remise de caisse le fait.
      difference: 12000,
    });

    const movements = await cashMovements(db, missionId);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: "ENCAISSEMENT", amount: 12000, idempotencyKey: "e2e-encaissement-1" });
    expect(await auditActionsFor(db, missionId)).toContain("PAYMENT_COLLECTED");
  });

  it("ignore le rejeu d'une clé identique sans créer de second mouvement", async () => {
    const missionId = await deliveredMission("CASH-REJEU", 12000);

    const first = await pay(missionId, 6000, { key: "e2e-rejeu-0001" });
    const replay = await pay(missionId, 6000, { key: "e2e-rejeu-0001" });

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body.money.collected).toBe(6000);
    expect(await cashMovements(db, missionId)).toHaveLength(1);
  });

  it("refuse la même clé avec un contenu différent", async () => {
    const missionId = await deliveredMission("CASH-CLE-DIFFERENTE", 12000);

    await pay(missionId, 6000, { key: "e2e-cle-diff-01" });
    const conflict = await pay(missionId, 3000, { key: "e2e-cle-diff-01" });

    expect(conflict.status).toBe(409);
    expect((await missionRow(db, missionId)).collectedAmount).toBe(6000);
    expect(await cashMovements(db, missionId)).toHaveLength(1);
  });

  it("interdit la double collecte concurrente de la totalité", async () => {
    const missionId = await deliveredMission("CASH-CONCURRENT", 10000);

    const [first, second] = await Promise.all([
      pay(missionId, 10000, { key: "e2e-concurrent-1" }),
      pay(missionId, 10000, { key: "e2e-concurrent-2" }),
    ]);

    // Une seule collecte aboutit. Le refus de la seconde vient d'une règle
    // métier (« dépasse le reste dû », 400) ou du contrôle de concurrence
    // (409) selon l'ordre réel d'exécution : les deux sont des refus explicites,
    // l'invariant qui compte est qu'il n'y ait jamais deux encaissements.
    const statuses = [first.status, second.status].sort();
    expect(statuses[0]).toBe(201);
    expect([400, 409]).toContain(statuses[1]);

    const row = await missionRow(db, missionId);
    expect(row.collectedAmount).toBe(10000);
    expect(row.collectedAmount).toBeLessThanOrEqual(row.expectedAmount);
    expect(await cashMovements(db, missionId)).toHaveLength(1);
  });

  it("refuse une remise de caisse à un livreur", async () => {
    const missionId = await deliveredMission("CASH-REMISE-DRIVER", 12000, driver.userId);
    await pay(missionId, 12000, { key: "e2e-remise-driver" });

    const response = await remit(missionId, 12000, { key: "e2e-remise-driver", token: driverToken });

    expect(response.status).toBe(403);
    expect((await missionRow(db, missionId)).remittedAmount).toBe(0);
    expect(await cashMovements(db, missionId)).toHaveLength(1);
  });

  it("refuse une remise supérieure aux espèces détenues", async () => {
    const missionId = await deliveredMission("CASH-REMISE-EXCES", 12000);
    await pay(missionId, 5000, { key: "e2e-remise-exces-1" });

    const response = await remit(missionId, 5001, { key: "e2e-remise-exces-1" });

    expect(response.status).toBe(400);
    expect((await missionRow(db, missionId)).remittedAmount).toBe(0);
  });

  it("refuse une remise sur une mission sans encaissement", async () => {
    const missionId = await deliveredMission("CASH-REMISE-VIDE", 12000);
    const response = await remit(missionId, 1000, { key: "e2e-remise-vide-1" });

    expect(response.status).toBe(400);
    expect(await cashMovements(db, missionId)).toHaveLength(0);
  });

  it("remet la caisse, journalise et laisse la caisse équilibrée", async () => {
    const missionId = await deliveredMission("CASH-REMISE-OK", 12000);

    await pay(missionId, 12000, { key: "e2e-remise-ok-01" });
    const response = await remit(missionId, 11000, { key: "e2e-remise-ok-02" });

    expect(response.status).toBe(201);
    expect(response.body.money).toMatchObject({ collected: 12000, remitted: 11000, difference: 1000 });

    const movements = await cashMovements(db, missionId);
    expect(movements.map((m) => m.type)).toEqual(["ENCAISSEMENT", "REMISE"]);

    // Le journal est la vérité comptable : les compteurs ne doivent jamais s'en
    // écarter.
    const collected = movements.filter((m) => m.type === "ENCAISSEMENT").reduce((sum, m) => sum + m.amount, 0);
    const remitted = movements.filter((m) => m.type === "REMISE").reduce((sum, m) => sum + m.amount, 0);
    const row = await missionRow(db, missionId);
    expect(collected).toBe(row.collectedAmount);
    expect(remitted).toBe(row.remittedAmount);
  });

  it("ignore le rejeu d'une remise", async () => {
    const missionId = await deliveredMission("CASH-REMISE-REJEU", 9000);
    await pay(missionId, 9000, { key: "e2e-remise-rejeu-1" });

    await remit(missionId, 4000, { key: "e2e-remise-rejeu-2" });
    const replay = await remit(missionId, 4000, { key: "e2e-remise-rejeu-2" });

    expect(replay.status).toBe(201);
    expect(replay.body.money.remitted).toBe(4000);
    expect(await cashMovements(db, missionId)).toHaveLength(2);
  });

  it("refuse toute opération sur la caisse d'une autre entreprise", async () => {
    const otherSlug = `${slug}-voisine`;
    const otherCompanyId = await seedCompany(db, otherSlug);
    const otherManager = await seedActor(db, { companyId: otherCompanyId, role: "MANAGER" });
    const otherToken = await login(api, otherSlug, otherManager);

    const missionId = await deliveredMission("CASH-VOISINE", 5000);
    const payment = await pay(missionId, 1000, { key: "e2e-voisine-0001", token: otherToken });
    const remittance = await remit(missionId, 1000, { key: "e2e-voisine-0002", token: otherToken });

    expect(payment.status).toBe(404);
    expect(remittance.status).toBe(404);
    expect(await cashMovements(db, missionId)).toHaveLength(0);
  });
});
