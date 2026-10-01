// Agrégations pour le tableau de bord et les rapports.
//
// Aucun pourcentage de performance n'est calculé ici. Un taux de réussite n'a de
// sens qu'au-delà d'un volume significatif, et un « +32 % d'efficacité » n'a
// aucun sens du tout sans mesure antérieure comparable. On expose donc des
// COMPTES et des MONTANTS, jamais des gains.

import type {
  Commande,
  JustificationEcart,
  Livraison,
  Paiement,
  Remise,
  StatutCommande,
  StatutLivraison,
} from "./types";
import { calculerCaisseLivreur, type LigneCaisseLivreur } from "./paiements";

// ---------------------------------------------------------------------------
// Bornes de journée
// ---------------------------------------------------------------------------

/**
 * Bornes d'une journée civile, en heure locale du serveur.
 * Les livraisons sont comptées sur leur journée de création.
 */
export function bornesJournee(reference: number): { debut: number; fin: number } {
  const d = new Date(reference);
  const debut = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const fin = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  return { debut, fin };
}

export function dansJournee(horodatage: number, reference: number): boolean {
  const { debut, fin } = bornesJournee(reference);
  return horodatage >= debut && horodatage < fin;
}

// ---------------------------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------------------------

export type CompteursCommandes = Record<StatutCommande, number>;

export type CompteursLivraisons = Record<StatutLivraison, number>;

export type TableauBord = {
  journee: { debut: number; fin: number };
  commandes: {
    total: number;
    parStatut: CompteursCommandes;
    /** Commandes qui attendent une action du bureau. */
    aTraiter: number;
  };
  livraisons: {
    total: number;
    parStatut: CompteursLivraisons;
    enCours: number;
    terminees: number;
    echouees: number;
  };
  encaissements: {
    montantAttendu: number;
    montantEncaisse: number;
    resteAEncaisser: number;
    montantARemettre: number;
    montantRemis: number;
    ecart: number;
  };
  livreurs: {
    total: number;
    actifs: number;
    enTournee: number;
    disponibles: number;
  };
};

const STATUTS_COMMANDE_VIDES: CompteursCommandes = {
  A_PREPARER: 0, PRETE: 0, A_AFFECTER: 0, AFFECTEE: 0,
  EN_LIVRAISON: 0, LIVREE: 0, ECHEC: 0, ANNULEE: 0,
};

const STATUTS_LIVRAISON_VIDES: CompteursLivraisons = {
  A_AFFECTER: 0, AFFECTEE: 0, EN_ROUTE: 0, ARRIVE: 0,
  LIVREE: 0, ECHEC: 0, ANNULEE: 0,
};

export function compterParStatutCommande(commandes: Commande[]): CompteursCommandes {
  const compteurs = { ...STATUTS_COMMANDE_VIDES };
  for (const c of commandes) compteurs[c.statut] += 1;
  return compteurs;
}

export function compterParStatutLivraison(livraisons: Livraison[]): CompteursLivraisons {
  const compteurs = { ...STATUTS_LIVRAISON_VIDES };
  for (const l of livraisons) compteurs[l.statut] += 1;
  return compteurs;
}

