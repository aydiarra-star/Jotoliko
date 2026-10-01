// Calculateur ROI.
//
// Règle d'honnêteté (voir AGENTS.md) : aucun pourcentage d'amélioration n'est
// inventé. Tous les résultats sont calculés à partir des chiffres saisis par
// le visiteur. Le produit ne promet pas de réduire les écarts de caisse d'un
// pourcentage donné ; il les rend visibles. C'est ce que dit l'interface.

export type SaisieRoi = {
  /** Nombre de livreurs ou d'agents terrain. */
  livreurs: number;
  /** Livraisons effectuées par livreur et par jour ouvré. */
  livraisonsParJour: number;
  /** Montant moyen encaissé par livraison, en FCFA entiers. */
  montantMoyen: number;
  /** Jours travaillés par mois. */
  joursParMois: number;
  /** Écarts de caisse constatés par mois, en FCFA entiers. Saisi par le visiteur. */
  ecartsParMois: number;
};

export type ResultatRoi = {
  livraisonsParMois: number;
  livraisonsParAn: number;
  /** Montant total encaissé sur le mois, en FCFA entiers. */
  montantEncaisseParMois: number;
  montantEncaisseParAn: number;
  /** Écarts annualisés, à partir du chiffre saisi par le visiteur. */
  ecartsParAn: number;
  /** Part des écarts dans le montant encaissé, en pourcentage. */
  partEcarts: number;
};

export const SAISIE_ROI_PAR_DEFAUT: SaisieRoi = {
  livreurs: 10,
  livraisonsParJour: 12,
  montantMoyen: 8500,
  joursParMois: 26,
  ecartsParMois: 50000,
};

/** Borne une saisie pour éviter les valeurs absurdes ou négatives. */
function assainir(valeur: number, max: number): number {
  if (!Number.isFinite(valeur) || valeur < 0) return 0;
  return Math.min(Math.floor(valeur), max);
}

/**
 * Calcule les volumes et montants à partir des chiffres du visiteur.
 *
 * Aucun taux de gain n'est appliqué : le résultat décrit la situation actuelle,
 * pas une amélioration promise.
 */
export function calculerRoi(saisie: SaisieRoi): ResultatRoi {
  const livreurs = assainir(saisie.livreurs, 10000);
  const livraisonsParJour = assainir(saisie.livraisonsParJour, 1000);
  const montantMoyen = assainir(saisie.montantMoyen, 100000000);
  const joursParMois = assainir(saisie.joursParMois, 31);
  const ecartsParMois = assainir(saisie.ecartsParMois, 1000000000);

  const livraisonsParMois = livreurs * livraisonsParJour * joursParMois;
  const livraisonsParAn = livraisonsParMois * 12;
  const montantEncaisseParMois = livraisonsParMois * montantMoyen;
  const montantEncaisseParAn = montantEncaisseParMois * 12;
  const ecartsParAn = ecartsParMois * 12;
  const partEcarts =
    montantEncaisseParMois > 0 ? (ecartsParMois / montantEncaisseParMois) * 100 : 0;

  return {
    livraisonsParMois,
    livraisonsParAn,
    montantEncaisseParMois,
    montantEncaisseParAn,
    ecartsParAn,
    partEcarts,
  };
}

/** Formate un entier en FCFA avec séparateur d'espace insécable. */
export function formaterFcfa(montant: number): string {
  return `${Math.round(montant).toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")} FCFA`;
}

export function formaterNombre(valeur: number): string {
  return Math.round(valeur).toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ");
}
