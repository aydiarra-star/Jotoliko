import test from "node:test";
import assert from "node:assert/strict";
import {
  assertDriverCapacity,
  calculateMonthlyAmountXof,
  hasPaidAccess,
  isProviderPaymentConfirmed,
  monthlyPriceFromEnvironment,
  parseSeatCount,
} from "./billing-core.mjs";

test("calcul mensuel selon les places sans prix par défaut", () => {
  assert.equal(calculateMonthlyAmountXof(5, 2500), 12500);
  assert.throws(() => monthlyPriceFromEnvironment({}), /doit être défini/);
  assert.throws(() => calculateMonthlyAmountXof(5, 0), /entier positif/);
});

test("refuse une quantité de places invalide", () => {
  for (const value of [0, -1, 1.5, "abc", 501]) assert.throws(() => parseSeatCount(value));
});

test("la capacité est appliquée côté serveur", () => {
  assert.equal(assertDriverCapacity({ activeDriverCount: 4, requestedActiveCount: 5, paidSeatLimit: 5 }), true);
  assert.throws(() => assertDriverCapacity({ activeDriverCount: 5, requestedActiveCount: 6, paidSeatLimit: 5 }), /Capacité dépassée/);
});

test("accès payant limité à ACTIVE ou à la période de grâce non expirée", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  assert.equal(hasPaidAccess({ status: "ACTIVE", now }), true);
  assert.equal(hasPaidAccess({ status: "PAST_DUE", now }), false);
  assert.equal(hasPaidAccess({ status: "GRACE_PERIOD", gracePeriodEndsAt: "2026-10-16T12:00:00Z", now }), true);
  assert.equal(hasPaidAccess({ status: "GRACE_PERIOD", gracePeriodEndsAt: "2026-10-14T12:00:00Z", now }), false);
});

test("aucun paiement n'est reconnu sur le seul retour navigateur", () => {
  assert.equal(isProviderPaymentConfirmed({ providerStatus: "completed", amountXof: 12500, currency: "XOF", providerReference: "pay_1" }), false);
  assert.equal(isProviderPaymentConfirmed({ signatureVerified: true, providerStatus: "completed", amountXof: 12500, currency: "XOF", providerReference: "pay_1" }), true);
  assert.equal(isProviderPaymentConfirmed({ signatureVerified: true, providerStatus: "completed", amountXof: 100, currency: "EUR", providerReference: "pay_1" }), false);
});
