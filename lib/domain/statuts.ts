// Machines à états des commandes et des livraisons.
//
// Chaque transition est déclarée explicitement. Une transition non déclarée est
// refusée. C'est ce qui empêche, par exemple, de marquer « Livrée » une
// livraison qui n'a jamais démarré, ou de faire repartir une livraison close.

import type {
  Resultat,
  StatutCommande,
  StatutLivraison,
  TypeEvenement,
} from "./types";
import { echec, ok } from "./types";

// ---------------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------------

export const STATUTS_COMMANDE: Record<
  StatutCommande,
  { libelle: string; couleur: "neutre" | "info" | "succes" | "echec" }
> = {
  A_PREPARER: { libelle: "À préparer", couleur: "neutre" },
  PRETE: { libelle: "Prête", couleur: "neutre" },
  A_AFFECTER: { libelle: "À affecter", couleur: "info" },
  AFFECTEE: { libelle: "Affectée", couleur: "info" },
  EN_LIVRAISON: { libelle: "En livraison", couleur: "info" },
  LIVREE: { libelle: "Livrée", couleur: "succes" },
  ECHEC: { libelle: "Échec", couleur: "echec" },
  ANNULEE: { libelle: "Annulée", couleur: "echec" },
};

/** Transitions autorisées d'une commande. */
const TRANSITIONS_COMMANDE: Record<StatutCommande, StatutCommande[]> = {
  A_PREPARER: ["PRETE", "A_AFFECTER", "ANNULEE"],
  PRETE: ["A_AFFECTER", "ANNULEE"],
  A_AFFECTER: ["AFFECTEE", "ANNULEE"],
  AFFECTEE: ["EN_LIVRAISON", "A_AFFECTER", "ANNULEE"],
  EN_LIVRAISON: ["LIVREE", "ECHEC"],
  LIVREE: [],
  ECHEC: [],
  ANNULEE: [],
};

/** Une commande close ne peut plus évoluer. */
export function commandeClose(statut: StatutCommande): boolean {
  return statut === "LIVREE" || statut === "ECHEC" || statut === "ANNULEE";
}

export function transitionCommandeAutorisee(
  de: StatutCommande,
  vers: StatutCommande,
): boolean {
  return TRANSITIONS_COMMANDE[de].includes(vers);
}

export function changerStatutCommande(
  de: StatutCommande,
  vers: StatutCommande,
): Resultat<StatutCommande> {
  if (de === vers) {
    return echec(`La commande est déjà au statut « ${STATUTS_COMMANDE[de].libelle} ».`);
  }
  if (!transitionCommandeAutorisee(de, vers)) {
    return echec(
      `Transition refusée : « ${STATUTS_COMMANDE[de].libelle} » → « ${STATUTS_COMMANDE[vers].libelle} ».`,
    );
  }
  return ok(vers);
}

/** Statuts proposés à l'utilisateur depuis un statut donné. */
export function statutsCommandeSuivants(statut: StatutCommande): StatutCommande[] {
  return TRANSITIONS_COMMANDE[statut];
}

// ---------------------------------------------------------------------------
// Livraisons
// ---------------------------------------------------------------------------

export const STATUTS_LIVRAISON: Record<
  StatutLivraison,
  {
    libelle: string;
    /** Le suivi GPS a-t-il un sens à ce stade ? */
    suiviGps: boolean;
    couleur: "neutre" | "info" | "succes" | "echec";
  }
> = {
  A_AFFECTER: { libelle: "À affecter", suiviGps: false, couleur: "neutre" },
  AFFECTEE: { libelle: "Affectée", suiviGps: false, couleur: "info" },
  EN_ROUTE: { libelle: "En route", suiviGps: true, couleur: "info" },
  ARRIVE: { libelle: "Arrivé", suiviGps: true, couleur: "info" },
  LIVREE: { libelle: "Livrée", suiviGps: false, couleur: "succes" },
  ECHEC: { libelle: "Échec", suiviGps: false, couleur: "echec" },
  ANNULEE: { libelle: "Annulée", suiviGps: false, couleur: "echec" },
};

