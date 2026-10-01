// Types du domaine métier Jotoliko.
//
// Ce fichier ne dépend ni de React, ni du DOM, ni d'une base de données.
// Il doit rester réutilisable tel quel par l'application web, l'application
// livreur et, plus tard, l'API NestJS.

// ---------------------------------------------------------------------------
// Provenance d'une donnée
// ---------------------------------------------------------------------------

/**
 * Toute donnée affichée porte son origine. Une donnée de démonstration ne doit
 * jamais pouvoir être confondue avec une donnée opérationnelle réelle.
 */
export type Provenance = "REAL" | "DEMO" | "UNKNOWN";

export function estExploitable(p: Provenance): boolean {
  return p === "REAL";
}

export function libelleProvenance(p: Provenance): string {
  switch (p) {
    case "REAL": return "Donnée réelle";
    case "DEMO": return "Donnée de démonstration";
    case "UNKNOWN": return "Origine inconnue";
  }
}

// ---------------------------------------------------------------------------
// Résultat d'une opération métier
// ---------------------------------------------------------------------------

/**
 * Les règles métier refusent explicitement une opération impossible plutôt que
 * de l'accepter en silence. L'appelant est obligé de traiter le cas d'échec.
 */
export type Resultat<T> =
  | { ok: true; valeur: T }
  | { ok: false; raison: string };

export function ok<T>(valeur: T): Resultat<T> {
  return { ok: true, valeur };
}

export function echec<T>(raison: string): Resultat<T> {
  return { ok: false, raison };
}

// ---------------------------------------------------------------------------
// Identité et périmètre
// ---------------------------------------------------------------------------

export type Role = "OWNER" | "MANAGER" | "DISPATCHER" | "DRIVER";

export type Utilisateur = {
  id: string;
  companyId: string;
  nom: string;
  email: string;
  telephone: string;
  role: Role;
  /** Renseigné uniquement pour un utilisateur de rôle DRIVER. */
  driverId?: string;
  actif: boolean;
};

export type Entreprise = {
  id: string;
  nom: string;
  ville: string;
  pays: string;
  devise: string;
  provenance: Provenance;
};

// ---------------------------------------------------------------------------
// Clients et adresses
// ---------------------------------------------------------------------------

export type Adresse = {
  /** Adresse textuelle. Au Sénégal, elle est souvent approximative. */
  ligne: string;
  zone: string;
  ville: string;
  /** Point GPS saisi par le responsable, quand il existe. */
  lat?: number;
  lng?: number;
  /** Indication humaine : « immeuble bleu après la pharmacie ». */
  repere?: string;
};

export type Client = {
  id: string;
  companyId: string;
  nom: string;
  telephone: string;
  adresse: Adresse;
  note?: string;
  createdAt: number;
  provenance: Provenance;
};

// ---------------------------------------------------------------------------
// Livreurs et véhicules
// ---------------------------------------------------------------------------

export type TypeVehicule = "MOTO" | "VOITURE" | "CAMIONNETTE" | "VELO" | "A_PIED";

export type Vehicule = {
  id: string;
  companyId: string;
  libelle: string;
  type: TypeVehicule;
  immatriculation?: string;
};

export type StatutLivreur = "DISPONIBLE" | "EN_TOURNEE" | "INACTIF";

export type Livreur = {
  id: string;
  companyId: string;
  nom: string;
  telephone: string;
  matricule: string;
  vehiculeId?: string;
  actif: boolean;
  createdAt: number;
  provenance: Provenance;
};

// ---------------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------------

export type StatutCommande =
  | "A_PREPARER"
  | "PRETE"
  | "A_AFFECTER"
  | "AFFECTEE"
  | "EN_LIVRAISON"
  | "LIVREE"
  | "ECHEC"
  | "ANNULEE";

export type LigneCommande = {
  id: string;
  designation: string;
  quantite: number;
  prixUnitaire: number;
};

export type Commande = {
  id: string;
  companyId: string;
  reference: string;
  clientId: string;
  lignes: LigneCommande[];
  /** Montant attendu à la livraison, calculé depuis les lignes. */
  montantAttendu: number;
  statut: StatutCommande;
  dateCommande: number;
  /** Livraison créée pour cette commande, s'il y en a une. */
  livraisonId?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
  provenance: Provenance;
};

// ---------------------------------------------------------------------------
// Livraisons
// ---------------------------------------------------------------------------

export type StatutLivraison =
  | "A_AFFECTER"
  | "AFFECTEE"
  | "EN_ROUTE"
  | "ARRIVE"
  | "LIVREE"
  | "ECHEC"
  | "ANNULEE";

export type OrigineEvenement = "BUREAU" | "TERRAIN" | "SYSTEME";

export type TypeEvenement =
  | "LIVRAISON_CREEE"
  | "LIVREUR_AFFECTE"
  | "DEPART"
  | "ARRIVEE"
  | "LIVRAISON_EFFECTUEE"
  | "ECHEC"
  | "ANNULATION"
  | "PREUVE_AJOUTEE"
  | "PAIEMENT_ENREGISTRE"
  | "REMISE_ENREGISTREE"
  | "POSITION_ENREGISTREE";

