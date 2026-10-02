// Données de démonstration.
//
// IMPORTANT — ce fichier ne contient que des données fictives, utilisées pour
// présenter l'interface. Elles ne proviennent d'aucun client réel, d'aucune
// entreprise réelle et d'aucune position GPS réelle.
//
// En production, les positions viennent du téléphone du livreur et rien d'autre.
// Voir lib/tracking.ts pour les règles qui empêchent d'afficher une position ou
// une ETA qui ne serait pas réellement mesurée.
//
// Les positions sont stockées en « minutes écoulées » plutôt qu'en horodatage
// absolu : la démonstration reste cohérente quel que soit le moment où la page
// est ouverte, et le rendu statique ne produit aucun décalage d'hydratation.

import type { Point } from "./tracking";

export const EST_DEMO = true;

export type EvenementDemo = {
  heure: string;
  libelle: string;
  origine: "bureau" | "terrain";
};

export type ReleveGps = { lat: number; lng: number; ageMin: number };

export type LivraisonDemo = {
  reference: string;
  client: { nom: string; telephone: string; adresse: string; zone: string };
  livreur: { nom: string; telephone: string; matricule: string };
  /** Trace GPS réellement relevée (points successifs), pas une route calculée. */
  trace: ReleveGps[];
  destination: ReleveGps;
  depart: ReleveGps;
  statut: "A_ASSIGNER" | "AFFECTEE" | "EN_ROUTE" | "ARRIVE" | "LIVREE" | "ECHEC" | "ANNULEE";
  montantDu: number;
  montantEncaisse: number;
  modePaiement: string;
  evenements: EvenementDemo[];
};

/** Matérialise un relevé en point horodaté, à partir d'un instant de référence. */
export function enPoint(r: ReleveGps, maintenant: number): Point {
  return { lat: r.lat, lng: r.lng, recordedAt: maintenant - r.ageMin * 60_000 };
}

export function enPoints(releves: ReleveGps[], maintenant: number): Point[] {
  return releves.map((r) => enPoint(r, maintenant));
}

/**
 * Trace enregistrée : Sacré-Cœur vers Liberté 6, Dakar.
 * Points successifs du scénario de démonstration — le tracé suit ces points.
 */
const TRACE_EN_ROUTE: ReleveGps[] = [
  { lat: 14.7165, lng: -17.4637, ageMin: 35 },
  { lat: 14.7178, lng: -17.4652, ageMin: 28 },
  { lat: 14.7192, lng: -17.4668, ageMin: 21 },
  { lat: 14.7203, lng: -17.4685, ageMin: 14 },
  { lat: 14.7214, lng: -17.4701, ageMin: 9 },
  { lat: 14.7221, lng: -17.4718, ageMin: 4 },
  { lat: 14.7225, lng: -17.4732, ageMin: 0.13 },
];

export const LIVRAISON_DEMO: LivraisonDemo = {
  reference: "1042",
  client: {
    nom: "Aïssatou Ndiaye",
    telephone: "+221 77 123 45 67",
    adresse: "Liberté 6, immeuble bleu après la pharmacie",
    zone: "Dakar — Liberté 6",
  },
  livreur: {
    nom: "Moussa Diallo",
    telephone: "+221 78 987 65 43",
    matricule: "L-12",
  },
  depart: { lat: 14.7165, lng: -17.4637, ageMin: 35 },
  trace: TRACE_EN_ROUTE,
  destination: { lat: 14.7238, lng: -17.4756, ageMin: 35 },
  statut: "EN_ROUTE",
  montantDu: 12_500,
  montantEncaisse: 0,
  modePaiement: "Espèces à la livraison",
  evenements: [
    { heure: "09:42", libelle: "Livraison affectée à Moussa Diallo", origine: "bureau" },
    { heure: "09:48", libelle: "Livreur en route", origine: "terrain" },
    { heure: "10:17", libelle: "Position actualisée", origine: "terrain" },
  ],
};

/** Scénario terminé : montre la preuve et l'encaissement. */
export const LIVRAISON_DEMO_TERMINEE: LivraisonDemo = {
  ...LIVRAISON_DEMO,
  reference: "1039",
  client: {
    nom: "Boutique Awa",
    telephone: "+221 76 222 33 44",
    adresse: "Plateau, rue Carnot, face à la banque",
    zone: "Dakar — Plateau",
  },
  statut: "LIVREE",
  montantDu: 8_000,
  montantEncaisse: 8_000,
  modePaiement: "Wave",
  evenements: [
    { heure: "09:12", libelle: "Livraison affectée à Moussa Diallo", origine: "bureau" },
    { heure: "09:20", libelle: "Livreur en route", origine: "terrain" },
    { heure: "09:51", libelle: "Arrivé chez le client", origine: "terrain" },
    { heure: "09:53", libelle: "Livraison effectuée", origine: "terrain" },
    { heure: "09:54", libelle: "Paiement enregistré — 8 000 FCFA (Wave)", origine: "terrain" },
    { heure: "09:55", libelle: "Preuve enregistrée — photo et réceptionnaire", origine: "terrain" },
  ],
};

/** Scénario sans position : montre le cas « aucune donnée disponible ». */
export const LIVRAISON_DEMO_SANS_POSITION: LivraisonDemo = {
  ...LIVRAISON_DEMO,
  reference: "1041",
  client: {
    nom: "Pharmacie Mermoz",
    telephone: "+221 70 555 11 22",
    adresse: "Mermoz, avenue Cheikh Anta Diop",
    zone: "Dakar — Mermoz",
  },
  statut: "AFFECTEE",
  montantDu: 15_000,
  montantEncaisse: 0,
  trace: [],
  evenements: [
    { heure: "10:05", libelle: "Livraison affectée à Moussa Diallo", origine: "bureau" },
  ],
};

export const LIVRAISONS_DEMO: LivraisonDemo[] = [
  LIVRAISON_DEMO,
  LIVRAISON_DEMO_TERMINEE,
  LIVRAISON_DEMO_SANS_POSITION,
];

export function trouverLivraisonDemo(reference: string): LivraisonDemo | undefined {
  return LIVRAISONS_DEMO.find((l) => l.reference === reference);
}

/**
 * Chiffres du tableau de bord de démonstration.
 * Fictifs. En production, ces valeurs sont calculées depuis la base.
 */
export const TABLEAU_BORD_DEMO = {
  commandes: 184,
  livrees: 112,
  enCours: 31,
  echecs: 4,
  aAffecter: 37,
  livreursActifs: 9,
  montantAttendu: 1_840_000,
  montantEncaisse: 1_240_000,
  aRemettre: 412_000,
  ecart: -2_000,
};
