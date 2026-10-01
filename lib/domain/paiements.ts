// Encaissements et caisse.
//
// Deux notions distinctes, souvent confondues sur le terrain :
//
//   - le STATUT D'ENCAISSEMENT d'une livraison : le livreur a-t-il récupéré
//     l'argent auprès du client ?
//   - la REMISE : le livreur a-t-il reversé cet argent à l'entreprise ?
//
// Un livreur peut avoir tout encaissé et n'avoir rien remis. C'est exactement
// l'écart que Jotoliko doit rendre visible.

import { formaterFcfa } from "../tracking";
import type {
  JustificationEcart,
  Livraison,
  ModePaiement,
  Paiement,
  Remise,
  StatutPaiementLivraison,
} from "./types";

export { formaterFcfa };

export const LIBELLES_MODE_PAIEMENT: Record<ModePaiement, string> = {
  ESPECES: "Espèces",
  WAVE: "Wave",
  ORANGE_MONEY: "Orange Money",
  FREE_MONEY: "Free Money",
  VIREMENT: "Virement",
  A_CREDIT: "À crédit",
};

/** Un mode mobile money est réconciliable auprès de l'opérateur. */
export function estMobileMoney(mode: ModePaiement): boolean {
  return mode === "WAVE" || mode === "ORANGE_MONEY" || mode === "FREE_MONEY";
}

// ---------------------------------------------------------------------------
// Encaissement d'une livraison
// ---------------------------------------------------------------------------

export type EtatEncaissement = {
  livraisonId: string;
  montantAttendu: number;
  montantEncaisse: number;
  reste: number;
  statut: StatutPaiementLivraison;
  libelle: string;
  /** Montants reçus, dans l'ordre d'enregistrement. */
  paiements: Paiement[];
  modePrincipal?: ModePaiement;
};

export function calculerEncaissement(
  livraison: Livraison,
  paiements: Paiement[],
): EtatEncaissement {
  const lies = paiements.filter((p) => p.livraisonId === livraison.id);
  const montantEncaisse = lies.reduce((total, p) => total + p.montant, 0);
  const montantAttendu = livraison.montantAttendu;
  const reste = Math.max(0, montantAttendu - montantEncaisse);

  const statut = statutEncaissement(livraison, montantAttendu, montantEncaisse, lies.length);

  return {
    livraisonId: livraison.id,
    montantAttendu,
    montantEncaisse,
    reste,
    statut,
    libelle: libelleStatutEncaissement(statut),
    paiements: lies,
    modePrincipal: lies.at(-1)?.mode,
  };
}

/**
 * Le statut dépend aussi du sort de la livraison : une livraison échouée ou
 * annulée ne laisse pas une dette à encaisser.
 */
export function statutEncaissement(
  livraison: Livraison,
  montantAttendu: number,
  montantEncaisse: number,
  nombrePaiements: number,
): StatutPaiementLivraison {
  if (livraison.statut === "ECHEC" || livraison.statut === "ANNULEE") {
    return montantEncaisse > 0 ? "ENCAISSE" : "NON_ENCAISSE";
  }
  if (montantEncaisse <= 0) {
    // Sans aucun paiement enregistré, rien n'a été encaissé. On ne parle
    // d'« à encaisser » que si la livraison est encore ouverte.
    return nombrePaiements === 0 && !livraisonClose(livraison) ? "A_ENCAISSER" : "NON_ENCAISSE";
  }
  if (montantEncaisse < montantAttendu) return "PARTIEL";
  return "ENCAISSE";
}

function livraisonClose(livraison: Livraison): boolean {
  return livraison.statut === "LIVREE";
}

export function libelleStatutEncaissement(s: StatutPaiementLivraison): string {
  switch (s) {
    case "A_ENCAISSER": return "À encaisser";
    case "PARTIEL": return "Partiellement encaissé";
    case "ENCAISSE": return "Encaissé";
    case "NON_ENCAISSE": return "Non encaissé";
  }
}

// ---------------------------------------------------------------------------
// Caisse d'un livreur
// ---------------------------------------------------------------------------

