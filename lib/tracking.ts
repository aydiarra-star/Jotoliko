// Logique de suivi de livraison.
//
// Règle centrale : le produit ne doit jamais inventer une position ni une ETA.
// Chaque fonction ci-dessous retourne explicitement un état « indisponible »
// plutôt qu'une valeur plausible mais fausse. Ces règles sont testées dans
// lib/tracking.test.ts.

export type DeliveryStatus =
  | "A_ASSIGNER"
  | "AFFECTEE"
  | "EN_ROUTE"
  | "ARRIVE"
  | "LIVREE"
  | "ECHEC"
  | "ANNULEE";

export type Point = {
  lat: number;
  lng: number;
  /** Horodatage de la mesure, en millisecondes epoch. */
  recordedAt: number;
};

/** Coordonnées seules : suffisent à tout calcul géométrique. */
export type Coordonnees = Pick<Point, "lat" | "lng">;

export type PositionFreshness =
  | "FRAICHE"
  | "ANCIENNE"
  | "INDISPONIBLE"
  | "AUCUNE_DONNEE";

/** Au-delà de ce délai, une position n'est plus considérée comme actuelle. */
export const FRAICHEUR_ACTUELLE_MS = 60_000;

/** Au-delà de ce délai, la position est trop vieille pour être affichée comme telle. */
export const FRAICHEUR_MAX_MS = 15 * 60_000;

/**
 * Qualifie une position sans jamais la présenter comme actuelle si elle ne l'est pas.
 * « AUCUNE_DONNEE » signifie qu'aucune position n'a jamais été reçue.
 */
export function evaluerFraicheur(
  position: Point | null | undefined,
  maintenant: number,
): PositionFreshness {
  if (!position) return "AUCUNE_DONNEE";
  const age = maintenant - position.recordedAt;
  if (age < 0) return "INDISPONIBLE"; // horloge incohérente : on refuse d'afficher
  if (age <= FRAICHEUR_ACTUELLE_MS) return "FRAICHE";
  if (age <= FRAICHEUR_MAX_MS) return "ANCIENNE";
  return "INDISPONIBLE";
}

/** Libellé affichable pour l'âge d'une position. Jamais « temps réel » sans donnée fraîche. */
export function libelleFraicheur(
  position: Point | null | undefined,
  maintenant: number,
): string {
  if (!position) return "Position indisponible";

  const etat = evaluerFraicheur(position, maintenant);
  switch (etat) {
    case "AUCUNE_DONNEE":
      return "Aucune position reçue";
    case "INDISPONIBLE":
      // Deux causes possibles : position trop ancienne, ou horodatage
      // incohérent. Dans les deux cas, l'âge n'est pas une information
      // présentable telle quelle.
      return maintenant - position.recordedAt < 0
        ? "Position indisponible · horodatage incohérent"
        : `Position indisponible · dernière position il y a ${formaterAge(maintenant - position.recordedAt)}`;
    case "ANCIENNE":
      return `Dernière position connue : il y a ${formaterAge(maintenant - position.recordedAt)}`;
    case "FRAICHE":
      return `Dernière position : il y a ${formaterAge(maintenant - position.recordedAt)}`;
  }
}

export function formaterAge(ms: number): string {
  const secondes = Math.max(0, Math.round(ms / 1000));
  if (secondes < 60) return `${secondes} s`;
  const minutes = Math.round(secondes / 60);
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.round(minutes / 60);
  return `${heures} h`;
}

// ---------------------------------------------------------------------------
// Distance
// ---------------------------------------------------------------------------

const RAYON_TERRE_KM = 6371;

export function distanceKm(a: Coordonnees, b: Coordonnees): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * RAYON_TERRE_KM * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// ---------------------------------------------------------------------------
// ETA
// ---------------------------------------------------------------------------

export type EtaResult =
  | { disponible: true; minutes: number; arrivee: number }
  | { disponible: false; raison: EtaIndisponibleRaison };

export type EtaIndisponibleRaison =
  | "PAS_DE_POSITION"
  | "POSITION_TROP_ANCIENNE"
  | "PAS_DE_VITESSE_MESUREE"
  | "DISTANCE_NULLE"
  | "STATUT_NON_SUIVI";

/**
 * Calcule une ETA uniquement à partir de données réellement mesurées :
 * la position actuelle du livreur et sa vitesse observée sur des positions
 * successives. Sans historique de positions, il n'y a pas d'ETA — jamais
 * d'estimation à partir d'une vitesse supposée.
 */
export function calculerEta(params: {
  positions: Point[];
  destination: Point;
  maintenant: number;
  statut: DeliveryStatus;
}): EtaResult {
  const { positions, destination, maintenant, statut } = params;

  if (statut !== "EN_ROUTE") {
    return { disponible: false, raison: "STATUT_NON_SUIVI" };
  }

  const actuelle = positions.at(-1);
  if (!actuelle) {
    return { disponible: false, raison: "PAS_DE_POSITION" };
  }

  if (evaluerFraicheur(actuelle, maintenant) !== "FRAICHE") {
    return { disponible: false, raison: "POSITION_TROP_ANCIENNE" };
  }

  const vitesseKmh = vitesseMesuree(positions);

  const restantKm = distanceKm(actuelle, destination);
  if (restantKm < 0.05) {
    return { disponible: false, raison: "DISTANCE_NULLE" };
  }

  if (vitesseKmh === null) {
    return { disponible: false, raison: "PAS_DE_VITESSE_MESUREE" };
  }

  const minutes = (restantKm / vitesseKmh) * 60;
  return {
    disponible: true,
    minutes: Math.round(minutes),
    arrivee: maintenant + minutes * 60_000,
  };
}

