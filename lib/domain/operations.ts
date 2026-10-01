// Opérations métier.
//
// Chaque opération est une fonction pure : elle reçoit l'état et les paramètres,
// et retourne soit un nouvel état, soit un refus explicite. Aucune dépendance à
// React, aucune dépendance au navigateur. C'est ce qui rend les règles
// testables directement, et transposables telles quelles dans l'API NestJS.
//
// Deux garanties sont appliquées partout :
//   - les transitions de statut passent par les machines à états (statuts.ts) ;
//   - chaque opération produit un événement horodaté, ce qui constitue l'audit.

import { ingererPosition, type PositionEntrante } from "./gps";
import {
  changerStatutCommande,
  changerStatutLivraison,
  statutCommandeDepuisLivraison,
} from "./statuts";
import type {
  Commande,
  EvenementLivraison,
  Livraison,
  LigneCommande,
  ModePaiement,
  Monde,
  OrigineEvenement,
  OperationEnAttente,
  Paiement,
  PositionGps,
  Preuve,
  Remise,
  Resultat,
  StatutCommande,
  StatutLivraison,
  TypeEvenement,
  TypeOperation,
} from "./types";
import { echec, ok } from "./types";

// ---------------------------------------------------------------------------
// État de l'application
// ---------------------------------------------------------------------------

export type EtatApplication = {
  monde: Monde;
  /** Opérations produites hors ligne, en attente de synchronisation. */
  file: OperationEnAttente[];
  /** Connectivité simulée. En production, elle vient du navigateur. */
  enLigne: boolean;
};

export type Contexte = {
  maintenant: number;
  nouvelId: () => string;
  /** Identifiant d'idempotence fourni par l'appelant, sinon généré. */
  clientId?: string;
  /** Si vrai, l'opération est mise en file d'attente de synchronisation. */
  horsLigne?: boolean;
};

// ---------------------------------------------------------------------------
// Utilitaires internes
// ---------------------------------------------------------------------------

function avecEvenement(
  monde: Monde,
  livraisonId: string,
  horodatage: number,
  type: TypeEvenement,
  libelle: string,
  origine: OrigineEvenement,
  ctx: Contexte,
): Monde {
  const evenement: EvenementLivraison = {
    id: ctx.nouvelId(),
    livraisonId,
    horodatage,
    type,
    libelle,
    origine,
    recordedAt: horodatage,
    syncedAt: ctx.horsLigne ? undefined : ctx.maintenant,
    clientId: ctx.clientId,
    provenance: monde.livraisons.find((l) => l.id === livraisonId)?.provenance ?? "DEMO",
  };
  return { ...monde, evenements: [...monde.evenements, evenement] };
}

function majLivraison(
  monde: Monde,
  livraisonId: string,
  patch: Partial<Livraison>,
): Monde {
  return {
    ...monde,
    livraisons: monde.livraisons.map((l) =>
      l.id === livraisonId ? { ...l, ...patch, updatedAt: patch.updatedAt ?? Date.now() } : l,
    ),
  };
}

/** Répercute le statut d'une livraison sur sa commande. */
function majCommandeDepuisLivraison(
  monde: Monde,
  commandeId: string,
  statutLivraison: StatutLivraison,
): Monde {
  const commande = monde.commandes.find((c) => c.id === commandeId);
  if (!commande) return monde;
  const cible = statutCommandeDepuisLivraison(statutLivraison);
  if (commande.statut === cible) return monde;
  // On ne force pas la transition : si elle n'est pas autorisée, la commande
  // garde son statut plutôt que de se retrouver dans un état incohérent.
  if (!changerStatutCommande(commande.statut, cible).ok) return monde;
  return {
    ...monde,
    commandes: monde.commandes.map((c) =>
      c.id === commandeId ? { ...c, statut: cible, updatedAt: Date.now() } : c,
    ),
  };
}

function enfiler(
  etat: EtatApplication,
  ctx: Contexte,
  type: TypeOperation,
  livraisonId: string,
  payload: unknown,
): EtatApplication {
  if (!ctx.horsLigne) return etat;
  const clientId = ctx.clientId ?? ctx.nouvelId();
  const operation: OperationEnAttente = {
    clientId,
    companyId: etat.monde.entreprise.id,
    type,
    livraisonId,
    recordedAt: ctx.maintenant,
    payload,
    etat: "EN_ATTENTE",
    tentatives: 0,
  };
  return { ...etat, file: [...etat.file, operation] };
}