export type LigneCaisseLivreur = {
  livreurId: string;
  /** Livraisons confiées au livreur sur la période. */
  livraisonsConfiees: number;
  livraisonsLivrees: number;
  livraisonsEchouees: number;
  /** Ce que le client devait payer au total. */
  montantAttendu: number;
  /** Ce que le livreur a réellement encaissé. */
  montantEncaisse: number;
  /** Ce que le livreur doit encore encaisser sur des livraisons ouvertes. */
  montantRestantAEncaisser: number;
  /** Ce que le livreur doit reverser : tout ce qu'il a encaissé. */
  montantARemettre: number;
  /** Ce qu'il a effectivement remis. */
  montantRemis: number;
  /** Ce qu'il lui reste à remettre : à remettre moins déjà remis. */
  resteARemettre: number;
  /** montantRemis - montantARemettre. Positif : excédent. Négatif : manquant. */
  ecart: number;
  /** Vrai quand l'écart est nul : la caisse est juste, il n'y a rien à expliquer. */
  ecartJuste: boolean;
  /** Vrai quand l'écart est couvert par une explication écrite. */
  ecartExplique: boolean;
  /** Explication enregistrée pour la journée, s'il y en a une. */
  justification?: JustificationEcart;
};

export function calculerCaisseLivreur(params: {
  livreurId: string;
  livraisons: Livraison[];
  paiements: Paiement[];
  remises: Remise[];
  justifications?: JustificationEcart[];
}): LigneCaisseLivreur {
  const { livreurId } = params;
  const livraisons = params.livraisons.filter((l) => l.livreurId === livreurId);
  const ids = new Set(livraisons.map((l) => l.id));
  const paiements = params.paiements.filter((p) => ids.has(p.livraisonId));
  const remises = params.remises.filter((r) => r.livreurId === livreurId);

  const montantAttendu = livraisons.reduce((t, l) => t + l.montantAttendu, 0);
  const montantEncaisse = paiements.reduce((t, p) => t + p.montant, 0);
  const montantRemis = remises.reduce((t, r) => t + r.montant, 0);

  const montantRestantAEncaisser = livraisons
    .filter((l) => l.statut !== "ECHEC" && l.statut !== "ANNULEE")
    .reduce((total, l) => {
      const encaisse = paiements
        .filter((p) => p.livraisonId === l.id)
        .reduce((t, p) => t + p.montant, 0);
      return total + Math.max(0, l.montantAttendu - encaisse);
    }, 0);

  const ecart = montantRemis - montantEncaisse;
  const justification = params.justifications?.find((j) => j.livreurId === livreurId);

  return {
    livreurId,
    livraisonsConfiees: livraisons.length,
    livraisonsLivrees: livraisons.filter((l) => l.statut === "LIVREE").length,
    livraisonsEchouees: livraisons.filter((l) => l.statut === "ECHEC").length,
    montantAttendu,
    montantEncaisse,
    montantRestantAEncaisser,
    montantARemettre: montantEncaisse,
    montantRemis,
    resteARemettre: Math.max(0, montantEncaisse - montantRemis),
    ecart,
    ecartJuste: ecart === 0,
    ecartExplique: ecart === 0 || Boolean(justification),
    justification,
  };
}

/** Qualifie l'écart sans le masquer : un manquant reste un manquant. */
export function libelleEcart(ecart: number): string {
  if (ecart === 0) return "Caisse juste";
  if (ecart > 0) return `Excédent de ${formaterFcfa(ecart)}`;
  return `Manquant de ${formaterFcfa(Math.abs(ecart))}`;
}

/**
 * Un écart se justifie par une phrase, pas par un mot.
 *
 * Sans ce minimum, « ok » ou « vu » tiendrait lieu d'explication et l'écart
 * cesserait d'être visible — exactement ce que la règle interdit.
 */
export function validerJustificationEcart(
  commentaire: string,
): { ok: true } | { ok: false; raison: string } {
  const propre = commentaire.trim();
  if (propre.length === 0) {
    return { ok: false, raison: "Expliquez l'écart en quelques mots." };
  }
  if (propre.length < 5) {
    return { ok: false, raison: "L'explication est trop courte pour être utile." };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Saisie
// ---------------------------------------------------------------------------

export function validerMontantPaiement(
  montant: number,
  reste: number,
): { ok: true } | { ok: false; raison: string } {
  if (!Number.isFinite(montant)) return { ok: false, raison: "Le montant doit être un nombre." };
  if (montant <= 0) return { ok: false, raison: "Le montant doit être supérieur à zéro." };
  if (montant > reste) {
    return {
      ok: false,
      raison: `Le montant dépasse ce qui reste à encaisser (${formaterFcfa(reste)}).`,
    };
  }
  return { ok: true };
}

export function validerMontantRemise(
  montant: number,
  montantARemettre: number,
): { ok: true } | { ok: false; raison: string } {
  if (!Number.isFinite(montant)) return { ok: false, raison: "Le montant doit être un nombre." };
  if (montant <= 0) return { ok: false, raison: "Le montant doit être supérieur à zéro." };
  if (montant > montantARemettre) {
    return {
      ok: false,
      raison: `Le montant dépasse ce que le livreur doit remettre (${formaterFcfa(montantARemettre)}).`,
    };
  }
  return { ok: true };
}