export function construireTableauBord(params: {
  maintenant: number;
  commandes: Commande[];
  livraisons: Livraison[];
  paiements: Paiement[];
  remises: Remise[];
  livreurs: { id: string; actif: boolean }[];
}): TableauBord {
  const { maintenant } = params;

  const commandesDuJour = params.commandes.filter((c) =>
    dansJournee(c.dateCommande, maintenant),
  );
  const livraisonsDuJour = params.livraisons.filter((l) =>
    dansJournee(l.createdAt, maintenant),
  );

  const parStatutCommande = compterParStatutCommande(commandesDuJour);
  const parStatutLivraison = compterParStatutLivraison(livraisonsDuJour);

  const idsLivraisonsJour = new Set(livraisonsDuJour.map((l) => l.id));
  const paiementsJour = params.paiements.filter((p) => idsLivraisonsJour.has(p.livraisonId));
  const remisesJour = params.remises.filter((r) =>
    dansJournee(r.recordedAt, maintenant),
  );

  const montantEncaisse = paiementsJour.reduce((t, p) => t + p.montant, 0);
  const montantRemis = remisesJour.reduce((t, r) => t + r.montant, 0);

  // Reste à encaisser : uniquement sur des livraisons encore ouvertes.
  const resteAEncaisser = livraisonsDuJour
    .filter((l) => l.statut !== "ECHEC" && l.statut !== "ANNULEE")
    .reduce((total, l) => {
      const encaisse = paiementsJour
        .filter((p) => p.livraisonId === l.id)
        .reduce((t, p) => t + p.montant, 0);
      return total + Math.max(0, l.montantAttendu - encaisse);
    }, 0);

  const enTournee = livraisonsDuJour.filter(
    (l) => l.statut === "EN_ROUTE" || l.statut === "ARRIVE",
  ).length;

  const livreursActifs = params.livreurs.filter((l) => l.actif);
  const livreursEnTournee = new Set(
    livraisonsDuJour
      .filter((l) => l.statut === "EN_ROUTE" || l.statut === "ARRIVE")
      .map((l) => l.livreurId)
      .filter((id): id is string => Boolean(id)),
  );

  return {
    journee: bornesJournee(maintenant),
    commandes: {
      total: commandesDuJour.length,
      parStatut: parStatutCommande,
      aTraiter:
        parStatutCommande.A_PREPARER +
        parStatutCommande.PRETE +
        parStatutCommande.A_AFFECTER,
    },
    livraisons: {
      total: livraisonsDuJour.length,
      parStatut: parStatutLivraison,
      enCours: enTournee,
      terminees: parStatutLivraison.LIVREE,
      echouees: parStatutLivraison.ECHEC,
    },
    encaissements: {
      montantAttendu: livraisonsDuJour.reduce((t, l) => t + l.montantAttendu, 0),
      montantEncaisse,
      resteAEncaisser,
      montantARemettre: montantEncaisse,
      montantRemis,
      ecart: montantRemis - montantEncaisse,
    },
    livreurs: {
      total: params.livreurs.length,
      actifs: livreursActifs.length,
      enTournee: livreursEnTournee.size,
      disponibles: Math.max(0, livreursActifs.length - livreursEnTournee.size),
    },
  };
}

// ---------------------------------------------------------------------------
// Rapport de caisse par livreur
// ---------------------------------------------------------------------------

export type RapportCaisse = {
  journee: { debut: number; fin: number };
  lignes: LigneCaisseLivreur[];
  totaux: {
    montantAttendu: number;
    montantEncaisse: number;
    montantRestantAEncaisser: number;
    montantARemettre: number;
    montantRemis: number;
    resteARemettre: number;
    ecart: number;
  };
  /** Écarts de la journée, séparés selon qu'ils sont expliqués ou non. */
  ecarts: {
    /** Nombre de livreurs dont la caisse n'est pas juste. */
    nombre: number;
    /** Écarts non encore expliqués : ceux qui réclament une action. */
    nonExpliques: LigneCaisseLivreur[];
    /** Écarts couverts par une explication écrite. */
    expliques: LigneCaisseLivreur[];
  };
};

export function construireRapportCaisse(params: {
  maintenant: number;
  livraisons: Livraison[];
  paiements: Paiement[];
  remises: Remise[];
  livreurIds: string[];
  justifications?: JustificationEcart[];
}): RapportCaisse {
  const livraisonsDuJour = params.livraisons.filter((l) =>
    dansJournee(l.createdAt, params.maintenant),
  );

  const { debut } = bornesJournee(params.maintenant);
  const justificationsDuJour = (params.justifications ?? []).filter(
    (j) => j.journee === debut,
  );

  const lignes = params.livreurIds.map((livreurId) =>
    calculerCaisseLivreur({
      livreurId,
      livraisons: livraisonsDuJour,
      paiements: params.paiements,
      remises: params.remises,
      justifications: justificationsDuJour,
    }),
  );

  const totaux = lignes.reduce(
    (t, l) => ({
      montantAttendu: t.montantAttendu + l.montantAttendu,
      montantEncaisse: t.montantEncaisse + l.montantEncaisse,
      montantRestantAEncaisser: t.montantRestantAEncaisser + l.montantRestantAEncaisser,
      montantARemettre: t.montantARemettre + l.montantARemettre,
      montantRemis: t.montantRemis + l.montantRemis,
      resteARemettre: t.resteARemettre + l.resteARemettre,
      ecart: t.ecart + l.ecart,
    }),
    {
      montantAttendu: 0,
      montantEncaisse: 0,
      montantRestantAEncaisser: 0,
      montantARemettre: 0,
      montantRemis: 0,
      resteARemettre: 0,
      ecart: 0,
    },
  );

  const enEcart = lignes.filter((l) => !l.ecartJuste);

  return {
    journee: bornesJournee(params.maintenant),
    lignes,
    totaux,
    ecarts: {
      nombre: enEcart.length,
      nonExpliques: enEcart.filter((l) => !l.ecartExplique),
      expliques: enEcart.filter((l) => l.ecartExplique),
    },
  };
}