/**
 * Vitesse moyenne observée entre la première et la dernière position.
 * Retourne null si le déplacement est nul ou si le temps écoulé est négligeable,
 * car aucune vitesse réelle n'est alors mesurable.
 */
export function vitesseMesuree(positions: Point[]): number | null {
  if (positions.length < 2) return null;
  const premier = positions[0];
  const dernier = positions.at(-1)!;
  const heures = (dernier.recordedAt - premier.recordedAt) / 3_600_000;
  if (heures <= 0.001) return null;
  const km = distanceKm(premier, dernier);
  if (km < 0.05) return null;
  const kmh = km / heures;
  // Au-delà, la mesure est aberrante (GPS erratique) : on préfère ne rien dire.
  if (kmh > 120) return null;
  return kmh;
}

export function libelleEta(eta: EtaResult, maintenant: number): string {
  if (!eta.disponible) return "Heure d'arrivée indisponible";
  const heure = new Date(eta.arrivee).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Arrivée estimée : ${heure} · dans environ ${eta.minutes} min`;
}

// ---------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------

/**
 * Part du trajet déjà parcourue, entre 0 et 1, calculée en comparant la distance
 * restante à la distance totale. Retourne null si le trajet est dégénéré.
 */
export function progression(params: {
  depart: Point;
  actuelle: Point;
  destination: Point;
}): number | null {
  const total = distanceKm(params.depart, params.destination);
  if (total < 0.05) return null;
  const restant = distanceKm(params.actuelle, params.destination);
  return Math.min(1, Math.max(0, 1 - restant / total));
}

// ---------------------------------------------------------------------------
// Statuts
// ---------------------------------------------------------------------------

export type AffichageStatut = {
  libelle: string;
  /** Le suivi GPS a-t-il un sens à ce stade ? */
  suiviGps: boolean;
  couleur: "neutre" | "info" | "succes" | "echec";
};

export const STATUTS: Record<DeliveryStatus, AffichageStatut> = {
  A_ASSIGNER: { libelle: "À affecter", suiviGps: false, couleur: "neutre" },
  AFFECTEE: { libelle: "Affectée", suiviGps: false, couleur: "info" },
  EN_ROUTE: { libelle: "En route", suiviGps: true, couleur: "info" },
  ARRIVE: { libelle: "Arrivé", suiviGps: true, couleur: "info" },
  LIVREE: { libelle: "Livrée", suiviGps: false, couleur: "succes" },
  ECHEC: { libelle: "Échec", suiviGps: false, couleur: "echec" },
  ANNULEE: { libelle: "Annulée", suiviGps: false, couleur: "echec" },
};

export function messageStatut(statut: DeliveryStatus): string {
  switch (statut) {
    case "A_ASSIGNER":
      return "Pas encore de suivi GPS : aucun livreur n'est affecté.";
    case "AFFECTEE":
      return "Le livreur est identifié. Le suivi démarre à son départ.";
    case "EN_ROUTE":
      return "Le livreur est en route vers le client.";
    case "ARRIVE":
      return "Le livreur est arrivé chez le client.";
    case "LIVREE":
      return "Livraison effectuée.";
    case "ECHEC":
      return "La livraison n'a pas pu être effectuée.";
    case "ANNULEE":
      return "La livraison a été annulée.";
  }
}

// ---------------------------------------------------------------------------
// Statuts de paiement
// ---------------------------------------------------------------------------

export type StatutPaiement =
  | "A_ENCAISSER"
  | "PARTIEL"
  | "ENCAISSE"
  | "NON_ENCAISSE"
  | "REMBOURSE";

export function statutPaiement(montantDu: number, montantEncaisse: number): StatutPaiement {
  if (montantEncaisse <= 0) return "A_ENCAISSER";
  if (montantEncaisse < montantDu) return "PARTIEL";
  if (montantEncaisse === montantDu) return "ENCAISSE";
  return "ENCAISSE";
}

export function libelleStatutPaiement(statut: StatutPaiement): string {
  switch (statut) {
    case "A_ENCAISSER":
      return "À encaisser";
    case "PARTIEL":
      return "Partiellement encaissé";
    case "ENCAISSE":
      return "Encaissé";
    case "NON_ENCAISSE":
      return "Non encaissé";
    case "REMBOURSE":
      return "Remboursé";
  }
}

// ---------------------------------------------------------------------------
// Caisse
// ---------------------------------------------------------------------------

export type LigneCaisse = {
  livreurId: string;
  commandesConfiees: number;
  commandesLivrees: number;
  montantAttendu: number;
  montantEncaisse: number;
  montantARemettre: number;
  montantRemis: number;
  ecart: number;
};

export function calculerLigneCaisse(params: {
  livreurId: string;
  commandesConfiees: number;
  commandesLivrees: number;
  montantAttendu: number;
  montantEncaisse: number;
  montantRemis: number;
}): LigneCaisse {
  const montantARemettre = params.montantEncaisse;
  return {
    ...params,
    montantARemettre,
    ecart: params.montantRemis - montantARemettre,
  };
}

export function formaterFcfa(montant: number): string {
  return `${montant.toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")} FCFA`;
}
