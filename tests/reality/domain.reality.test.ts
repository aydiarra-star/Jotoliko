// Reality tests — règles métier et sécurité, sans base de données.
//
// Ces tests vérifient le **comportement réel** des invariants, pas l'existence
// d'un fichier. Chaque test correspond à un point de la liste obligatoire de
// docs/REALITY-TESTS-2026.md. Les points nécessitant PostgreSQL sont couverts
// par tests/reality/database.reality.test.ts.

import { describe, expect, it } from "vitest";
import {
  APP_ROLES,
  assertAcceptableGpsTimestamp,
  assertCanActOnMission,
  assertCollectAmount,
  assertDeliveryClosable,
  assertIdempotencyKey,
  assertPaymentAllowed,
  assertRemittanceAmount,
  assertTransition,
  availableForRemittance,
  canActOnMission,
  cashBreakdown,
  gpsTruthFromAge,
  isAllowed,
  isMissionStatus,
  isUsableCoordinates,
  maxCollectable,
  normalizeMoneyState,
  operationScope,
  type AppRole,
  type Mission,
} from "../../lib/jotoliko-os/core";
import * as auth from "../../lib/jotoliko-os/auth";
import {
  backoffMs,
  flushQueue,
  MemoryQueueStorage,
  OfflineQueue,
} from "../../lib/jotoliko-os/offline-queue";

const mission = (over: Partial<Mission> = {}): Mission => ({
  id: "m-1",
  orderId: "o-1",
  driverId: "driver-1",
  clientName: "Client test",
  address: {},
  status: "ARRIVE",
  proofRequired: true,
  money: normalizeMoneyState(10_000, 0, 0),
  gpsTruth: "INDISPONIBLE",
  syncStatus: "SYNCHRONISE",
  ...over,
});

const SECRET = "secret-de-test-uniquement";
const RECORDED_AT = "2026-10-15T10:00:00.000Z";

const enqueue = (queue: OfflineQueue, clientId: string) =>
  queue.enqueue({
    clientId,
    kind: "PAYMENT",
    targetId: "m-1",
    payload: { collected: 5_000 },
    recordedAt: RECORDED_AT,
  });