// ---------------------------------------------------------------------------
// Clôture de journée
// ---------------------------------------------------------------------------

/**
 * Vue de clôture : de quoi arrêter la journée sans ouvrir un tableur.
 *
 * Elle répond dans l'ordre aux questions que se pose le responsable : qu'a-t-on
 * fait, qu'a-t-on dû encaisser, qu'a-t-on encaissé, qu'a-t-on remis, que
 * reste-t-il, et y a-t-il un écart qui ne s'explique pas tout seul.
 */
export type ClotureJournee = {
  journee: { debut: number; fin: number };
  commandes: { total: number; livrees: number; restantes: number };
  livraisons: { total: number; livrees: number; echouees: number; enCours: number };
  caisse: RapportCaisse["totaux"];
  /** Caisse détaillée par livreur, pour la clôture elle-même. */
  lignes: LigneCaisseLivreur[];
  /** Une clôture n'est régulière que si aucun écart n'attend d'explication. */
  prete: boolean;
  /** Nombre de livreurs dont l'écart reste à expliquer. */
  ecartsAExpliquer: number;
};

export function construireClotureJournee(params: {
  maintenant: number;
  commandes: Commande[];
  livraisons: Livraison[];
  paiements: Paiement[];
  remises: Remise[];
  livreurIds: string[];
  justifications?: JustificationEcart[];
}): ClotureJournee {
  const commandesDuJour = params.commandes.filter((c) =>
    dansJournee(c.dateCommande, params.maintenant),
  );
  const livraisonsDuJour = params.livraisons.filter((l) =>
    dansJournee(l.createdAt, params.maintenant),
  );
  const caisse = construireRapportCaisse({
    maintenant: params.maintenant,
    livraisons: params.livraisons,
    paiements: params.paiements,
    remises: params.remises,
    livreurIds: params.livreurIds,
    justifications: params.justifications,
  });

  const restantes = commandesDuJour.filter(
    (c) => c.statut !== "LIVREE" && c.statut !== "ANNULEE" && c.statut !== "ECHEC",
  ).length;

  return {
    journee: caisse.journee,
    commandes: {
      total: commandesDuJour.length,
      livrees: commandesDuJour.filter((c) => c.statut === "LIVREE").length,
      restantes,
    },
    livraisons: {
      total: livraisonsDuJour.length,
      livrees: livraisonsDuJour.filter((l) => l.statut === "LIVREE").length,
      echouees: livraisonsDuJour.filter((l) => l.statut === "ECHEC").length,
      enCours: livraisonsDuJour.filter(
        (l) => l.statut === "EN_ROUTE" || l.statut === "ARRIVE" || l.statut === "AFFECTEE",
      ).length,
    },
    caisse: caisse.totaux,
    lignes: caisse.lignes,
    prete: caisse.ecarts.nonExpliques.length === 0,
    ecartsAExpliquer: caisse.ecarts.nonExpliques.length,
  };
}

// ---------------------------------------------------------------------------
// Performance livreur
// ---------------------------------------------------------------------------

/**
 * Performance d'un livreur : des comptes, pas des pourcentages.
 * Le taux de réussite n'est pas exposé tant qu'il porte sur un volume trop
 * faible pour vouloir dire quoi que ce soit.
 */
export type PerformanceLivreur = {
  livreurId: string;
  livraisonsConfiees: number;
  livrees: number;
  echouees: number;
  enCours: number;
  dureeMoyenneMinutes: number | null;
};

export function calculerPerformanceLivreur(params: {
  livreurId: string;
  livraisons: Livraison[];
}): PerformanceLivreur {
  const livraisons = params.livraisons.filter((l) => l.livreurId === params.livreurId);

  const livrees = livraisons.filter((l) => l.statut === "LIVREE");
  const durees = livrees
    .filter((l) => l.departAt !== undefined && l.livreeAt !== undefined)
    .map((l) => (l.livreeAt! - l.departAt!) / 60_000);

  return {
    livreurId: params.livreurId,
    livraisonsConfiees: livraisons.length,
    livrees: livrees.length,
    echouees: livraisons.filter((l) => l.statut === "ECHEC").length,
    enCours: livraisons.filter((l) => l.statut === "EN_ROUTE" || l.statut === "ARRIVE").length,
    dureeMoyenneMinutes: durees.length
      ? Math.round(durees.reduce((t, d) => t + d, 0) / durees.length)
      : null,
  };
}
