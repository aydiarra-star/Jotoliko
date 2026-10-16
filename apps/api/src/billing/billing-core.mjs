/**
 * Domaine de facturation Jotoliko — fonctions pures, sans fournisseur ni accès DB.
 *
 * Ce module est volontairement indépendant : aucun paiement n'est simulé comme
 * confirmé et aucun compte n'est activé ici. L'API doit appeler ces règles après
 * validation serveur et persistance transactionnelle.
 */

export const MAX_DRIVER_SEATS = 500;

export function parseSeatCount(value) {
  const seats = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(seats) || seats < 1 || seats > MAX_DRIVER_SEATS) {
    throw new RangeError(`Le nombre de places doit être un entier entre 1 et ${MAX_DRIVER_SEATS}.`);
  }
  return seats;
}

export function calculateMonthlyAmountXof(seatCount, unitPriceXof) {
  const seats = parseSeatCount(seatCount);
  const price = typeof unitPriceXof === "number" ? unitPriceXof : Number(unitPriceXof);
  if (!Number.isSafeInteger(price) || price < 1) {
    throw new RangeError("Le tarif mensuel par livreur doit être un entier positif en FCFA.");
  }
  const total = seats * price;
  if (!Number.isSafeInteger(total)) {
    throw new RangeError("Le montant mensuel dépasse la limite prise en charge.");
  }
  return total;
}

/**
 * Lit un tarif depuis la configuration serveur. Ne jamais exposer cette valeur
 * comme source d'autorité côté navigateur. Pas de valeur par défaut volontaire.
 */
export function monthlyPriceFromEnvironment(env = process.env) {
  if (!env.JOTOLIKO_PRICE_PER_DRIVER_XOF) {
    throw new Error("JOTOLIKO_PRICE_PER_DRIVER_XOF doit être défini après validation du tarif commercial.");
  }
  const price = Number(env.JOTOLIKO_PRICE_PER_DRIVER_XOF);
  if (!Number.isSafeInteger(price) || price < 1) {
    throw new Error("JOTOLIKO_PRICE_PER_DRIVER_XOF doit être un entier positif en FCFA.");
  }
  return price;
}

