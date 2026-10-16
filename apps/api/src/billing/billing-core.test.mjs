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

test("accès payant exige une période ACTIVE non expirée ou une grâce non expirée", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  assert.equal(hasPaidAccess({ status: "ACTIVE", currentPeriodEnd: "2026-11-15T12:00:00Z", now }), true);
  assert.equal(hasPaidAccess({ status: "ACTIVE", currentPeriodEnd: "2026-10-15T12:00:00Z", now }), false);
  assert.equal(hasPaidAccess({ status: "ACTIVE", currentPeriodEnd: "date-invalide", now }), false);
  assert.equal(hasPaidAccess({ status: "ACTIVE", now }), false);
  assert.equal(hasPaidAccess({ status: "PAST_DUE", currentPeriodEnd: "2026-11-15T12:00:00Z", now }), false);
  assert.equal(hasPaidAccess({ status: "GRACE_PERIOD", gracePeriodEndsAt: "2026-10-16T12:00:00Z", now }), true);
  assert.equal(hasPaidAccess({ status: "GRACE_PERIOD", gracePeriodEndsAt: "2026-10-15T12:00:00Z", now }), false);
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

 
test("clé d'idempotence du renouvellement stable et distincte par période", async () => {
  const { buildRenewalIdempotencyKey } = await import("./billing-core.mjs");
  const first = buildRenewalIdempotencyKey({
    subscriptionId: "sub_123",
    periodStart: "2026-10-01T00:00:00.000Z",
    periodEnd: "2026-11-01T00:00:00.000Z",
  });
  assert.equal(first, buildRenewalIdempotencyKey({
    subscriptionId: "sub_123",
    periodStart: "2026-10-01T00:00:00.000Z",
    periodEnd: "2026-11-01T00:00:00.000Z",
  }));
  assert.notEqual(first, buildRenewalIdempotencyKey({
    subscriptionId: "sub_123",
    periodStart: "2026-11-01T00:00:00.000Z",
    periodEnd: "2026-12-01T00:00:00.000Z",
  }));
  assert.throws(() => buildRenewalIdempotencyKey({ subscriptionId: " ", periodStart: "2026-10-01", periodEnd: "2026-11-01" }), /subscriptionId/);
  assert.throws(() => buildRenewalIdempotencyKey({ subscriptionId: "sub_123", periodStart: "invalid", periodEnd: "2026-11-01" }), /période/);
  assert.throws(() => buildRenewalIdempotencyKey({ subscriptionId: "sub_123", periodStart: "2026-11-01", periodEnd: "2026-10-01" }), /période/);
});

test("renouvellement refuse les débits automatiques sans preuve complète", async () => {
  const { decideRenewalAction } = await import("./billing-core.mjs");
  const due = {
    status: "ACTIVE",
    currentPeriodEnd: "2026-10-01T00:00:00.000Z",
    now: "2026-10-16T00:00:00.000Z",
  };
  assert.equal(decideRenewalAction(due), "CREATE_HOSTED_CHECKOUT");
  assert.equal(decideRenewalAction({ ...due, providerRecurrenceConfirmed: true }), "CREATE_HOSTED_CHECKOUT");
  assert.equal(decideRenewalAction({ ...due, providerRecurrenceConfirmed: true, customerConsentRecorded: true }), "CREATE_HOSTED_CHECKOUT");
  assert.equal(decideRenewalAction({ ...due, providerRecurrenceConfirmed: true, customerConsentRecorded: true, providerIdempotencySupported: true }), "ATTEMPT_RECURRING_CHARGE");
  assert.equal(decideRenewalAction({ ...due, attemptStatus: "UNKNOWN", providerRecurrenceConfirmed: true, customerConsentRecorded: true, providerIdempotencySupported: true }), "RECONCILE_EXISTING_ATTEMPT");
  assert.equal(decideRenewalAction({ ...due, attemptStatus: "CONFIRMED" }), "PERIOD_ALREADY_PAID");
  assert.equal(decideRenewalAction({ ...due, currentPeriodEnd: "2026-11-01T00:00:00.000Z" }), "NOT_DUE");
  assert.equal(decideRenewalAction({ ...due, cancelAtPeriodEnd: true }), "SKIP");
  assert.equal(decideRenewalAction({ ...due, status: "CANCELLED" }), "SKIP");
  assert.equal(decideRenewalAction({ ...due, status: "PENDING_PAYMENT" }), "MANUAL_REVIEW");
  assert.equal(decideRenewalAction({ ...due, currentPeriodEnd: null }), "MANUAL_REVIEW");
});