function livraison(etat: EtatApplication, id: string): Livraison | undefined {
  return etat.monde.livraisons.find((l) => l.id === id);
}

// ---------------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------------

/**
 * Fait évoluer le statut d'une commande à la main (préparation, mise à
 * disposition). Les transitions autorisées sont celles de la machine à états :
 * une commande ne peut pas sauter directement à « Livrée ».
 */
export function faireEvoluerCommande(
  etat: EtatApplication,
  params: { commandeId: string; vers: StatutCommande },
  ctx: Contexte,
): Resultat<EtatApplication> {
  const commande = etat.monde.commandes.find((c) => c.id === params.commandeId);
  if (!commande) return echec("Commande introuvable.");

  const transition = changerStatutCommande(commande.statut, params.vers);
  if (!transition.ok) return echec(transition.raison);

  // Le statut ne peut pas être forcé depuis le bureau une fois qu'une livraison
  // pilote la commande : ce sont alors les étapes terrain qui font foi.
  if (
    commande.livraisonId &&
    (params.vers === "EN_LIVRAISON" || params.vers === "LIVREE" || params.vers === "ECHEC")
  ) {
    return echec(
      "Cette commande est pilotée par sa livraison : faites évoluer la livraison, la commande suivra.",
    );
  }

  return ok({
    ...etat,
    monde: {
      ...etat.monde,
      commandes: etat.monde.commandes.map((c) =>
        c.id === params.commandeId
          ? { ...c, statut: params.vers, updatedAt: ctx.maintenant }
          : c,
      ),
    },
  });
}

export type NouvelleCommande = {
  clientId: string;
  lignes: { designation: string; quantite: number; prixUnitaire: number }[];
  note?: string;
  dateCommande?: number;
};

export function creerCommande(
  etat: EtatApplication,
  params: NouvelleCommande,
  ctx: Contexte,
): Resultat<EtatApplication> {
  const client = etat.monde.clients.find((c) => c.id === params.clientId);
  if (!client) return echec("Client introuvable.");
  if (params.lignes.length === 0) return echec("Une commande doit contenir au moins une ligne.");

  for (const l of params.lignes) {
    if (!l.designation.trim()) return echec("Chaque ligne doit porter une désignation.");
    if (l.quantite <= 0) return echec("La quantité doit être supérieure à zéro.");
    if (l.prixUnitaire < 0) return echec("Le prix unitaire ne peut pas être négatif.");
  }

  const lignes: LigneCommande[] = params.lignes.map((l) => ({
    id: ctx.nouvelId(),
    designation: l.designation.trim(),
    quantite: l.quantite,
    prixUnitaire: l.prixUnitaire,
  }));

  const montantAttendu = lignes.reduce((t, l) => t + l.quantite * l.prixUnitaire, 0);
  const date = params.dateCommande ?? ctx.maintenant;

  const commande: Commande = {
    id: ctx.nouvelId(),
    companyId: etat.monde.entreprise.id,
    reference: prochaineReference(etat.monde.commandes, "CMD"),
    clientId: params.clientId,
    lignes,
    montantAttendu,
    statut: "A_PREPARER",
    dateCommande: date,
    note: params.note?.trim() || undefined,
    createdAt: ctx.maintenant,
    updatedAt: ctx.maintenant,
    provenance: etat.monde.entreprise.provenance,
  };

  return ok({ ...etat, monde: { ...etat.monde, commandes: [...etat.monde.commandes, commande] } });
}

