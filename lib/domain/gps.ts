// Ingestion des positions GPS.
//
// Le téléphone du livreur produit des positions et les envoie quand il le peut.
// Deux propriétés doivent être garanties :
//
//   1. IDEMPOTENCE — une position reçue deux fois ne crée pas deux points.
//      C'est indispensable au Sénégal, où le réseau tombe et où le téléphone
//      rejoue sa file d'attente.
//   2. TRAÇABILITÉ — on distingue l'instant de la mesure (recordedAt, horloge
//      du téléphone) de l'instant de réception (syncedAt, horloge serveur).
//      Sans cette distinction, une position vieille de vingt minutes arrivée
//      maintenant serait prise pour une position fraîche.
//
// Ce module réutilise les règles de fraîcheur de lib/tracking.ts : il ne les
// réimplémente pas.

import { evaluerFraicheur, type Point } from "../tracking";
import type { PositionGps, Resultat } from "./types";
import { echec, ok } from "./types";

/** Tolérance de position jugée aberrante : au-delà, on refuse la donnée. */
export const ACCURACY_MAX_M = 500;

/** Une position datée de plus de 5 minutes dans le futur est une horloge folle. */
export const FUTUR_MAX_MS = 5 * 60_000;

export type PositionEntrante = {
  /** Clé d'idempotence, générée par le téléphone. */
  clientId: string;
  companyId: string;
  livraisonId: string;
  livreurId: string;
  lat: number;
  lng: number;
  accuracy?: number;
  recordedAt: number;
  provenance: PositionGps["provenance"];
};

export function validerPosition(
  p: PositionEntrante,
  maintenant: number,
): Resultat<PositionEntrante> {
  if (!p.clientId) return echec("Position sans clé d'idempotence : elle ne peut pas être rejouée sans risque.");
  if (!Number.isFinite(p.lat) || p.lat < -90 || p.lat > 90) {
    return echec(`Latitude invalide : ${p.lat}.`);
  }
  if (!Number.isFinite(p.lng) || p.lng < -180 || p.lng > 180) {
    return echec(`Longitude invalide : ${p.lng}.`);
  }
  if (!Number.isFinite(p.recordedAt)) return echec("Horodatage de mesure manquant.");

  // Une position datée dans le futur trahit une horloge de téléphone déréglée.
  // On la refuse plutôt que de la présenter comme très fraîche.
  if (p.recordedAt - maintenant > FUTUR_MAX_MS) {
    return echec(
      "Position horodatée dans le futur : l'horloge du téléphone est incohérente.",
    );
  }

  if (p.accuracy !== undefined && p.accuracy > ACCURACY_MAX_M) {
    return echec(
      `Précision trop faible (${Math.round(p.accuracy)} m) : la position n'est pas exploitable.`,
    );
  }

  return ok(p);
}

/**
 * Ajoute une position à l'historique.
 *
 * - Une position déjà connue (même clientId) est ignorée : la fonction retourne
 *   la liste inchangée, ce qui rend le rejeu sans effet.
 * - Une position invalide est refusée et n'entre pas dans l'historique.
 * - L'historique reste trié par instant de mesure.
 *
 * `syncedAt` doit valoir undefined tant que la position n'a pas été transmise au
 * serveur : une position produite hors ligne n'est pas synchronisée, et la
 * confondre avec une position reçue fausserait la lecture de la fraîcheur.
 * Ce paramètre est volontairement obligatoire : une valeur par défaut serait
 * appliquée même quand l'appelant passe explicitement `undefined`, ce qui
 * marquerait à tort une position hors ligne comme synchronisée.
 */
export function ingererPosition(
  historique: PositionGps[],
  entrante: PositionEntrante,
  maintenant: number,
  idGenere: string,
  syncedAt: number | undefined,
): Resultat<{ historique: PositionGps[]; ajoutee: boolean }> {
  const validation = validerPosition(entrante, maintenant);
  if (!validation.ok) return echec(validation.raison);

  const dejaConnue = historique.some(
    (p) => p.clientId === entrante.clientId || p.id === idGenere,
  );
  if (dejaConnue) {
    return ok({ historique, ajoutee: false });
  }

  const position: PositionGps = {
    id: idGenere,
    companyId: entrante.companyId,
    livraisonId: entrante.livraisonId,
    livreurId: entrante.livreurId,
    lat: entrante.lat,
    lng: entrante.lng,
    accuracy: entrante.accuracy,
    recordedAt: entrante.recordedAt,
    syncedAt,
    clientId: entrante.clientId,
    provenance: entrante.provenance,
  };

  const suivant = [...historique, position].sort((a, b) => a.recordedAt - b.recordedAt);
  return ok({ historique: suivant, ajoutee: true });
}

/** Historique d'une livraison, trié du plus ancien au plus récent. */
export function positionsDeLivraison(
  positions: PositionGps[],
  livraisonId: string,
): PositionGps[] {
  return positions
    .filter((p) => p.livraisonId === livraisonId)
    .sort((a, b) => a.recordedAt - b.recordedAt);
}

/** Convertit un historique en points exploitables par lib/tracking.ts. */
export function enPoints(positions: PositionGps[]): Point[] {
  return positions.map((p) => ({ lat: p.lat, lng: p.lng, recordedAt: p.recordedAt }));
}

/** Dernière position connue, quelle que soit son ancienneté. */
export function dernierePosition(positions: PositionGps[]): PositionGps | undefined {
  return positions.at(-1);
}

/**
 * Dernière position réellement fraîche, ou undefined.
 * Sert à ne jamais dessiner un marqueur à partir d'une position périmée.
 */
export function dernierePositionFraiche(
  positions: PositionGps[],
  maintenant: number,
): PositionGps | undefined {
  const derniere = dernierePosition(positions);
  if (!derniere) return undefined;
  return evaluerFraicheur(derniere, maintenant) === "FRAICHE" ? derniere : undefined;
}
