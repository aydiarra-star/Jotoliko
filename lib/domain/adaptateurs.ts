// Adaptateurs entre le vocabulaire du domaine et celui du module de suivi.
//
// lib/tracking.ts et components/tracking/ sont la première brique du produit et
// restent inchangés. Ils utilisent une nomenclature historique (« A_ASSIGNER »)
// là où le domaine utilise la nomenclature retenue pour le reste de
// l'application (« A_AFFECTER »). Cet adaptateur évite de maintenir deux
// vocabulaires en parallèle sans toucher au code existant.

import type { DeliveryStatus, Point } from "../tracking";
import type { PositionGps, StatutLivraison } from "./types";

const VERS_TRACKING: Record<StatutLivraison, DeliveryStatus> = {
  A_AFFECTER: "A_ASSIGNER",
  AFFECTEE: "AFFECTEE",
  EN_ROUTE: "EN_ROUTE",
  ARRIVE: "ARRIVE",
  LIVREE: "LIVREE",
  ECHEC: "ECHEC",
  ANNULEE: "ANNULEE",
};

export function versStatutTracking(statut: StatutLivraison): DeliveryStatus {
  return VERS_TRACKING[statut];
}

/** Convertit un historique de positions en points exploitables par lib/tracking.ts. */
export function positionsEnPoints(positions: PositionGps[]): Point[] {
  return positions.map((p) => ({ lat: p.lat, lng: p.lng, recordedAt: p.recordedAt }));
}