export function modifierCommande(
  etat: EtatApplication,
  params: {
    commandeId: string;
    clientId?: string;
    lignes?: { designation: string; quantite: number; prixUnitaire: number }[];
    note?: string;
  },
  ctx: Contexte,
): Resultat<EtatApplication> {
  const commande = etat.monde.commandes.find((c) => c.id === params.commandeId);
  if (!commande) return echec("Commande introuvable.");
  if (commande.statut === "LIVREE" || commande.statut === "ECHEC" || commande.statut === "ANNULEE") {
    return echec("Une commande close ne peut plus être modifiée.");
  }

  let lignes = commande.lignes;
  if (params.lignes) {
    if (params.lignes.length === 0) return echec("Une commande doit contenir au moins une ligne.");
    for (const l of params.lignes) {
      if (!l.designation.trim()) return echec("Chaque ligne doit porter une désignation.");
      if (l.quantite <= 0) return echec("La quantité doit être supérieure à zéro.");
      if (l.prixUnitaire < 0) return echec("Le prix unitaire ne peut pas être négatif.");
    }
    lignes = params.lignes.map((l) => ({
      id: ctx.nouvelId(),
      designation: l.designation.trim(),
      quantite: l.quantite,
      prixUnitaire: l.prixUnitaire,
    }));
  }

  const montantAttendu = lignes.reduce((t, l) => t + l.quantite * l.prixUnitaire, 0);

  return ok({
    ...etat,
    monde: {
      ...etat.monde,
      commandes: etat.monde.commandes.map((c) =>
        c.id === params.commandeId
          ? {
              ...c,
              clientId: params.clientId ?? c.clientId,
              lignes,
              montantAttendu,
              note: params.note !== undefined ? params.note.trim() || undefined : c.note,
              updatedAt: ctx.maintenant,
            }
          : c,
      ),
      // Le montant attendu de la livraison suit celui de la commande.
      livraisons: etat.monde.livraisons.map((l) =>
        l.commandeId === params.commandeId ? { ...l, montantAttendu } : l,
      ),
    },
  });
}

export function annulerCommande(
  etat: EtatApplication,
  commandeId: string,
  ctx: Contexte,
): Resultat<EtatApplication> {
  const commande = etat.monde.commandes.find((c) => c.id === commandeId);
  if (!commande) return echec("Commande introuvable.");

  const transition = changerStatutCommande(commande.statut, "ANNULEE");
  if (!transition.ok) return echec(transition.raison);

  let monde: Monde = {
    ...etat.monde,
    commandes: etat.monde.commandes.map((c) =>
      c.id === commandeId ? { ...c, statut: "ANNULEE", updatedAt: ctx.maintenant } : c,
    ),
  };

  // La livraison associée, si elle est encore ouverte, est annulée avec la commande.
  if (commande.livraisonId) {
    const liv = monde.livraisons.find((l) => l.id === commande.livraisonId);
    if (liv && !(liv.statut === "LIVREE" || liv.statut === "ECHEC" || liv.statut === "ANNULEE")) {
      monde = majLivraison(monde, liv.id, { statut: "ANNULEE" });
      monde = avecEvenement(monde, liv.id, ctx.maintenant, "ANNULATION", "Livraison annulée (commande annulée)", "BUREAU", ctx);
    }
  }

  return ok({ ...etat, monde });
}

// ---------------------------------------------------------------------------
// Livraisons
// ---------------------------------------------------------------------------

export function creerLivraisonDepuisCommande(
  etat: EtatApplication,
  commandeId: string,
  ctx: Contexte,
): Resultat<EtatApplication> {
  const commande = etat.monde.commandes.find((c) => c.id === commandeId);
  if (!commande) return echec("Commande introuvable.");
  if (commande.livraisonId) return echec("Cette commande a déjà une livraison.");
  if (commande.statut === "LIVREE" || commande.statut === "ECHEC" || commande.statut === "ANNULEE") {
    return echec("Cette commande est close.");
  }

  const client = etat.monde.clients.find((c) => c.id === commande.clientId);
  if (!client) return echec("Client introuvable.");
  if (client.adresse.lat === undefined || client.adresse.lng === undefined) {
    return echec(
      "Le client n'a pas de point GPS : renseignez sa position avant de créer la livraison.",
    );
  }

  const id = ctx.nouvelId();
  const livraison: Livraison = {
    id,
    companyId: etat.monde.entreprise.id,
    reference: prochaineReference(etat.monde.livraisons, "LIV"),
    commandeId,
    clientId: client.id,
    adresse: client.adresse,
    destination: { lat: client.adresse.lat, lng: client.adresse.lng },
    statut: "A_AFFECTER",
    montantAttendu: commande.montantAttendu,
    createdAt: ctx.maintenant,
    updatedAt: ctx.maintenant,
    provenance: etat.monde.entreprise.provenance,
  };

  let monde: Monde = {
    ...etat.monde,
    livraisons: [...etat.monde.livraisons, livraison],
    commandes: etat.monde.commandes.map((c) =>
      c.id === commandeId
        ? { ...c, livraisonId: id, statut: "A_AFFECTER", updatedAt: ctx.maintenant }
        : c,
    ),
  };
  monde = avecEvenement(monde, id, ctx.maintenant, "LIVRAISON_CREEE", `Livraison ${livraison.reference} créée`, "BUREAU", ctx);

  return ok(enfiler({ ...etat, monde }, ctx, "POSITION", id, { action: "CREATION" }));
}

