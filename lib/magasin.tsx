"use client";

// Magasin de l'application.
//
// Le prototype n'a pas de backend : l'état vit dans le navigateur et survit au
// rechargement via localStorage. Deux précautions sont prises :
//
//   - le rendu serveur produit un état vide, et l'hydratation attend le montage
//     (`pret`) : sans cela, l'export statique afficherait un contenu différent de
//     celui calculé côté client, ce qui casserait l'hydratation ;
//   - l'horodatage de référence est figé à l'ouverture de la session, pour que
//     « aujourd'hui » ne bouge pas pendant la consultation.
//
// Toutes les mutations passent par lib/domain/operations.ts. Ce fichier ne
// contient aucune règle métier : il ne fait que conserver l'état et router les
// actions vers le domaine.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { construireMonde, UTILISATEUR_DEMO } from "@/lib/domain/donnees-demo";
import {
  ajouterPreuve,
  affecterLivreur,
  annulerCommande,
  arriverLivraison,
  creerCommande,
  creerLivraisonDepuisCommande,
  demarrerLivraison,
  echouerLivraison,
  enregistrerPaiement,
  enregistrerPosition,
  enregistrerRemise,
  faireEvoluerCommande,
  modifierCommande,
  rejouerOperation,
  synchroniser,
  terminerLivraison,
  type Contexte,
  type EtatApplication,
  type NouvelleCommande,
} from "@/lib/domain/operations";
import type {
  Livraison,
  ModePaiement,
  PositionGps,
  Resultat,
  StatutCommande,
  Utilisateur,
} from "@/lib/domain/types";

const CLE_STOCKAGE = "jotoliko.app.v1";

// ---------------------------------------------------------------------------
// État initial
// ---------------------------------------------------------------------------

/**
 * Instant de référence de la session, figé au premier rendu pour que les
 * horodatages des scénarios ne se recalculent pas à chaque action.
 *
 * C'est bien l'instant courant, et non une heure fixe de la journée : ancrer la
 * session à midi placerait les positions dans le futur lorsqu'on ouvre
 * l'application le matin, et une position future est rejetée comme incohérente.
 */
function horodatageSession(): number {
  return Date.now();
}

function etatVide(): EtatApplication {
  return {
    monde: construireMonde(horodatageSession()),
    file: [],
    enLigne: true,
  };
}

// ---------------------------------------------------------------------------
// Réducteur : un seul point d'entrée pour toutes les mutations
// ---------------------------------------------------------------------------

type Action =
  | { type: "REINITIALISER" }
  | { type: "BASCULER_RESEAU" }
  | { type: "APPLIQUER"; f: (etat: EtatApplication, ctx: Contexte) => Resultat<EtatApplication> }
  | { type: "SYNCHRONISER" }
  | { type: "REJOUER"; clientId: string }
  | { type: "CHARGER"; etat: EtatApplication };

function reducteur(etat: EtatApplication, action: Action): EtatApplication {
  switch (action.type) {
    case "REINITIALISER":
      return etatVide();
    case "BASCULER_RESEAU":
      return { ...etat, enLigne: !etat.enLigne };
    case "SYNCHRONISER":
      return synchroniser(etat, Date.now());
    case "REJOUER":
      return rejouerOperation(etat, action.clientId);
    case "CHARGER":
      return action.etat;
    case "APPLIQUER": {
      const ctx: Contexte = {
        maintenant: Date.now(),
        nouvelId: () => crypto.randomUUID(),
        horsLigne: !etat.enLigne,
      };
      const resultat = action.f(etat, ctx);
      if (!resultat.ok) {
        // Un refus métier n'est pas une exception : l'état reste inchangé et
        // l'appelant reçoit la raison.
        return etat;
      }
      return resultat.valeur;
    }
  }
}

// ---------------------------------------------------------------------------
// Contexte React
// ---------------------------------------------------------------------------

type Magasin = {
  /** Faux tant que le navigateur n'a pas pris le relais : évite tout écart d'hydratation. */
  pret: boolean;
  etat: EtatApplication;
  utilisateur: Utilisateur;
  /** Applique une opération métier. Retourne le résultat pour affichage des refus. */
  appliquer: (f: (etat: EtatApplication, ctx: Contexte) => Resultat<EtatApplication>) => Resultat<EtatApplication>;
  reinitialiser: () => void;
  basculerReseau: () => void;
  synchroniserTout: () => void;
  rejouer: (clientId: string) => void;
  // Actions nommées, pour que les écrans n'aient pas à construire de closures.
  creerCommande: (p: NouvelleCommande) => Resultat<EtatApplication>;
  modifierCommande: (p: Parameters<typeof modifierCommande>[1]) => Resultat<EtatApplication>;
  faireEvoluerCommande: (commandeId: string, vers: StatutCommande) => Resultat<EtatApplication>;
  annulerCommande: (commandeId: string) => Resultat<EtatApplication>;
  creerLivraison: (commandeId: string) => Resultat<EtatApplication>;
  affecter: (livraisonId: string, livreurId: string) => Resultat<EtatApplication>;
  demarrer: (livraisonId: string) => Resultat<EtatApplication>;
  arriver: (livraisonId: string) => Resultat<EtatApplication>;
  terminer: (livraisonId: string) => Resultat<EtatApplication>;
  echouer: (livraisonId: string, motif: string) => Resultat<EtatApplication>;
  ajouterPreuve: (p: Parameters<typeof ajouterPreuve>[1]) => Resultat<EtatApplication>;
  encaisser: (p: { livraisonId: string; montant: number; mode: ModePaiement; referenceExterne?: string }) => Resultat<EtatApplication>;
  remiser: (p: { livreurId: string; montant: number; note?: string }) => Resultat<EtatApplication>;
  positionner: (p: {
    clientId: string;
    livraisonId: string;
    lat: number;
    lng: number;
    accuracy?: number;
    recordedAt: number;
    livreurId?: string;
  }) => Resultat<{ etat: EtatApplication; ajoutee: boolean }>;
};

