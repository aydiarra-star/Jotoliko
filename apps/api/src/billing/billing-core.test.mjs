import test from "node:test";
import assert from "node:assert/strict";
import {
  assertDriverCapacity,
  calculateMonthlyAmountXof,
  hasPaidAccess,
  isProviderPaymentConfirmed,
  monthlyPriceFromEnvironment,
  matchesExpectedCheckout,
  parseSeatCount,
} from "./billing-core.mjs";

test("calcul mensuel selon les places sans prix par défaut", () => {
  assert.equal(calculateMonthlyAmountXof(5, 2500), 12500);
  assert.throws(() => monthlyPriceFromEnvironment({}), /doit être défini/);
  assert.throws(() => monthlyPriceFromEnvironment({ JOTOLIKO_PRICE_PER_DRIVER_XOF: "0" }), /entier positif/);
  assert.throws(() => monthlyPriceFromEnvironment({ JOTOLIKO_PRICE_PER_DRIVER_XOF: "12.5" }), /entier positif/);
  assert.throws(() => calculateMonthlyAmountXof(5, 0), /entier positif/);
  assert.throws(() => calculateMonthlyAmountXof(500, Number.MAX_SAFE_INTEGER), /dépasse la limite/);
});

test("refuse une quantité de places invalide", () => {
  for (const value of [0, -1, 1.5, "abc", 501, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => parseSeatCount(value));
  }
});

test("la capacité est appliquée côté serveur", () => {
  assert.equal(assertDriverCapacity({ activeDriverCount: 4, requestedActiveCount: 5, paidSeatLimit: 5 }), true);
  assert.throws(() => assertDriverCapacity({ activeDriverCount: 5, requestedActiveCount: 6, paidSeatLimit: 5 }), /Capacité dépassée/);
  assert.throws(() => assertDriverCapacity({ activeDriverCount: -1, requestedActiveCount: 1, paidSeatLimit: 5 }), /entier positif ou nul/);
  assert.throws(() => assertDriverCapacity({ activeDriverCount: 1, requestedActiveCount: 1, paidSeatLimit: 1.5 }), /entier positif ou nul/);
});

test("accès payant limité à ACTIVE ou à la période de grâce non expirée", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  assert.equal(hasPaidAccess({ status: "ACTIVE", now }), true);
  assert.equal(hasPaidAccess({ status: "PAST_DUE", now }), false);
  assert.equal(hasPaidAccess({ status: "GRACE_PERIOD", gracePeriodEndsAt: "2026-10-16T12:00:00Z", now }), true);
  assert.equal(hasPaidAccess({ status: "GRACE_PERIOD", gracePeriodEndsAt: "2026-10-14T12:00:00Z", now }), false);
  assert.equal(hasPaidAccess({ status: "GRACE_PERIOD", gracePeriodEndsAt: "date-invalide", now }), false);
});

test("aucun paiement n'est reconnu sur le seul retour navigateur", () => {
  assert.equal(isProviderPaymentConfirmed({ providerStatus: "completed", amountXof: 12500, currency: "XOF", providerReference: "pay_1" }), false);
  assert.equal(isProviderPaymentConfirmed({ signatureVerified: true, providerStatus: "completed", amountXof: 12500, currency: "XOF", providerReference: "pay_1" }), true);
  assert.equal(isProviderPaymentConfirmed({ signatureVerified: true, providerStatus: "completed", amountXof: 100, currency: "EUR", providerReference: "pay_1" }), false);
  assert.equal(isProviderPaymentConfirmed({ signatureVerified: true, providerStatus: "completed", amountXof: 0, currency: "XOF", providerReference: "pay_1" }), false);
  assert.equal(isProviderPaymentConfirmed({ signatureVerified: true, providerStatus: "completed", amountXof: 12500, currency: "XOF", providerReference: "   " }), false);
});

test("le paiement doit correspondre au montant, à la devise et à la référence attendus", () => {
  const event = {
    providerStatus: "completed",
    providerReference: "checkout_abc",
    amountXof: 12500,
    currency: "XOF",
  };
  const expected = {
    event,
    signatureVerified: true,
    expectedAmountXof: 12500,
    expectedCurrency: "XOF",
    expectedReference: "checkout_abc",
  };
  assert.equal(matchesExpectedCheckout(expected), true);
  assert.equal(matchesExpectedCheckout({ ...expected, expectedAmountXof: 15000 }), false);
  assert.equal(matchesExpectedCheckout({ ...expected, expectedAmountXof: Number.MAX_SAFE_INTEGER + 1 }), false);
  assert.equal(matchesExpectedCheckout({ ...expected, expectedReference: "checkout_other" }), false);
  assert.equal(matchesExpectedCheckout({ ...expected, expectedReference: "   " }), false);
  assert.equal(matchesExpectedCheckout({ ...expected, event: { ...event, currency: "EUR" } }), false);
  assert.equal(matchesExpectedCheckout({ ...expected, signatureVerified: false }), false);
  assert.equal(matchesExpectedCheckout({ ...expected, event: { ...event, providerStatus: "pending" } }), false);
  assert.equal(matchesExpectedCheckout({ ...expected, event: { ...event, amountXof: "12500" } }), false);
});