export function affecterLivreur(
  etat: EtatApplication,
  params: { livraisonId: string; livreurId: string },
  ctx: Contexte,
): Resultat<EtatApplication> {
  const liv = livraison(etat, params.livraisonId);
  if (!liv) return echec("Livraison introuvable.");

  const livreur = etat.monde.livreurs.find((l) => l.id === params.livreurId);
  if (!livreur) return echec("Livreur introuvable.");
  if (!livreur.actif) return echec(`${livreur.nom} est désactivé et ne peut pas recevoir de livraison.`);

  const transition = changerStatutLivraison(liv.statut, "AFFECTEE");
  if (!transition.ok) return echec(transition.raison);

  let monde = majLivraison(etat.monde, liv.id, {
    livreurId: livreur.id,
    statut: "AFFECTEE",
    assigneeAt: ctx.maintenant,
    updatedAt: ctx.maintenant,
  });
  monde = majCommandeDepuisLivraison(monde, liv.commandeId, "AFFECTEE");
  monde = avecEvenement(
    monde, liv.id, ctx.maintenant, "LIVREUR_AFFECTE",
    `Affectée à ${livreur.nom} (${livreur.matricule})`, "BUREAU", ctx,
  );

  return ok(enfiler({ ...etat, monde }, ctx, "POSITION", liv.id, { action: "AFFECTATION" }));
}

function transitionTerrain(
  etat: EtatApplication,
  params: { livraisonId: string; vers: StatutLivraison; motif?: string },
  ctx: Contexte,
  typeOperation: TypeOperation,
  origine: OrigineEvenement,
): Resultat<EtatApplication> {
  const liv = livraison(etat, params.livraisonId);
  if (!liv) return echec("Livraison introuvable.");

  const transition = changerStatutLivraison(liv.statut, params.vers);
  if (!transition.ok) return echec(transition.raison);

  if (params.vers === "ECHEC" && !params.motif?.trim()) {
    return echec("Un échec doit être motivé : précisez la raison.");
  }

  // La preuve conditionne la clôture. La règle vit ici, et non dans l'interface,
  // pour qu'aucun appelant — bureau, application mobile ou futur backend — ne
  // puisse marquer une livraison comme effectuée sans preuve enregistrée.
  if (params.vers === "LIVREE" && !liv.preuveId) {
    return echec(
      "Une livraison ne peut pas être clôturée sans preuve de livraison. Enregistrez d'abord la preuve.",
    );
  }

  const patch: Partial<Livraison> = { statut: params.vers, updatedAt: ctx.maintenant };
  if (params.vers === "EN_ROUTE") patch.departAt = ctx.maintenant;
  if (params.vers === "ARRIVE") patch.arriveeAt = ctx.maintenant;
  if (params.vers === "LIVREE") patch.livreeAt = ctx.maintenant;
  if (params.vers === "ECHEC") {
    patch.echecAt = ctx.maintenant;
    patch.motifEchec = params.motif?.trim();
  }

  let monde = majLivraison(etat.monde, liv.id, patch);
  monde = majCommandeDepuisLivraison(monde, liv.commandeId, params.vers);

  const evenement = evenementTransition(params.vers);
  if (evenement) {
    monde = avecEvenement(monde, liv.id, ctx.maintenant, evenement.type, evenement.libelle, origine, ctx);
  }

  return ok(enfiler({ ...etat, monde }, ctx, typeOperation, liv.id, { vers: params.vers }));
}

function evenementTransition(vers: StatutLivraison): { type: TypeEvenement; libelle: string } | null {
  switch (vers) {
    case "EN_ROUTE": return { type: "DEPART", libelle: "Livreur en route" };
    case "ARRIVE": return { type: "ARRIVEE", libelle: "Arrivé chez le client" };
    case "LIVREE": return { type: "LIVRAISON_EFFECTUEE", libelle: "Livraison effectuée" };
    case "ECHEC": return { type: "ECHEC", libelle: "Échec de livraison" };
    default: return null;
  }
}