// ---------------------------------------------------------------------------
// #2 — Un jeton expiré est refusé
// ---------------------------------------------------------------------------
describe("#2 Authentification : jetons", () => {
  const claims = { sub: "u-1", cid: "c-1", role: "MANAGER", tv: 0 };
  const issued = 1_700_000_000_000;

  it("accepte un jeton valide et restitue les revendications", () => {
    const token = auth.encodeToken(SECRET, claims, issued);
    const result = auth.verifyToken(token, SECRET, issued + 1000);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.claims).toEqual(claims);
  });

  it("refuse un jeton expiré", () => {
    const token = auth.encodeToken(SECRET, claims, issued);
    const result = auth.verifyToken(token, SECRET, issued + auth.TOKEN_TTL_MS + 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("TOKEN_EXPIRE");
  });

  it("refuse un jeton dont la signature a été altérée", () => {
    const token = auth.encodeToken(SECRET, claims, issued);
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    expect(auth.verifyToken(tampered, SECRET, issued + 1000).ok).toBe(false);
  });

  it("refuse un jeton signé avec un autre secret", () => {
    const token = auth.encodeToken("un-autre-secret", claims, issued);
    expect(auth.verifyToken(token, SECRET, issued + 1000).ok).toBe(false);
  });

  it("refuse une charge utile modifiée sans re-signature", () => {
    const token = auth.encodeToken(SECRET, claims, issued);
    const [version, , ts, sig] = token.split(".") as [string, string, string, string];
    const forged = Buffer.from(JSON.stringify({ ...claims, role: "OWNER" }), "utf8").toString("base64url");
    expect(auth.verifyToken(`${version}.${forged}.${ts}.${sig}`, SECRET, issued + 1000).ok).toBe(false);
  });

  it("refuse un jeton dont la version de révocation est dépassée", () => {
    const token = auth.encodeToken(SECRET, claims, issued);
    expect(auth.verifyToken(token, SECRET, issued + 1000, { maxTokenVersion: 1 }).ok).toBe(false);
  });

  it("refuse un jeton d'horodatage futur au-delà du décalage toléré", () => {
    const token = auth.encodeToken(SECRET, claims, issued);
    const result = auth.verifyToken(token, SECRET, issued - auth.CLOCK_SKEW_MS - 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("JETON_DANS_LE_FUTUR");
  });

  it("refuse les entrées malformées sans lever d'exception", () => {
    for (const bad of [undefined, null, "", "abc", "a.b.c", "v9.a.b.c", 42]) {
      expect(auth.verifyToken(bad, SECRET, issued).ok).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// #3 — Un livreur ne peut pas effectuer une opération de caisse réservée
// ---------------------------------------------------------------------------
describe("#3 Autorisations par rôle", () => {
  it("interdit au livreur la remise de caisse", () => {
    expect(isAllowed("DRIVER", "remitCash")).toBe(false);
    expect(isAllowed("MANAGER", "remitCash")).toBe(true);
    expect(isAllowed("ADMIN", "remitCash")).toBe(true);
    expect(isAllowed("OWNER", "remitCash")).toBe(true);
  });

  it("autorise le livreur à encaisser mais pas à lire l'audit", () => {
    expect(isAllowed("DRIVER", "collectPayment")).toBe(true);
    expect(isAllowed("DRIVER", "readAudit")).toBe(false);
  });

  it("n'accorde au lecteur aucune capacité d'écriture", () => {
    const writes = ["collectPayment", "remitCash", "transitionMission", "recordGps", "writeOrder"] as const;
    for (const permission of writes) expect(isAllowed("VIEWER", permission)).toBe(false);
  });

  it("couvre tous les rôles déclarés", () => {
    for (const role of APP_ROLES) {
      expect(typeof isAllowed(role as AppRole, "readAudit")).toBe("boolean");
    }
  });
});

// ---------------------------------------------------------------------------
// Périmètre livreur : chacun ne voit que ses missions
// ---------------------------------------------------------------------------
describe("Périmètre des missions par utilisateur", () => {
  it("un livreur n'agit que sur la mission qui lui est affectée", () => {
    expect(canActOnMission("DRIVER", "u-1", "u-1")).toBe(true);
    expect(canActOnMission("DRIVER", "u-1", "u-2")).toBe(false);
    expect(canActOnMission("DRIVER", "u-1", null)).toBe(false);
    expect(canActOnMission("DRIVER", "u-1", undefined)).toBe(false);
    expect(canActOnMission("DRIVER", "u-1", "")).toBe(false);
  });

  it("refuse explicitement au lieu de retourner silencieusement faux", () => {
    expect(() => assertCanActOnMission("DRIVER", "u-1", "u-2")).toThrow(/périmètre/);
    expect(() => assertCanActOnMission("MANAGER", "u-1", "u-2")).not.toThrow();
  });

  it("interdit toute action aux rôles sans droit d'écriture", () => {
    expect(() => assertCanActOnMission("VIEWER", "u-1", "u-1")).toThrow();
    expect(() => assertCanActOnMission("SELLER", "u-1", "u-1")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// #4 — Un encaissement avant LIVREE est refusé
// ---------------------------------------------------------------------------
describe("#4 Encaissement conditionné au statut", () => {
  it("refuse l'encaissement tant que la mission n'est pas LIVREE", () => {
    for (const status of ["A_AFFECTER", "AFFECTEE", "EN_ROUTE", "ARRIVE", "ECHEC"] as const) {
      expect(() => assertPaymentAllowed(mission({ status }))).toThrow(/avant LIVREE/);
    }
  });

  it("accepte l'encaissement une fois la mission LIVREE", () => {
    expect(() => assertPaymentAllowed(mission({ status: "LIVREE" }))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// #5 — Une livraison exige sa preuve quand la politique l'impose
// ---------------------------------------------------------------------------
describe("#5 Preuve de livraison obligatoire", () => {
  it("refuse la clôture sans preuve si la preuve est exigée", () => {
    expect(() => assertDeliveryClosable(mission({ proofRequired: true }))).toThrow(/Preuve requise/);
  });

  it("accepte la clôture avec une preuve", () => {
    expect(() =>
      assertDeliveryClosable(mission({ proofRequired: true, proofId: "proof-1" }))
    ).not.toThrow();
  });

  it("accepte la clôture sans preuve si la politique ne l'exige pas", () => {
    expect(() => assertDeliveryClosable(mission({ proofRequired: false }))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// #6 — Une remise supérieure au disponible est refusée
// ---------------------------------------------------------------------------
describe("#6 Plafond de remise", () => {
  it("refuse une remise supérieure aux espèces détenues", () => {
    const m = mission({ status: "LIVREE", money: normalizeMoneyState(10_000, 8_000, 3_000) });
    expect(availableForRemittance(m)).toBe(5_000);
    expect(() => assertRemittanceAmount(m, 5_001)).toThrow(/supérieure/);
  });

  it("accepte une remise dans la limite du disponible", () => {
    const m = mission({ status: "LIVREE", money: normalizeMoneyState(10_000, 8_000, 3_000) });
    expect(() => assertRemittanceAmount(m, 5_000)).not.toThrow();
  });

  it("refuse une remise sans encaissement préalable", () => {
    const m = mission({ status: "LIVREE", money: normalizeMoneyState(10_000, 0, 0) });
    expect(() => assertRemittanceAmount(m, 1)).toThrow();
  });

  it("refuse les montants nuls, négatifs ou non entiers", () => {
    const m = mission({ status: "LIVREE", money: normalizeMoneyState(10_000, 8_000, 0) });
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => assertRemittanceAmount(m, bad)).toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// Plafond d'encaissement
// ---------------------------------------------------------------------------
describe("Plafond d'encaissement", () => {
  it("refuse un encaissement supérieur au reste dû", () => {
    const m = mission({ status: "LIVREE", money: normalizeMoneyState(10_000, 6_000, 0) });
    expect(maxCollectable(m)).toBe(4_000);
    expect(() => assertCollectAmount(m, 4_001)).toThrow(/reste dû/);
    expect(() => assertCollectAmount(m, 4_000)).not.toThrow();
  });

  it("refuse un encaissement sur une mission déjà soldée", () => {
    const m = mission({ status: "LIVREE", money: normalizeMoneyState(10_000, 10_000, 0) });
    expect(() => assertCollectAmount(m, 1)).toThrow();
  });

  it("ne produit jamais de plafond négatif", () => {
    const over = mission({ status: "LIVREE", money: normalizeMoneyState(10_000, 12_000, 0) });
    expect(maxCollectable(over)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// #8 / #9 — GPS : fraîcheur et coordonnées
// ---------------------------------------------------------------------------
describe("#8 Fraîcheur de la position", () => {
  it("classe une position ancienne comme indisponible, jamais comme actuelle", () => {
    expect(gpsTruthFromAge(0)).toBe("REEL");
    expect(gpsTruthFromAge(60)).toBe("REEL");
    expect(gpsTruthFromAge(61)).toBe("DERNIERE_POSITION_CONNUE");
    expect(gpsTruthFromAge(900)).toBe("DERNIERE_POSITION_CONNUE");
    expect(gpsTruthFromAge(901)).toBe("INDISPONIBLE");
    expect(gpsTruthFromAge(86_400)).toBe("INDISPONIBLE");
  });

  it("retourne indisponible pour une entrée absente ou incohérente", () => {
    for (const bad of [null, Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(gpsTruthFromAge(bad)).toBe("INDISPONIBLE");
    }
  });

  it("refuse un horodatage GPS trop ancien ou dans le futur", () => {
    const now = new Date("2026-10-15T12:00:00.000Z");
    expect(() => assertAcceptableGpsTimestamp(new Date("2026-10-15T12:00:00.000Z"), now)).not.toThrow();
    expect(() => assertAcceptableGpsTimestamp(new Date("2026-10-15T11:00:00.000Z"), now)).toThrow(/trop ancienne/);
    expect(() => assertAcceptableGpsTimestamp(new Date("2026-10-15T14:00:00.000Z"), now)).toThrow(/futur/);
  });
});

describe("#9 Coordonnées hors limites", () => {
  it("rejette les coordonnées hors du globe", () => {
    expect(isUsableCoordinates(14.6928, -17.4467)).toBe(true);
    expect(isUsableCoordinates(91, 0)).toBe(false);
    expect(isUsableCoordinates(-91, 0)).toBe(false);
    expect(isUsableCoordinates(0, 181)).toBe(false);
    expect(isUsableCoordinates(0, -181)).toBe(false);
  });

  it("rejette les coordonnées absentes ou non numériques", () => {
    for (const bad of [undefined, null, "14.6", Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isUsableCoordinates(bad, 0)).toBe(false);
      expect(isUsableCoordinates(0, bad)).toBe(false);
    }
  });

  it("accepte les bornes exactes", () => {
    expect(isUsableCoordinates(90, 180)).toBe(true);
    expect(isUsableCoordinates(-90, -180)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// #10 — Une transition interdite est refusée
// ---------------------------------------------------------------------------
describe("#10 Transitions de statut", () => {
  it("interdit de clôturer une mission sans être passé par ARRIVE", () => {
    expect(() => assertTransition("EN_ROUTE", "LIVREE")).toThrow(/Transition interdite/);
    expect(() => assertTransition("A_AFFECTER", "LIVREE")).toThrow();
    expect(() => assertTransition("AFFECTEE", "ARRIVE")).toThrow();
  });

  it("autorise le parcours nominal", () => {
    expect(() => assertTransition("A_AFFECTER", "AFFECTEE")).not.toThrow();
    expect(() => assertTransition("AFFECTEE", "EN_ROUTE")).not.toThrow();
    expect(() => assertTransition("EN_ROUTE", "ARRIVE")).not.toThrow();
    expect(() => assertTransition("ARRIVE", "LIVREE")).not.toThrow();
  });

  it("interdit toute sortie de l'état terminal RETOUR", () => {
    for (const target of ["A_AFFECTER", "AFFECTEE", "EN_ROUTE", "ARRIVE", "LIVREE", "ECHEC"] as const) {
      expect(() => assertTransition("RETOUR", target)).toThrow();
    }
  });

  it("autorise la reprogrammation d'un échec", () => {
    expect(() => assertTransition("ECHEC", "REPROGRAMMEE")).not.toThrow();
    expect(() => assertTransition("REPROGRAMMEE", "AFFECTEE")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Validation des statuts reçus
// ---------------------------------------------------------------------------
describe("Validation des entrées de statut", () => {
  it("rejette tout statut inconnu, y compris une tentative d'injection", () => {
    for (const bad of ["livree", "LIVRE", "", null, undefined, 0, {}, "A_AFFECTER; DROP TABLE"]) {
      expect(isMissionStatus(bad)).toBe(false);
    }
    expect(isMissionStatus("LIVREE")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Caisse : cohérence des montants
// ---------------------------------------------------------------------------
describe("Cohérence des montants", () => {
  it("sépare reste dû, manque à encaisser et espèces détenues", () => {
    expect(cashBreakdown(10_000, 8_000, 3_000)).toEqual({
      expected: 10_000,
      collected: 8_000,
      remitted: 3_000,
      collectionGap: 2_000,
      cashInHand: 5_000,
      difference: 7_000,
      variance: -2_000,
    });
  });

  it("expose un encaissement excédentaire au lieu de l'écraser", () => {
    const b = cashBreakdown(10_000, 11_000, 0);
    expect(b.variance).toBe(1_000);
    expect(b.collectionGap).toBe(-1_000);
    expect(b.collected).toBe(11_000);
  });

  it("conserve le contrat historique de normalizeMoneyState", () => {
    expect(normalizeMoneyState(10_000, 8_500, 8_000)).toEqual({
      expected: 10_000,
      collected: 8_500,
      remitted: 8_000,
      difference: 2_000,
    });
  });
});

// ---------------------------------------------------------------------------
// Idempotence
// ---------------------------------------------------------------------------
describe("Clés d'idempotence", () => {
  it("exige une clé suffisamment longue", () => {
    expect(() => assertIdempotencyKey("court")).toThrow();
    expect(() => assertIdempotencyKey("")).toThrow();
    expect(() => assertIdempotencyKey(undefined)).toThrow();
    expect(() => assertIdempotencyKey("cle-valide-1234")).not.toThrow();
  });

  it("cloisonne les clés par entreprise et par opération", () => {
    expect(operationScope("PAYMENT", "m-1")).toBe("PAYMENT:m-1");
    expect(operationScope("REMITTANCE", "m-1")).not.toBe(operationScope("PAYMENT", "m-1"));
  });
});

// ---------------------------------------------------------------------------
// #15 — Une erreur réseau ne perd pas silencieusement une opération
// ---------------------------------------------------------------------------
describe("#15 File d'attente hors ligne", () => {
  it("conserve l'opération et ne la confirme pas si l'envoi échoue", async () => {
    const queue = new OfflineQueue(new MemoryQueueStorage());
    await enqueue(queue, "op-1");

    const result = await flushQueue(
      queue,
      async () => {
        throw new Error("réseau indisponible");
      },
      Date.now()
    );

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    const report = await queue.report();
    expect(report.synced).toBe(0);
    expect(report.failed).toBe(1);
    expect(report.pendingOperations).toHaveLength(1);
    expect(report.pendingOperations[0]?.lastError).toContain("réseau");
    expect(report.pendingOperations[0]?.recordedAt).toBe(RECORDED_AT);
  });

  it("ne confirme jamais une opération sans accusé de réception serveur", async () => {
    const queue = new OfflineQueue(new MemoryQueueStorage());
    await enqueue(queue, "op-2");

    // Réponse « acceptée » mais sans horodatage serveur : pas une confirmation.
    const result = await flushQueue(queue, async () => ({ accepted: true }), Date.now());
    expect(result.synced).toBe(0);
    expect((await queue.report()).synced).toBe(0);
  });

  it("ne duplique pas une opération réenregistrée avec la même clé", async () => {
    const queue = new OfflineQueue(new MemoryQueueStorage());
    await enqueue(queue, "op-3");
    await enqueue(queue, "op-3");
    await enqueue(queue, "op-3");
    expect(await queue.pending()).toHaveLength(1);
  });

  it("reprend les opérations après reconnexion, sans doublon", async () => {
    const queue = new OfflineQueue(new MemoryQueueStorage());
    await enqueue(queue, "op-4");

    await flushQueue(queue, async () => ({ accepted: true, syncedAt: "2026-10-15T10:05:00.000Z" }), Date.now());
    expect((await queue.report()).synced).toBe(1);

    const again = await flushQueue(queue, async () => ({ accepted: true, syncedAt: "2026-10-15T10:06:00.000Z" }), Date.now());
    expect(again.synced).toBe(0);
    expect(await queue.pending()).toHaveLength(0);
  });

  it("récupère une opération interrompue en pleine synchronisation", async () => {
    const storage = new MemoryQueueStorage();
    const queue = new OfflineQueue(storage);
    await enqueue(queue, "op-5");
    await queue.markSending("op-5");

    // Simule un redémarrage : une nouvelle instance relit le même stockage.
    const reopened = new OfflineQueue(storage);
    expect(await reopened.recoverInterrupted()).toBe(1);
    expect((await reopened.pending())[0]?.state).toBe("EN_ATTENTE");
  });

  it("repousse les tentatives suivantes selon un backoff croissant plafonné", () => {
    expect(backoffMs(0, "x")).toBeLessThanOrEqual(backoffMs(3, "x"));
    expect(backoffMs(20, "x")).toBeLessThanOrEqual(5 * 60_000 * 1.1);
    expect(backoffMs(2, "abc")).toBeGreaterThanOrEqual(8_000);
  });

  it("conserve la distinction entre horodatage appareil et horodatage serveur", async () => {
    const storage = new MemoryQueueStorage();
    const queue = new OfflineQueue(storage);
    await enqueue(queue, "op-6");
    await flushQueue(
      queue,
      async () => ({ accepted: true, syncedAt: "2026-10-15T10:09:00.000Z", resultId: "mv-1" }),
      Date.now()
    );

    const stored = await storage.all();
    expect(stored[0]?.recordedAt).toBe(RECORDED_AT);
    expect(stored[0]?.syncedAt).toBe("2026-10-15T10:09:00.000Z");
    expect(stored[0]?.serverResultId).toBe("mv-1");
  });
});
