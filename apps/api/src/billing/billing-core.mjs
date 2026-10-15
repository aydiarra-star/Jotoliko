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
export function hasPaidAccess({ status, gracePeriodEndsAt, now = new Date() }) {
  if (status === "ACTIVE") return true;
  if (status !== "GRACE_PERIOD" || !gracePeriodEndsAt) return false;
  const deadline = new Date(gracePeriodEndsAt);
  if (Number.isNaN(deadline.getTime())) return false;
  return now.getTime() <= deadline.getTime();
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