export function demarrerLivraison(etat: EtatApplication, livraisonId: string, ctx: Contexte) {
  return transitionTerrain(etat, { livraisonId, vers: "EN_ROUTE" }, ctx, "DEMARRER_LIVRAISON", "TERRAIN");
}

export function arriverLivraison(etat: EtatApplication, livraisonId: string, ctx: Contexte) {
  return transitionTerrain(etat, { livraisonId, vers: "ARRIVE" }, ctx, "ARRIVER_LIVRAISON", "TERRAIN");
}

export function terminerLivraison(etat: EtatApplication, livraisonId: string, ctx: Contexte) {
  return transitionTerrain(etat, { livraisonId, vers: "LIVREE" }, ctx, "TERMINER_LIVRAISON", "TERRAIN");
}

export function echouerLivraison(
  etat: EtatApplication,
  params: { livraisonId: string; motif: string },
  ctx: Contexte,
) {
  return transitionTerrain(
    etat,
    { livraisonId: params.livraisonId, vers: "ECHEC", motif: params.motif },
    ctx,
    "ECHOUER_LIVRAISON",
    "TERRAIN",
  );
}

// ---------------------------------------------------------------------------
// Positions GPS
// ---------------------------------------------------------------------------

export function enregistrerPosition(
  etat: EtatApplication,
  params: Omit<PositionEntrante, "companyId" | "livreurId" | "provenance"> & {
    livreurId?: string;
    provenance?: PositionGps["provenance"];
  },
  ctx: Contexte,
): Resultat<{ etat: EtatApplication; ajoutee: boolean }> {
  const liv = livraison(etat, params.livraisonId);
  if (!liv) return echec("Livraison introuvable.");
  if (!liv.livreurId) return echec("Aucun livreur affecté : une position ne peut pas être rattachée.");

  const entrante: PositionEntrante = {
    clientId: params.clientId,
    companyId: etat.monde.entreprise.id,
    livraisonId: params.livraisonId,
    livreurId: params.livreurId ?? liv.livreurId,
    lat: params.lat,
    lng: params.lng,
    accuracy: params.accuracy,
    recordedAt: params.recordedAt,
    provenance: params.provenance ?? etat.monde.entreprise.provenance,
  };

  const resultat = ingererPosition(
    etat.monde.positions,
    entrante,
    ctx.maintenant,
    ctx.nouvelId(),
    // Hors ligne, la position n'a pas encore été transmise au serveur.
    ctx.horsLigne ? undefined : ctx.maintenant,
  );
  if (!resultat.ok) return echec(resultat.raison);

  if (!resultat.valeur.ajoutee) {
    // Position déjà connue : le rejeu n'a aucun effet, c'est voulu.
    return ok({ etat, ajoutee: false });
  }

  let monde: Monde = { ...etat.monde, positions: resultat.valeur.historique };
  monde = avecEvenement(
    monde, params.livraisonId, params.recordedAt,
    "POSITION_ENREGISTREE", "Position transmise par le téléphone du livreur", "TERRAIN", ctx,
  );

  return ok({
    etat: enfiler({ ...etat, monde }, ctx, "POSITION", params.livraisonId, entrante),
    ajoutee: true,
  });
}

// ---------------------------------------------------------------------------
// Preuve de livraison
// ---------------------------------------------------------------------------