/** Bloque côté serveur toute opération qui dépasserait la capacité payée. */
export function assertDriverCapacity({ activeDriverCount, requestedActiveCount, paidSeatLimit }) {
  for (const [name, value] of Object.entries({ activeDriverCount, requestedActiveCount, paidSeatLimit })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} doit être un entier positif ou nul.`);
    }
  }
  if (activeDriverCount > paidSeatLimit) {
    throw new Error("La société dépasse déjà sa capacité souscrite ; corriger la capacité avant toute nouvelle activation.");
  }
  if (requestedActiveCount > paidSeatLimit) {
    throw new Error(`Capacité dépassée : ${paidSeatLimit} place(s) livreur active(s) autorisée(s).`);
  }
  return true;
}

/**
 * Politique conservatrice : seuls ACTIVE et GRACE_PERIOD avant la fin de grâce
 * autorisent les fonctions payantes. Le calcul de l'état et les dates doivent
 * venir de la base serveur, jamais du client.
 */
export function hasPaidAccess({ status, currentPeriodEnd, gracePeriodEndsAt, now = new Date() }) {
  // ACTIVE ne suffit pas : la période payée doit encore être valide.
  if (status === "ACTIVE") {
    if (!currentPeriodEnd) return false;
    const periodEnd = new Date(currentPeriodEnd);
    return !Number.isNaN(periodEnd.getTime()) && periodEnd.getTime() > now.getTime();
  }

  // La grâce est elle aussi strictement bornée par sa date de fin.
  if (status !== "GRACE_PERIOD" || !gracePeriodEndsAt) return false;
  const deadline = new Date(gracePeriodEndsAt);
  if (Number.isNaN(deadline.getTime())) return false;
  return deadline.getTime() > now.getTime();
}

/** Un webhook ne peut être traité comme payé que si le prestataire l'a confirmé. */
export function isProviderPaymentConfirmed(event) {
  return Boolean(
    event &&
    event.signatureVerified === true &&
    event.providerStatus === "completed" &&
    typeof event.providerReference === "string" &&
    event.providerReference.trim().length > 0 &&
    Number.isSafeInteger(event.amountXof) &&
    event.amountXof > 0 &&
    event.currency === "XOF"
  );
}


/**
 * Rapproche un événement confirmé avec le checkout attendu côté serveur.
 * `signatureVerified` doit provenir du vérificateur réel du fournisseur, jamais
 * d'un champ fourni par le navigateur. Cette fonction ne vérifie pas elle-même
 * la signature cryptographique ni l'état distant du paiement.
 */
export function matchesExpectedCheckout({
  event,
  signatureVerified = false,
  expectedAmountXof,
  expectedCurrency = "XOF",
  expectedReference,
}) {
  if (!event || signatureVerified !== true) return false;
  if (event.providerStatus !== "completed") return false;
  if (typeof expectedReference !== "string" || expectedReference.trim() === "") return false;
  if (typeof event.providerReference !== "string" || event.providerReference.trim() !== expectedReference) return false;
  if (!Number.isSafeInteger(expectedAmountXof) || expectedAmountXof <= 0) return false;
  if (!Number.isSafeInteger(event.amountXof) || event.amountXof !== expectedAmountXof) return false;
  if (event.currency !== expectedCurrency || expectedCurrency !== "XOF") return false;
  return true;
}


/**
 * Construit une clé stable par abonnement et période facturée.
 * La période exacte est utilisée (pas seulement le mois civil), car les
 * abonnements peuvent avoir commencé n'importe quel jour du mois.
 */
export function buildRenewalIdempotencyKey({ subscriptionId, periodStart, periodEnd }) {
  if (typeof subscriptionId !== "string" || subscriptionId.trim() === "") {
    throw new TypeError("subscriptionId doit être une chaîne non vide.");
  }
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new RangeError("La période de renouvellement doit contenir deux dates valides et croissantes.");
  }
  return `subscription:${subscriptionId.trim()}:renewal:${start.toISOString()}:${end.toISOString()}`;
}

/**
 * Politique de décision pure pour le renouvellement.
 * Le mode automatique est refusé par défaut et exige des confirmations explicites
 * de capacité fournisseur, consentement client et idempotence fournisseur.
 * Une tentative au résultat inconnu doit être rapprochée, jamais relancée à l'aveugle.
 */
export function decideRenewalAction({
  status,
  cancelAtPeriodEnd = false,
  currentPeriodEnd,
  now = new Date(),
  attemptStatus = "NONE",
  providerRecurrenceConfirmed = false,
  customerConsentRecorded = false,
  providerIdempotencySupported = false,
}) {
  if (cancelAtPeriodEnd || status === "CANCELLED" || status === "EXPIRED" || status === "SUSPENDED") {
    return "SKIP";
  }
  const end = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
  const clock = new Date(now);
  if (!end || Number.isNaN(end.getTime()) || Number.isNaN(clock.getTime())) return "MANUAL_REVIEW";
  if (end > clock) return "NOT_DUE";
  if (["PENDING", "PROCESSING", "UNKNOWN"].includes(attemptStatus)) return "RECONCILE_EXISTING_ATTEMPT";
  if (attemptStatus === "CONFIRMED") return "PERIOD_ALREADY_PAID";
  if (status !== "ACTIVE" && status !== "PAST_DUE" && status !== "GRACE_PERIOD") return "MANUAL_REVIEW";
  if (
    providerRecurrenceConfirmed === true &&
    customerConsentRecorded === true &&
    providerIdempotencySupported === true
  ) {
    return "ATTEMPT_RECURRING_CHARGE";
  }
  return "CREATE_HOSTED_CHECKOUT";
}