const TRANSITIONS_LIVRAISON: Record<StatutLivraison, StatutLivraison[]> = {
  A_AFFECTER: ["AFFECTEE", "ANNULEE"],
  AFFECTEE: ["EN_ROUTE", "A_AFFECTER", "ECHEC", "ANNULEE"],
  EN_ROUTE: ["ARRIVE", "ECHEC", "ANNULEE"],
  ARRIVE: ["LIVREE", "ECHEC"],
  LIVREE: [],
  ECHEC: [],
  ANNULEE: [],
};

export function livraisonClose(statut: StatutLivraison): boolean {
  return statut === "LIVREE" || statut === "ECHEC" || statut === "ANNULEE";
}

export function transitionLivraisonAutorisee(
  de: StatutLivraison,
  vers: StatutLivraison,
): boolean {
  return TRANSITIONS_LIVRAISON[de].includes(vers);
}

export function changerStatutLivraison(
  de: StatutLivraison,
  vers: StatutLivraison,
): Resultat<StatutLivraison> {
  if (de === vers) {
    return echec(`La livraison est déjà au statut « ${STATUTS_LIVRAISON[de].libelle} ».`);
  }
  if (!transitionLivraisonAutorisee(de, vers)) {
    return echec(
      `Transition refusée : « ${STATUTS_LIVRAISON[de].libelle} » → « ${STATUTS_LIVRAISON[vers].libelle} ».`,
    );
  }
  return ok(vers);
}

export function statutsLivraisonSuivants(statut: StatutLivraison): StatutLivraison[] {
  return TRANSITIONS_LIVRAISON[statut];
}

/**
 * Les actions que le livreur peut déclencher depuis son téléphone.
 * Volontairement restreintes : le livreur ne peut ni annuler, ni réaffecter.
 */
export function actionsLivreur(statut: StatutLivraison): {
  action: "DEMARRER" | "ARRIVER" | "LIVRER" | "ECHOUER";
  libelle: string;
  vers: StatutLivraison;
}[] {
  const actions: {
    action: "DEMARRER" | "ARRIVER" | "LIVRER" | "ECHOUER";
    libelle: string;
    vers: StatutLivraison;
  }[] = [];
  if (statut === "AFFECTEE") {
    actions.push({ action: "DEMARRER", libelle: "Démarrer la livraison", vers: "EN_ROUTE" });
    actions.push({ action: "ECHOUER", libelle: "Signaler un échec", vers: "ECHEC" });
  }
  if (statut === "EN_ROUTE") {
    actions.push({ action: "ARRIVER", libelle: "Je suis arrivé", vers: "ARRIVE" });
    actions.push({ action: "ECHOUER", libelle: "Signaler un échec", vers: "ECHEC" });
  }
  if (statut === "ARRIVE") {
    actions.push({ action: "LIVRER", libelle: "Livraison effectuée", vers: "LIVREE" });
    actions.push({ action: "ECHOUER", libelle: "Signaler un échec", vers: "ECHEC" });
  }
  return actions;
}

/** Libellé de l'événement correspondant à une transition de livraison. */
export function evenementDeTransition(vers: StatutLivraison): TypeEvenement | null {
  switch (vers) {
    case "AFFECTEE": return "LIVREUR_AFFECTE";
    case "EN_ROUTE": return "DEPART";
    case "ARRIVE": return "ARRIVEE";
    case "LIVREE": return "LIVRAISON_EFFECTUEE";
    case "ECHEC": return "ECHEC";
    case "ANNULEE": return "ANNULATION";
    default: return null;
  }
}

/** Statut de commande correspondant à un statut de livraison. */
export function statutCommandeDepuisLivraison(statut: StatutLivraison): StatutCommande {
  switch (statut) {
    case "A_AFFECTER": return "A_AFFECTER";
    case "AFFECTEE": return "AFFECTEE";
    case "EN_ROUTE": return "EN_LIVRAISON";
    case "ARRIVE": return "EN_LIVRAISON";
    case "LIVREE": return "LIVREE";
    case "ECHEC": return "ECHEC";
    case "ANNULEE": return "ANNULEE";
  }
}