export function ajouterPreuve(
  etat: EtatApplication,
  params: {
    livraisonId: string;
    photoRef?: string;
    nomReceptionnaire?: string;
    commentaire?: string;
    signatureRef?: string;
    position?: { lat: number; lng: number; accuracy?: number };
    clientId?: string;
  },
  ctx: Contexte,
): Resultat<EtatApplication> {
  const liv = livraison(etat, params.livraisonId);
  if (!liv) return echec("Livraison introuvable.");
  if (liv.statut !== "ARRIVE" && liv.statut !== "LIVREE") {
    return echec("Une preuve ne peut être enregistrée qu'une fois le livreur arrivé.");
  }

  // On n'invente rien : une preuve sans aucun élément n'a pas de contenu.
  const aDuContenu =
    Boolean(params.photoRef) ||
    Boolean(params.nomReceptionnaire?.trim()) ||
    Boolean(params.commentaire?.trim()) ||
    Boolean(params.signatureRef);
  if (!aDuContenu) {
    return echec("Une preuve doit contenir au moins une photo, un réceptionnaire, une signature ou un commentaire.");
  }

  const preuve: Preuve = {
    id: ctx.nouvelId(),
    companyId: etat.monde.entreprise.id,
    livraisonId: params.livraisonId,
    photoRef: params.photoRef,
    nomReceptionnaire: params.nomReceptionnaire?.trim() || undefined,
    commentaire: params.commentaire?.trim() || undefined,
    signatureRef: params.signatureRef,
    position: params.position,
    recordedAt: ctx.maintenant,
    syncedAt: ctx.horsLigne ? undefined : ctx.maintenant,
    clientId: params.clientId ?? ctx.clientId ?? ctx.nouvelId(),
    provenance: etat.monde.entreprise.provenance,
  };

  let monde: Monde = {
    ...etat.monde,
    preuves: [...etat.monde.preuves, preuve],
  };
  monde = majLivraison(monde, params.livraisonId, { preuveId: preuve.id, updatedAt: ctx.maintenant });
  monde = avecEvenement(
    monde, params.livraisonId, ctx.maintenant, "PREUVE_AJOUTEE",
    libellePreuve(preuve), "TERRAIN", ctx,
  );

  return ok(enfiler({ ...etat, monde }, ctx, "PREUVE", params.livraisonId, preuve));
}

function libellePreuve(p: Preuve): string {
  const parts: string[] = [];
  if (p.photoRef) parts.push("photo");
  if (p.nomReceptionnaire) parts.push(`réceptionnaire : ${p.nomReceptionnaire}`);
  if (p.signatureRef) parts.push("signature");
  if (p.position) parts.push("position");
  return `Preuve enregistrée — ${parts.join(", ")}`;
}

// ---------------------------------------------------------------------------
// Encaissements
// ---------------------------------------------------------------------------

export function enregistrerPaiement(
  etat: EtatApplication,
  params: {
    livraisonId: string;
    montant: number;
    mode: ModePaiement;
    referenceExterne?: string;
    clientId?: string;
  },
  ctx: Contexte,
): Resultat<EtatApplication> {
  const liv = livraison(etat, params.livraisonId);
  if (!liv) return echec("Livraison introuvable.");
  if (liv.statut === "ECHEC" || liv.statut === "ANNULEE") {
    return echec("Cette livraison est close : aucun encaissement ne peut y être rattaché.");
  }
  if (!Number.isFinite(params.montant) || params.montant <= 0) {
    return echec("Le montant encaissé doit être supérieur à zéro.");
  }

  const dejaEncaisse = etat.monde.paiements
    .filter((p) => p.livraisonId === params.livraisonId)
    .reduce((t, p) => t + p.montant, 0);
  const reste = Math.max(0, liv.montantAttendu - dejaEncaisse);
  if (params.montant > reste) {
    return echec(
      `Le montant dépasse ce qui reste à encaisser (${reste.toLocaleString("fr-FR")} FCFA).`,
    );
  }

  const paiement: Paiement = {
    id: ctx.nouvelId(),
    companyId: etat.monde.entreprise.id,
    livraisonId: params.livraisonId,
    commandeId: liv.commandeId,
    livreurId: liv.livreurId,
    montant: params.montant,
    mode: params.mode,
    referenceExterne: params.referenceExterne?.trim() || undefined,
    recordedAt: ctx.maintenant,
    syncedAt: ctx.horsLigne ? undefined : ctx.maintenant,
    clientId: params.clientId ?? ctx.clientId ?? ctx.nouvelId(),
    provenance: etat.monde.entreprise.provenance,
  };

  let monde: Monde = { ...etat.monde, paiements: [...etat.monde.paiements, paiement] };
  monde = avecEvenement(
    monde, params.livraisonId, ctx.maintenant, "PAIEMENT_ENREGISTRE",
    `Paiement enregistré — ${params.montant.toLocaleString("fr-FR")} FCFA (${params.mode})`,
    "TERRAIN", ctx,
  );

  return ok(enfiler({ ...etat, monde }, ctx, "PAIEMENT", params.livraisonId, paiement));
}