export type EvenementLivraison = {
  id: string;
  livraisonId: string;
  horodatage: number;
  type: TypeEvenement;
  libelle: string;
  origine: OrigineEvenement;
  /** Horodatage terrain quand l'événement a été produit hors ligne. */
  recordedAt?: number;
  syncedAt?: number;
  clientId?: string;
  provenance: Provenance;
};

export type Livraison = {
  id: string;
  companyId: string;
  reference: string;
  commandeId: string;
  clientId: string;
  adresse: Adresse;
  destination: { lat: number; lng: number };
  /** Point de départ réel de la tournée, utilisé pour la progression. */
  depart?: { lat: number; lng: number };
  livreurId?: string;
  statut: StatutLivraison;
  assigneeAt?: number;
  departAt?: number;
  arriveeAt?: number;
  livreeAt?: number;
  echecAt?: number;
  motifEchec?: string;
  preuveId?: string;
  montantAttendu: number;
  createdAt: number;
  updatedAt: number;
  provenance: Provenance;
};

// ---------------------------------------------------------------------------
// Positions GPS
// ---------------------------------------------------------------------------

export type PositionGps = {
  id: string;
  companyId: string;
  livraisonId: string;
  livreurId: string;
  lat: number;
  lng: number;
  /** Précision annoncée par le téléphone, en mètres. */
  accuracy?: number;
  /** Instant de la mesure, tel qu'horodaté par le téléphone. */
  recordedAt: number;
  /** Instant de réception serveur. Absent tant que la donnée n'est pas synchronisée. */
  syncedAt?: number;
  /** Clé d'idempotence générée par le téléphone. */
  clientId: string;
  provenance: Provenance;
};

// ---------------------------------------------------------------------------
// Preuves de livraison
// ---------------------------------------------------------------------------

export type Preuve = {
  id: string;
  companyId: string;
  livraisonId: string;
  /** Référence vers la photo. Absente si aucune photo n'a été prise. */
  photoRef?: string;
  nomReceptionnaire?: string;
  commentaire?: string;
  /** Signature manuscrite encodée. Absente si non recueillie. */
  signatureRef?: string;
  /** Position mesurée au moment de la remise, si le téléphone en a fourni une. */
  position?: { lat: number; lng: number; accuracy?: number };
  recordedAt: number;
  syncedAt?: number;
  clientId: string;
  provenance: Provenance;
};

// ---------------------------------------------------------------------------
// Encaissements
// ---------------------------------------------------------------------------

export type ModePaiement =
  | "ESPECES"
  | "WAVE"
  | "ORANGE_MONEY"
  | "FREE_MONEY"
  | "VIREMENT"
  | "A_CREDIT";

export type StatutPaiementLivraison =
  | "A_ENCAISSER"
  | "PARTIEL"
  | "ENCAISSE"
  | "NON_ENCAISSE";

export type Paiement = {
  id: string;
  companyId: string;
  livraisonId: string;
  commandeId: string;
  livreurId?: string;
  montant: number;
  mode: ModePaiement;
  /** Référence opérateur mobile money, quand elle existe. */
  referenceExterne?: string;
  recordedAt: number;
  syncedAt?: number;
  clientId: string;
  provenance: Provenance;
};

/** Remise du cash par le livreur à l'entreprise. */
export type Remise = {
  id: string;
  companyId: string;
  livreurId: string;
  montant: number;
  recordedAt: number;
  note?: string;
  provenance: Provenance;
};

// ---------------------------------------------------------------------------
// File de synchronisation (hors ligne)
// ---------------------------------------------------------------------------

export type EtatSynchronisation = "EN_ATTENTE" | "SYNCHRONISE" | "ECHEC";

export type TypeOperation =
  | "DEMARRER_LIVRAISON"
  | "ARRIVER_LIVRAISON"
  | "TERMINER_LIVRAISON"
  | "ECHOUER_LIVRAISON"
  | "POSITION"
  | "PREUVE"
  | "PAIEMENT";

export type OperationEnAttente = {
  /** Clé d'idempotence : une même opération rejouée n'a pas d'effet supplémentaire. */
  clientId: string;
  companyId: string;
  type: TypeOperation;
  livraisonId: string;
  recordedAt: number;
  payload: unknown;
  etat: EtatSynchronisation;
  tentatives: number;
  derniereErreur?: string;
};

// ---------------------------------------------------------------------------
// Monde : l'ensemble des données d'une entreprise
// ---------------------------------------------------------------------------

/**
 * Agrégat complet des données métier. En production, chaque collection
 * correspond à une table ; ici, elles sont chargées d'un bloc, ce qui permet
 * aux opérations métier de rester pures et donc directement testables.
 */
export type Monde = {
  entreprise: Entreprise;
  utilisateurs: Utilisateur[];
  vehicules: Vehicule[];
  livreurs: Livreur[];
  clients: Client[];
  commandes: Commande[];
  livraisons: Livraison[];
  positions: PositionGps[];
  preuves: Preuve[];
  paiements: Paiement[];
  remises: Remise[];
  evenements: EvenementLivraison[];
};