const ContexteMagasin = createContext<Magasin | null>(null);

export function FournisseurMagasin({ children }: { children: ReactNode }) {
  const [etat, dispatch] = useReducer(reducteur, undefined, etatVide);
  const [pret, setPret] = useState(false);
  const restaure = useRef(false);

  // Restauration après montage uniquement : le serveur rend l'état initial.
  useEffect(() => {
    if (restaure.current) return;
    restaure.current = true;
    try {
      const brut = window.localStorage.getItem(CLE_STOCKAGE);
      if (brut) {
        const charge = JSON.parse(brut) as EtatApplication;
        // Les données restaurées portent leurs propres horodatages : on ne les
        // recale pas sur aujourd'hui, sinon la démonstration mentirait sur l'âge
        // réel des positions enregistrées.
        if (charge?.monde?.entreprise) dispatch({ type: "CHARGER", etat: charge });
      }
    } catch {
      // Un stockage illisible ne doit pas empêcher l'application de démarrer.
    }
    setPret(true);
  }, []);

  useEffect(() => {
    if (!pret) return;
    try {
      window.localStorage.setItem(CLE_STOCKAGE, JSON.stringify(etat));
    } catch {
      // Quota dépassé ou stockage refusé : l'application continue en mémoire.
    }
  }, [etat, pret]);

  const appliquer = useCallback(
    (f: (etat: EtatApplication, ctx: Contexte) => Resultat<EtatApplication>) => {
      const ctx: Contexte = {
        maintenant: Date.now(),
        nouvelId: () => crypto.randomUUID(),
        horsLigne: !etat.enLigne,
      };
      const resultat = f(etat, ctx);
      if (resultat.ok) dispatch({ type: "CHARGER", etat: resultat.valeur });
      return resultat;
    },
    [etat],
  );

  const valeur = useMemo<Magasin>(() => {
    const utilisateur =
      etat.monde.utilisateurs.find((u) => u.id === UTILISATEUR_DEMO) ??
      etat.monde.utilisateurs[0];

    return {
      pret,
      etat,
      utilisateur,
      appliquer,
      reinitialiser: () => dispatch({ type: "REINITIALISER" }),
      basculerReseau: () => dispatch({ type: "BASCULER_RESEAU" }),
      synchroniserTout: () => dispatch({ type: "SYNCHRONISER" }),
      rejouer: (clientId) => dispatch({ type: "REJOUER", clientId }),

      creerCommande: (p) => appliquer((e, c) => creerCommande(e, p, c)),
      modifierCommande: (p) => appliquer((e, c) => modifierCommande(e, p, c)),
      faireEvoluerCommande: (commandeId, vers) =>
        appliquer((e, c) => faireEvoluerCommande(e, { commandeId, vers }, c)),
      annulerCommande: (id) => appliquer((e, c) => annulerCommande(e, id, c)),
      creerLivraison: (id) => appliquer((e, c) => creerLivraisonDepuisCommande(e, id, c)),
      affecter: (livraisonId, livreurId) =>
        appliquer((e, c) => affecterLivreur(e, { livraisonId, livreurId }, c)),
      demarrer: (id) => appliquer((e, c) => demarrerLivraison(e, id, c)),
      arriver: (id) => appliquer((e, c) => arriverLivraison(e, id, c)),
      terminer: (id) => appliquer((e, c) => terminerLivraison(e, id, c)),
      echouer: (id, motif) => appliquer((e, c) => echouerLivraison(e, { livraisonId: id, motif }, c)),
      ajouterPreuve: (p) => appliquer((e, c) => ajouterPreuve(e, p, c)),
      encaisser: (p) => appliquer((e, c) => enregistrerPaiement(e, p, c)),
      remiser: (p) => appliquer((e, c) => enregistrerRemise(e, p, c)),
      positionner: (p) => {
        const ctx: Contexte = {
          maintenant: Date.now(),
          nouvelId: () => crypto.randomUUID(),
          horsLigne: !etat.enLigne,
        };
        const resultat = enregistrerPosition(etat, p, ctx);
        if (resultat.ok) dispatch({ type: "CHARGER", etat: resultat.valeur.etat });
        return resultat;
      },
    };
  }, [etat, pret, appliquer]);

  return <ContexteMagasin.Provider value={valeur}>{children}</ContexteMagasin.Provider>;
}

export function useMagasin(): Magasin {
  const m = useContext(ContexteMagasin);
  if (!m) throw new Error("useMagasin doit être utilisé dans FournisseurMagasin.");
  return m;
}

// ---------------------------------------------------------------------------
// Sélecteurs
// ---------------------------------------------------------------------------

export function useLivraison(id: string | undefined): Livraison | undefined {
  const { etat } = useMagasin();
  return id ? etat.monde.livraisons.find((l) => l.id === id) : undefined;
}

export function positionsDe(etat: EtatApplication, livraisonId: string): PositionGps[] {
  return etat.monde.positions
    .filter((p) => p.livraisonId === livraisonId)
    .sort((a, b) => a.recordedAt - b.recordedAt);
}

export const CLE_STOCKAGE_MAGASIN = CLE_STOCKAGE;