export function enregistrerRemise(
  etat: EtatApplication,
  params: { livreurId: string; montant: number; note?: string },
  ctx: Contexte,
): Resultat<EtatApplication> {
  const livreur = etat.monde.livreurs.find((l) => l.id === params.livreurId);
  if (!livreur) return echec("Livreur introuvable.");
  if (!Number.isFinite(params.montant) || params.montant <= 0) {
    return echec("Le montant remis doit être supérieur à zéro.");
  }

  const ids = new Set(
    etat.monde.livraisons.filter((l) => l.livreurId === params.livreurId).map((l) => l.id),
  );
  const encaisse = etat.monde.paiements
    .filter((p) => ids.has(p.livraisonId))
    .reduce((t, p) => t + p.montant, 0);
  const dejaRemis = etat.monde.remises
    .filter((r) => r.livreurId === params.livreurId)
    .reduce((t, r) => t + r.montant, 0);
  const resteARemettre = Math.max(0, encaisse - dejaRemis);

  if (params.montant > resteARemettre) {
    return echec(
      `Le montant dépasse ce que ${livreur.nom} doit encore remettre (${resteARemettre.toLocaleString("fr-FR")} FCFA).`,
    );
  }

  const remise: Remise = {
    id: ctx.nouvelId(),
    companyId: etat.monde.entreprise.id,
    livreurId: params.livreurId,
    montant: params.montant,
    recordedAt: ctx.maintenant,
    note: params.note?.trim() || undefined,
    provenance: etat.monde.entreprise.provenance,
  };

  const monde: Monde = { ...etat.monde, remises: [...etat.monde.remises, remise] };
  return ok({ ...etat, monde });
}

// ---------------------------------------------------------------------------
// Synchronisation
// ---------------------------------------------------------------------------

/** Marque comme synchronisées toutes les opérations en attente. */
export function synchroniser(etat: EtatApplication, maintenant: number): EtatApplication {
  return {
    ...etat,
    file: etat.file.map((o) =>
      o.etat === "EN_ATTENTE"
        ? { ...o, etat: "SYNCHRONISE", tentatives: o.tentatives + 1 }
        : o,
    ),
    monde: {
      ...etat.monde,
      positions: etat.monde.positions.map((p) =>
        p.syncedAt === undefined ? { ...p, syncedAt: maintenant } : p,
      ),
      preuves: etat.monde.preuves.map((p) =>
        p.syncedAt === undefined ? { ...p, syncedAt: maintenant } : p,
      ),
      paiements: etat.monde.paiements.map((p) =>
        p.syncedAt === undefined ? { ...p, syncedAt: maintenant } : p,
      ),
    },
  };
}

export function echouerSynchronisation(
  etat: EtatApplication,
  clientId: string,
  raison: string,
): EtatApplication {
  return {
    ...etat,
    file: etat.file.map((o) =>
      o.clientId === clientId
        ? { ...o, etat: "ECHEC", tentatives: o.tentatives + 1, derniereErreur: raison }
        : o,
    ),
  };
}

/** Rejoue une opération en échec : elle repasse en attente. */
export function rejouerOperation(etat: EtatApplication, clientId: string): EtatApplication {
  return {
    ...etat,
    file: etat.file.map((o) =>
      o.clientId === clientId ? { ...o, etat: "EN_ATTENTE", derniereErreur: undefined } : o,
    ),
  };
}

export function operationsEnAttente(etat: EtatApplication): OperationEnAttente[] {
  return etat.file.filter((o) => o.etat === "EN_ATTENTE");
}

export function operationsEnEchec(etat: EtatApplication): OperationEnAttente[] {
  return etat.file.filter((o) => o.etat === "ECHEC");
}

// ---------------------------------------------------------------------------
// Références
// ---------------------------------------------------------------------------

/** Génère une référence lisible du type CMD-2419, en continuant la séquence. */
export function prochaineReference(
  existants: { reference: string }[],
  prefixe: string,
): string {
  const numeros = existants
    .map((e) => Number.parseInt(e.reference.replace(`${prefixe}-`, ""), 10))
    .filter((n) => Number.isFinite(n));
  const suivant = numeros.length ? Math.max(...numeros) + 1 : 1;
  return `${prefixe}-${suivant}`;
}
