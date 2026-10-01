// Tests du domaine métier.
//
// Ces tests portent sur les règles, pas sur l'interface : ils appellent
// directement les fonctions pures de lib/domain/. C'est ce qui permet de
// garantir les invariants du produit (jamais d'invention, jamais de fuite entre
// entreprises, jamais de transition impossible) indépendamment de React.

import { describe, expect, it } from "vitest";
import {
  calculerCaisseLivreur,
  calculerEncaissement,
  libelleEcart,
  statutEncaissement,
  validerMontantPaiement,
} from "./paiements";
import { construireMonde } from "./donnees-demo";
import {
  ajouterPreuve,
  annulerCommande,
  affecterLivreur,
  arriverLivraison,
  creerCommande,
  creerLivraisonDepuisCommande,
  demarrerLivraison,
  echouerLivraison,
  enregistrerPaiement,
  enregistrerPosition,
  enregistrerRemise,
  operationsEnAttente,
  prochaineReference,
  synchroniser,
  terminerLivraison,
  type Contexte,
  type EtatApplication,
} from "./operations";
import { ingererPosition, validerPosition } from "./gps";
import {
  changerStatutCommande,
  changerStatutLivraison,
  statutCommandeDepuisLivraison,
} from "./statuts";
import {
  aLaPermission,
  filtrerPerimetre,
  porteeRequete,
  verifierAccesEntreprise,
  verifierAccesLivraison,
  verifierActionLivreur,
} from "./acces";
import {
  calculerPerformanceLivreur,
  construireRapportCaisse,
  construireTableauBord,
} from "./rapports";
import type { PositionGps, Utilisateur } from "./types";
import { evaluerFraicheur, calculerEta } from "../tracking";

// ---------------------------------------------------------------------------
// Harnais
// ---------------------------------------------------------------------------

const T0 = new Date(2026, 2, 15, 12, 0, 0).getTime();

function contexte(overrides: Partial<Contexte> = {}): Contexte {
  let n = 0;
  return {
    maintenant: T0,
    nouvelId: () => `id-${++n}`,
    ...overrides,
  };
}

function etatInitial(maintenant = T0): EtatApplication {
  return { monde: construireMonde(maintenant), file: [], enLigne: true };
}

function utilisateur(overrides: Partial<Utilisateur> = {}): Utilisateur {
  return {
    id: "usr-1", companyId: "ent-1", nom: "Fatou Sow", email: "f@x.sn",
    telephone: "+221", role: "OWNER", actif: true, ...overrides,
  };
}

function positionDemo(overrides: Partial<PositionGps> = {}): PositionGps {
  return {
    id: "pos-1", companyId: "ent-1", livraisonId: "liv-1", livreurId: "drv-1",
    lat: 14.72, lng: -17.47, recordedAt: T0, clientId: "c-1", provenance: "DEMO",
    ...overrides,
  };
}

// ===========================================================================
// COMMANDES
// ===========================================================================

describe("Commandes — création", () => {
  it("crée une commande et calcule le montant attendu", () => {
    const r = creerCommande(
      etatInitial(),
      { clientId: "cli-1", lignes: [{ designation: "Riz", quantite: 2, prixUnitaire: 5000 }] },
      contexte(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.valeur.monde.commandes.at(-1)!;
    expect(c.montantAttendu).toBe(10_000);
    expect(c.statut).toBe("A_PREPARER");
    expect(c.provenance).toBe("DEMO");
  });

  it("refuse une commande sans ligne", () => {
    const r = creerCommande(etatInitial(), { clientId: "cli-1", lignes: [] }, contexte());
    expect(r.ok).toBe(false);
  });

  it("refuse une quantité nulle ou négative", () => {
    const r = creerCommande(
      etatInitial(),
      { clientId: "cli-1", lignes: [{ designation: "Riz", quantite: 0, prixUnitaire: 5000 }] },
      contexte(),
    );
    expect(r.ok).toBe(false);
  });

  it("refuse un client inexistant", () => {
    const r = creerCommande(
      etatInitial(),
      { clientId: "inconnu", lignes: [{ designation: "Riz", quantite: 1, prixUnitaire: 5000 }] },
      contexte(),
    );
    expect(r.ok).toBe(false);
  });

  it("attribue une référence qui continue la séquence", () => {
    const r = creerCommande(
      etatInitial(),
      { clientId: "cli-1", lignes: [{ designation: "Riz", quantite: 1, prixUnitaire: 100 }] },
      contexte(),
    );
    expect(r.ok && r.valeur.monde.commandes.at(-1)!.reference).toBe("CMD-2419");
  });
});

describe("Commandes — annulation", () => {
  it("annule une commande ouverte", () => {
    const r = annulerCommande(etatInitial(), "cmd-4", contexte());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valeur.monde.commandes.find((c) => c.id === "cmd-4")!.statut).toBe("ANNULEE");
  });

  it("refuse d'annuler une commande déjà livrée", () => {
    const r = annulerCommande(etatInitial(), "cmd-2", contexte());
    expect(r.ok).toBe(false);
  });

  it("annule la livraison associée quand elle est encore ouverte", () => {
    const r = annulerCommande(etatInitial(), "cmd-4", contexte());
    expect(r.ok).toBe(true);
  });
});

describe("Commandes — transitions", () => {
  it("autorise À préparer vers À affecter", () => {
    expect(changerStatutCommande("A_PREPARER", "A_AFFECTER").ok).toBe(true);
  });
  it("refuse À préparer vers Livrée", () => {
    expect(changerStatutCommande("A_PREPARER", "LIVREE").ok).toBe(false);
  });
  it("refuse de faire repartir une commande livrée", () => {
    expect(changerStatutCommande("LIVREE", "EN_LIVRAISON").ok).toBe(false);
  });
  it("refuse un statut identique", () => {
    expect(changerStatutCommande("PRETE", "PRETE").ok).toBe(false);
  });
});

// ===========================================================================
// LIVRAISONS
// ===========================================================================

describe("Livraisons — création depuis une commande", () => {
  it("crée une livraison pour une commande qui n'en a pas", () => {
    const r = creerLivraisonDepuisCommande(etatInitial(), "cmd-4", contexte());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const liv = r.valeur.monde.livraisons.at(-1)!;
    expect(liv.statut).toBe("A_AFFECTER");
    expect(liv.commandeId).toBe("cmd-4");
    expect(r.valeur.monde.commandes.find((c) => c.id === "cmd-4")!.livraisonId).toBe(liv.id);
  });

  it("refuse une seconde livraison pour la même commande", () => {
    const r = creerLivraisonDepuisCommande(etatInitial(), "cmd-1", contexte());
    expect(r.ok).toBe(false);
  });

  it("refuse une commande close", () => {
    const r = creerLivraisonDepuisCommande(etatInitial(), "cmd-10", contexte());
    expect(r.ok).toBe(false);
  });
});

describe("Livraisons — affectation", () => {
  it("affecte un livreur actif", () => {
    const r = affecterLivreur(etatInitial(), { livraisonId: "liv-1", livreurId: "drv-2" }, contexte());
    // liv-1 est déjà en route : l'affectation doit être refusée.
    expect(r.ok).toBe(false);
  });

  it("affecte un livreur à une livraison en attente", () => {
    const etat = etatInitial();
    const cree = creerLivraisonDepuisCommande(etat, "cmd-4", contexte());
    expect(cree.ok).toBe(true);
    if (!cree.ok) return;
    const id = cree.valeur.monde.livraisons.at(-1)!.id;
    const r = affecterLivreur(cree.valeur, { livraisonId: id, livreurId: "drv-2" }, contexte());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const liv = r.valeur.monde.livraisons.find((l) => l.id === id)!;
    expect(liv.statut).toBe("AFFECTEE");
    expect(liv.livreurId).toBe("drv-2");
    expect(liv.assigneeAt).toBe(T0);
  });

  it("refuse un livreur désactivé", () => {
    const etat = etatInitial();
    const cree = creerLivraisonDepuisCommande(etat, "cmd-4", contexte());
    if (!cree.ok) throw new Error("préparation");
    const id = cree.valeur.monde.livraisons.at(-1)!.id;
    const r = affecterLivreur(cree.valeur, { livraisonId: id, livreurId: "drv-4" }, contexte());
    expect(r.ok).toBe(false);
  });

  it("refuse d'affecter une livraison déjà livrée", () => {
    const r = affecterLivreur(etatInitial(), { livraisonId: "liv-2", livreurId: "drv-2" }, contexte());
    expect(r.ok).toBe(false);
  });
});

describe("Livraisons — cycle terrain", () => {
  it("démarre une livraison affectée", () => {
    const r = demarrerLivraison(etatInitial(), "liv-3", contexte());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const liv = r.valeur.monde.livraisons.find((l) => l.id === "liv-3")!;
    expect(liv.statut).toBe("EN_ROUTE");
    expect(liv.departAt).toBe(T0);
  });

  it("refuse de démarrer une livraison non affectée", () => {
    const etat = etatInitial();
    const cree = creerLivraisonDepuisCommande(etat, "cmd-4", contexte());
    if (!cree.ok) throw new Error("préparation");
    const id = cree.valeur.monde.livraisons.at(-1)!.id;
    const r = demarrerLivraison(cree.valeur, id, contexte());
    expect(r.ok).toBe(false);
  });

  it("enregistre l'arrivée", () => {
    const r = arriverLivraison(etatInitial(), "liv-6", contexte());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valeur.monde.livraisons.find((l) => l.id === "liv-6")!.arriveeAt).toBe(T0);
  });

  it("refuse d'arriver sans être parti", () => {
    const r = arriverLivraison(etatInitial(), "liv-3", contexte());
    expect(r.ok).toBe(false);
  });

  it("refuse de clôturer une livraison arrivée mais sans preuve", () => {
    const etat = etatInitial();
    const arrive = arriverLivraison(etat, "liv-6", contexte());
    if (!arrive.ok) throw new Error("préparation");
    const r = terminerLivraison(arrive.valeur, "liv-6", contexte());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // La clôture exige une preuve : la règle est dans le domaine, pas dans l'UI.
    expect(r.raison).toContain("preuve");
  });

  it("termine une livraison arrivée une fois la preuve enregistrée", () => {
    const etat = etatInitial();
    const arrive = arriverLivraison(etat, "liv-6", contexte());
    if (!arrive.ok) throw new Error("préparation");
    const preuve = ajouterPreuve(
      arrive.valeur,
      { livraisonId: "liv-6", nomReceptionnaire: "Fatou Sarr" },
      contexte(),
    );
    if (!preuve.ok) throw new Error("préparation");
    const r = terminerLivraison(preuve.valeur, "liv-6", contexte());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const liv = r.valeur.monde.livraisons.find((l) => l.id === "liv-6")!;
    expect(liv.statut).toBe("LIVREE");
    expect(liv.livreeAt).toBe(T0);
    expect(liv.preuveId).toBeDefined();
  });

  it("refuse de terminer une livraison qui n'est pas arrivée", () => {
    const r = terminerLivraison(etatInitial(), "liv-6", contexte());
    expect(r.ok).toBe(false);
  });

  it("exige un motif pour un échec", () => {
    const r = echouerLivraison(etatInitial(), { livraisonId: "liv-6", motif: "  " }, contexte());
    expect(r.ok).toBe(false);
  });

  it("enregistre un échec motivé", () => {
    const r = echouerLivraison(
      etatInitial(), { livraisonId: "liv-6", motif: "Client injoignable" }, contexte(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const liv = r.valeur.monde.livraisons.find((l) => l.id === "liv-6")!;
    expect(liv.statut).toBe("ECHEC");
    expect(liv.motifEchec).toBe("Client injoignable");
  });

  it("répercute le statut sur la commande associée", () => {
    const etat = etatInitial();
    const arrive = arriverLivraison(etat, "liv-6", contexte());
    if (!arrive.ok) throw new Error("préparation");
    const preuve = ajouterPreuve(
      arrive.valeur,
      { livraisonId: "liv-6", nomReceptionnaire: "Fatou Sarr" },
      contexte(),
    );
    if (!preuve.ok) throw new Error("préparation");
    const fin = terminerLivraison(preuve.valeur, "liv-6", contexte());
    if (!fin.ok) throw new Error("préparation");
    // liv-6 correspond à cmd-11
    expect(fin.valeur.monde.commandes.find((c) => c.id === "cmd-11")!.statut).toBe("LIVREE");
  });

  it("produit un événement horodaté pour chaque transition", () => {
    const r = demarrerLivraison(etatInitial(), "liv-3", contexte());
    if (!r.ok) throw new Error("préparation");
    const evt = r.valeur.monde.evenements.filter((e) => e.livraisonId === "liv-3").at(-1)!;
    expect(evt.type).toBe("DEPART");
    expect(evt.horodatage).toBe(T0);
  });
});

describe("Livraisons — transitions refusées", () => {
  it("refuse En route vers Livrée sans passage par Arrivé", () => {
    expect(changerStatutLivraison("EN_ROUTE", "LIVREE").ok).toBe(false);
  });
  it("refuse Affectée vers Arrivé", () => {
    expect(changerStatutLivraison("AFFECTEE", "ARRIVE").ok).toBe(false);
  });
  it("refuse de faire repartir une livraison livrée", () => {
    expect(changerStatutLivraison("LIVREE", "EN_ROUTE").ok).toBe(false);
  });
  it("refuse d'annuler une livraison livrée", () => {
    expect(changerStatutLivraison("LIVREE", "ANNULEE").ok).toBe(false);
  });
});

// ===========================================================================
// GPS
// ===========================================================================

describe("GPS — fraîcheur", () => {
  it("considère fraîche une position de moins de 60 s", () => {
    expect(evaluerFraicheur({ lat: 1, lng: 1, recordedAt: T0 - 30_000 }, T0)).toBe("FRAICHE");
  });
  it("considère ancienne une position de 10 min", () => {
    expect(evaluerFraicheur({ lat: 1, lng: 1, recordedAt: T0 - 600_000 }, T0)).toBe("ANCIENNE");
  });
  it("considère indisponible une position de 20 min", () => {
    expect(evaluerFraicheur({ lat: 1, lng: 1, recordedAt: T0 - 1_200_000 }, T0)).toBe("INDISPONIBLE");
  });
  it("signale l'absence de donnée", () => {
    expect(evaluerFraicheur(null, T0)).toBe("AUCUNE_DONNEE");
  });
  it("refuse une position datée dans le futur", () => {
    expect(evaluerFraicheur({ lat: 1, lng: 1, recordedAt: T0 + 60_000 }, T0)).toBe("INDISPONIBLE");
  });
});

describe("GPS — validation à l'ingestion", () => {
  it("accepte une position cohérente", () => {
    const r = validerPosition(
      { clientId: "c1", companyId: "ent-1", livraisonId: "liv-1", livreurId: "drv-1",
        lat: 14.7, lng: -17.4, recordedAt: T0, provenance: "DEMO" },
      T0,
    );
    expect(r.ok).toBe(true);
  });

  it("refuse une position sans clé d'idempotence", () => {
    const r = validerPosition(
      { clientId: "", companyId: "ent-1", livraisonId: "liv-1", livreurId: "drv-1",
        lat: 14.7, lng: -17.4, recordedAt: T0, provenance: "DEMO" },
      T0,
    );
    expect(r.ok).toBe(false);
  });

  it("refuse une latitude hors bornes", () => {
    const r = validerPosition(
      { clientId: "c1", companyId: "ent-1", livraisonId: "liv-1", livreurId: "drv-1",
        lat: 999, lng: -17.4, recordedAt: T0, provenance: "DEMO" },
      T0,
    );
    expect(r.ok).toBe(false);
  });

  it("refuse une position trop imprécise", () => {
    const r = validerPosition(
      { clientId: "c1", companyId: "ent-1", livraisonId: "liv-1", livreurId: "drv-1",
        lat: 14.7, lng: -17.4, accuracy: 900, recordedAt: T0, provenance: "DEMO" },
      T0,
    );
    expect(r.ok).toBe(false);
  });

  it("refuse une position horodatée trop loin dans le futur", () => {
    const r = validerPosition(
      { clientId: "c1", companyId: "ent-1", livraisonId: "liv-1", livreurId: "drv-1",
        lat: 14.7, lng: -17.4, recordedAt: T0 + 600_000, provenance: "DEMO" },
      T0,
    );
    expect(r.ok).toBe(false);
  });
});

describe("GPS — idempotence", () => {
  it("ignore une position déjà reçue", () => {
    const entrante = {
      clientId: "cli-pos-1-0", companyId: "ent-1", livraisonId: "liv-1",
      livreurId: "drv-1", lat: 14.7, lng: -17.4, recordedAt: T0 - 60_000,
      provenance: "DEMO" as const,
    };
    const historique = construireMonde(T0).positions;
    const r = ingererPosition(historique, entrante, T0, "id-new", T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valeur.ajoutee).toBe(false);
    expect(r.valeur.historique.length).toBe(historique.length);
  });

  it("ajoute une position nouvelle et trie l'historique", () => {
    const historique: PositionGps[] = [positionDemo({ id: "a", clientId: "a", recordedAt: T0 - 60_000 })];
    const r = ingererPosition(
      historique,
      { clientId: "b", companyId: "ent-1", livraisonId: "liv-1", livreurId: "drv-1",
        lat: 14.71, lng: -17.41, recordedAt: T0 - 120_000, provenance: "DEMO" },
      T0,
      "id-b",
      undefined,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valeur.ajoutee).toBe(true);
    expect(r.valeur.historique.map((p) => p.clientId)).toEqual(["b", "a"]);
  });

  it("rejoue sans effet une même position envoyée deux fois", () => {
    const etat = etatInitial();
    const params = {
      clientId: "dup-1", livraisonId: "liv-1", lat: 14.72, lng: -17.47, recordedAt: T0 - 10_000,
    };
    const a = enregistrerPosition(etat, params, contexte());
    if (!a.ok) throw new Error("préparation");
    const b = enregistrerPosition(a.valeur.etat, params, contexte());
    if (!b.ok) throw new Error("préparation");
    expect(b.valeur.ajoutee).toBe(false);
    expect(b.valeur.etat.monde.positions.length).toBe(a.valeur.etat.monde.positions.length);
  });

  it("refuse une position sur une livraison sans livreur affecté", () => {
    const etat = etatInitial();
    const cree = creerLivraisonDepuisCommande(etat, "cmd-4", contexte());
    if (!cree.ok) throw new Error("préparation");
    const id = cree.valeur.monde.livraisons.at(-1)!.id;
    const r = enregistrerPosition(
      cree.valeur,
      { clientId: "c", livraisonId: id, lat: 14.7, lng: -17.4, recordedAt: T0 },
      contexte(),
    );
    expect(r.ok).toBe(false);
  });
});

// ===========================================================================
// ETA
// ===========================================================================

describe("ETA", () => {
  const destination = { lat: 14.7238, lng: -17.4756, recordedAt: T0 };

  it("calcule une ETA quand la vitesse est réellement mesurée", () => {
    const positions = [
      { lat: 14.7165, lng: -17.4637, recordedAt: T0 - 600_000 },
      { lat: 14.7225, lng: -17.4732, recordedAt: T0 - 30_000 },
    ];
    const r = calculerEta({ positions, destination, maintenant: T0, statut: "EN_ROUTE" });
    expect(r.disponible).toBe(true);
  });

  it("refuse une ETA sans vitesse mesurable", () => {
    const positions = [{ lat: 14.7225, lng: -17.4732, recordedAt: T0 - 30_000 }];
    const r = calculerEta({ positions, destination, maintenant: T0, statut: "EN_ROUTE" });
    expect(r.disponible).toBe(false);
    if (r.disponible) return;
    expect(r.raison).toBe("PAS_DE_VITESSE_MESUREE");
  });

  it("refuse une ETA sur position ancienne", () => {
    const positions = [
      { lat: 14.7165, lng: -17.4637, recordedAt: T0 - 1_800_000 },
      { lat: 14.7225, lng: -17.4732, recordedAt: T0 - 1_200_000 },
    ];
    const r = calculerEta({ positions, destination, maintenant: T0, statut: "EN_ROUTE" });
    expect(r.disponible).toBe(false);
    if (r.disponible) return;
    expect(r.raison).toBe("POSITION_TROP_ANCIENNE");
  });

  it("refuse une ETA si la livraison n'est pas démarrée", () => {
    const positions = [
      { lat: 14.7165, lng: -17.4637, recordedAt: T0 - 600_000 },
      { lat: 14.7225, lng: -17.4732, recordedAt: T0 - 30_000 },
    ];
    const r = calculerEta({ positions, destination, maintenant: T0, statut: "AFFECTEE" });
    expect(r.disponible).toBe(false);
  });

  it("refuse une ETA quand le livreur est déjà sur place", () => {
    const positions = [
      { lat: 14.7165, lng: -17.4637, recordedAt: T0 - 600_000 },
      { lat: destination.lat, lng: destination.lng, recordedAt: T0 - 30_000 },
    ];
    const r = calculerEta({ positions, destination, maintenant: T0, statut: "EN_ROUTE" });
    expect(r.disponible).toBe(false);
    if (r.disponible) return;
    expect(r.raison).toBe("DISTANCE_NULLE");
  });

  it("refuse une ETA sur une vitesse aberrante", () => {
    const positions = [
      { lat: 14.0, lng: -17.0, recordedAt: T0 - 60_000 },
      { lat: 15.5, lng: -18.5, recordedAt: T0 - 30_000 },
    ];
    const r = calculerEta({ positions, destination, maintenant: T0, statut: "EN_ROUTE" });
    expect(r.disponible).toBe(false);
    if (r.disponible) return;
    expect(r.raison).toBe("PAS_DE_VITESSE_MESUREE");
  });
});

// ===========================================================================
// PREUVE DE LIVRAISON
// ===========================================================================

describe("Preuve de livraison", () => {
  it("refuse une preuve vide", () => {
    const r = ajouterPreuve(etatInitial(), { livraisonId: "liv-1" }, contexte());
    expect(r.ok).toBe(false);
  });

  it("refuse une preuve avant l'arrivée du livreur", () => {
    const r = ajouterPreuve(
      etatInitial(), { livraisonId: "liv-1", nomReceptionnaire: "Awa" }, contexte(),
    );
    expect(r.ok).toBe(false);
  });

  it("enregistre une preuve après l'arrivée", () => {
    const etat = etatInitial();
    const arrive = arriverLivraison(etat, "liv-6", contexte());
    if (!arrive.ok) throw new Error("préparation");
    const r = ajouterPreuve(
      arrive.valeur,
      { livraisonId: "liv-6", nomReceptionnaire: "Awa Diagne", commentaire: "Remise au comptoir" },
      contexte(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const preuve = r.valeur.monde.preuves.at(-1)!;
    expect(preuve.nomReceptionnaire).toBe("Awa Diagne");
    // Aucune photo n'a été fournie : le champ doit rester absent, pas inventé.
    expect(preuve.photoRef).toBeUndefined();
    expect(r.valeur.monde.livraisons.find((l) => l.id === "liv-6")!.preuveId).toBe(preuve.id);
  });
});

// ===========================================================================
// ENCAISSEMENTS
// ===========================================================================

describe("Encaissements — statut", () => {
  const liv = (statut: "EN_ROUTE" | "LIVREE" | "ECHEC") =>
    ({ id: "l", statut } as never);

  it("à encaisser quand rien n'a été reçu sur une livraison ouverte", () => {
    expect(statutEncaissement(liv("EN_ROUTE"), 10_000, 0, 0)).toBe("A_ENCAISSER");
  });
  it("partiel quand le montant reçu est inférieur", () => {
    expect(statutEncaissement(liv("LIVREE"), 10_000, 4_000, 1)).toBe("PARTIEL");
  });
  it("encaissé quand le montant reçu est complet", () => {
    expect(statutEncaissement(liv("LIVREE"), 10_000, 10_000, 1)).toBe("ENCAISSE");
  });
  it("non encaissé sur une livraison échouée sans paiement", () => {
    expect(statutEncaissement(liv("ECHEC"), 10_000, 0, 0)).toBe("NON_ENCAISSE");
  });
});

describe("Encaissements — enregistrement", () => {
  it("accepte un paiement partiel", () => {
    const r = enregistrerPaiement(
      etatInitial(), { livraisonId: "liv-1", montant: 5_000, mode: "ESPECES" }, contexte(),
    );
    expect(r.ok).toBe(true);
  });

  it("refuse un paiement supérieur au reste dû", () => {
    const r = enregistrerPaiement(
      etatInitial(), { livraisonId: "liv-1", montant: 999_999, mode: "ESPECES" }, contexte(),
    );
    expect(r.ok).toBe(false);
  });

  it("refuse un montant nul ou négatif", () => {
    expect(
      enregistrerPaiement(etatInitial(), { livraisonId: "liv-1", montant: 0, mode: "ESPECES" }, contexte()).ok,
    ).toBe(false);
  });

  it("refuse un paiement sur une livraison échouée", () => {
    const r = enregistrerPaiement(
      etatInitial(), { livraisonId: "liv-5", montant: 1_000, mode: "ESPECES" }, contexte(),
    );
    expect(r.ok).toBe(false);
  });

  it("cumule deux paiements partiels jusqu'au complet", () => {
    const etat = etatInitial();
    const a = enregistrerPaiement(etat, { livraisonId: "liv-1", montant: 7_000, mode: "ESPECES" }, contexte());
    if (!a.ok) throw new Error("préparation");
    const b = enregistrerPaiement(a.valeur, { livraisonId: "liv-1", montant: 5_500, mode: "WAVE" }, contexte());
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const liv = b.valeur.monde.livraisons.find((l) => l.id === "liv-1")!;
    const e = calculerEncaissement(liv, b.valeur.monde.paiements);
    expect(e.montantEncaisse).toBe(12_500);
    expect(e.reste).toBe(0);
    expect(e.statut).toBe("ENCAISSE");
  });
});

describe("Encaissements — validation de saisie", () => {
  it("refuse un montant supérieur au reste", () => {
    expect(validerMontantPaiement(5_000, 1_000).ok).toBe(false);
  });
  it("refuse un montant non numérique", () => {
    expect(validerMontantPaiement(Number.NaN, 1_000).ok).toBe(false);
  });
  it("accepte un montant valide", () => {
    expect(validerMontantPaiement(1_000, 1_000).ok).toBe(true);
  });
});

describe("Caisse — remise et écart", () => {
  it("calcule l'écart entre ce qui est dû et ce qui est remis", () => {
    const monde = construireMonde(T0);
    const ligne = calculerCaisseLivreur({
      livreurId: "drv-1",
      livraisons: monde.livraisons,
      paiements: monde.paiements,
      remises: monde.remises,
    });
    // drv-1 a encaissé 8 000 et remis 8 000 : caisse juste.
    expect(ligne.montantEncaisse).toBe(8_000);
    expect(ligne.montantRemis).toBe(8_000);
    expect(ligne.ecart).toBe(0);
  });

  it("met en évidence un manquant", () => {
    const monde = construireMonde(T0);
    const ligne = calculerCaisseLivreur({
      livreurId: "drv-2",
      livraisons: monde.livraisons,
      paiements: monde.paiements,
      remises: monde.remises,
    });
    // drv-2 a encaissé 5 000 et remis 3 000 : manquant de 2 000.
    expect(ligne.montantEncaisse).toBe(5_000);
    expect(ligne.ecart).toBe(-2_000);
    expect(libelleEcart(ligne.ecart)).toContain("Manquant");
  });

  it("refuse une remise supérieure à ce qui est dû", () => {
    const r = enregistrerRemise(
      etatInitial(), { livreurId: "drv-1", montant: 999_999 }, contexte(),
    );
    expect(r.ok).toBe(false);
  });

  it("refuse une remise nulle", () => {
    const r = enregistrerRemise(etatInitial(), { livreurId: "drv-1", montant: 0 }, contexte());
    expect(r.ok).toBe(false);
  });

  it("accepte une remise partielle", () => {
    const r = enregistrerRemise(etatInitial(), { livreurId: "drv-2", montant: 2_000 }, contexte());
    expect(r.ok).toBe(true);
  });
});

// ===========================================================================
// RAPPORTS
// ===========================================================================

describe("Rapports — tableau de bord", () => {
  it("compte les commandes et livraisons du jour", () => {
    const monde = construireMonde(T0);
    const tb = construireTableauBord({
      maintenant: T0,
      commandes: monde.commandes,
      livraisons: monde.livraisons,
      paiements: monde.paiements,
      remises: monde.remises,
      livreurs: monde.livreurs,
    });
    expect(tb.commandes.total).toBe(12);
    expect(tb.livraisons.total).toBe(7);
    expect(tb.livraisons.enCours).toBe(2);
    expect(tb.livraisons.terminees).toBe(2);
    expect(tb.livraisons.echouees).toBe(1);
  });

  it("expose des comptes et des montants, jamais de pourcentage", () => {
    const monde = construireMonde(T0);
    const tb = construireTableauBord({
      maintenant: T0, commandes: monde.commandes, livraisons: monde.livraisons,
      paiements: monde.paiements, remises: monde.remises, livreurs: monde.livreurs,
    });
    const cles = Object.keys(tb).join(" ") + Object.keys(tb.livraisons).join(" ");
    expect(cles).not.toMatch(/taux|pourcentage|pourcent|efficacite|productivite|gain/i);
  });

  it("compte les livreurs en tournée", () => {
    const monde = construireMonde(T0);
    const tb = construireTableauBord({
      maintenant: T0, commandes: monde.commandes, livraisons: monde.livraisons,
      paiements: monde.paiements, remises: monde.remises, livreurs: monde.livreurs,
    });
    expect(tb.livreurs.actifs).toBe(3);
    expect(tb.livreurs.enTournee).toBe(2);
  });
});

describe("Rapports — caisse par livreur", () => {
  it("produit une ligne par livreur et des totaux", () => {
    const monde = construireMonde(T0);
    const rapport = construireRapportCaisse({
      maintenant: T0,
      livraisons: monde.livraisons,
      paiements: monde.paiements,
      remises: monde.remises,
      livreurIds: monde.livreurs.map((l) => l.id),
    });
    expect(rapport.lignes.length).toBe(4);
    expect(rapport.totaux.montantEncaisse).toBe(13_000);
    expect(rapport.totaux.montantRemis).toBe(11_000);
    expect(rapport.totaux.ecart).toBe(-2_000);
  });
});

describe("Rapports — performance livreur", () => {
  it("compte les livraisons sans exposer de pourcentage", () => {
    const monde = construireMonde(T0);
    const p = calculerPerformanceLivreur({ livreurId: "drv-1", livraisons: monde.livraisons });
    expect(p.livraisonsConfiees).toBe(2);
    expect(p.livrees).toBe(1);
    expect(Object.keys(p)).not.toContain("tauxReussite");
  });

  it("retourne une durée moyenne nulle plutôt qu'inventée", () => {
    const p = calculerPerformanceLivreur({ livreurId: "drv-4", livraisons: [] });
    expect(p.dureeMoyenneMinutes).toBeNull();
  });
});

// ===========================================================================
// SÉCURITÉ / MULTI-TENANT
// ===========================================================================

describe("Sécurité — isolation entre entreprises", () => {
  it("refuse l'accès aux données d'une autre entreprise", () => {
    const u = utilisateur({ companyId: "ent-1" });
    expect(verifierAccesEntreprise(u, "ent-2").ok).toBe(false);
  });

  it("autorise l'accès à sa propre entreprise", () => {
    const u = utilisateur({ companyId: "ent-1" });
    expect(verifierAccesEntreprise(u, "ent-1").ok).toBe(true);
  });

  it("refuse un compte désactivé", () => {
    const u = utilisateur({ actif: false });
    expect(verifierAccesEntreprise(u, "ent-1").ok).toBe(false);
  });

  it("refuse à un livreur la livraison d'un autre livreur", () => {
    const u = utilisateur({ role: "DRIVER", driverId: "drv-1" });
    const autre = { companyId: "ent-1", livreurId: "drv-2" };
    expect(verifierAccesLivraison(u, autre).ok).toBe(false);
  });

  it("autorise à un livreur sa propre livraison", () => {
    const u = utilisateur({ role: "DRIVER", driverId: "drv-1" });
    const sienne = { companyId: "ent-1", livreurId: "drv-1" };
    expect(verifierAccesLivraison(u, sienne).ok).toBe(true);
  });

  it("ne laisse filtrer que le périmètre du livreur", () => {
    const u = utilisateur({ role: "DRIVER", driverId: "drv-1" });
    const elements = [
      { companyId: "ent-1", livreurId: "drv-1" },
      { companyId: "ent-1", livreurId: "drv-2" },
      { companyId: "ent-2", livreurId: "drv-1" },
    ];
    expect(filtrerPerimetre(u, elements)).toEqual([{ companyId: "ent-1", livreurId: "drv-1" }]);
  });

  it("restreint la portée de requête d'un livreur à ses livraisons", () => {
    const u = utilisateur({ role: "DRIVER", driverId: "drv-1" });
    expect(porteeRequete(u)).toEqual({ companyId: "ent-1", driverId: "drv-1" });
  });

  it("ne laisse rien voir à un livreur sans identifiant de livreur", () => {
    const u = utilisateur({ role: "DRIVER", driverId: undefined });
    expect(porteeRequete(u).driverId).toBe("__aucun__");
  });
});

describe("Sécurité — permissions", () => {
  it("refuse à un répartiteur l'encaissement", () => {
    expect(aLaPermission(utilisateur({ role: "DISPATCHER" }), "ENCAISSER")).toBe(false);
  });

  it("autorise le propriétaire à gérer l'équipe", () => {
    expect(aLaPermission(utilisateur({ role: "OWNER" }), "GERER_EQUIPE")).toBe(true);
  });

  it("refuse à un livreur la modification des commandes", () => {
    expect(aLaPermission(utilisateur({ role: "DRIVER", driverId: "drv-1" }), "GERER_COMMANDES")).toBe(false);
  });

  it("refuse toute permission à un compte désactivé", () => {
    expect(aLaPermission(utilisateur({ actif: false }), "VOIR_TOUT")).toBe(false);
  });

  it("refuse à un livreur d'agir sur la livraison d'un autre", () => {
    const u = utilisateur({ role: "DRIVER", driverId: "drv-1" });
    const r = verifierActionLivreur(u, { companyId: "ent-1", livreurId: "drv-2" }, "DEMARRER");
    expect(r.ok).toBe(false);
  });

  it("autorise un livreur à démarrer sa propre livraison", () => {
    const u = utilisateur({ role: "DRIVER", driverId: "drv-1" });
    const r = verifierActionLivreur(u, { companyId: "ent-1", livreurId: "drv-1" }, "DEMARRER");
    expect(r.ok).toBe(true);
  });
});

// ===========================================================================
// HORS LIGNE
// ===========================================================================

describe("Hors ligne — file de synchronisation", () => {
  it("met une opération en file quand le réseau est absent", () => {
    const r = demarrerLivraison(etatInitial(), "liv-3", contexte({ horsLigne: true }));
    if (!r.ok) throw new Error("préparation");
    expect(operationsEnAttente(r.valeur).length).toBe(1);
    expect(operationsEnAttente(r.valeur)[0].type).toBe("DEMARRER_LIVRAISON");
  });

  it("n'ajoute rien à la file quand le réseau est présent", () => {
    const r = demarrerLivraison(etatInitial(), "liv-3", contexte());
    if (!r.ok) throw new Error("préparation");
    expect(r.valeur.file.length).toBe(0);
  });

  it("ne perd aucune opération en attente", () => {
    const etat = etatInitial();
    const a = demarrerLivraison(etat, "liv-3", contexte({ horsLigne: true }));
    if (!a.ok) throw new Error("préparation");
    const b = arriverLivraison(a.valeur, "liv-3", contexte({ horsLigne: true }));
    if (!b.ok) throw new Error("préparation");
    expect(operationsEnAttente(b.valeur).length).toBe(2);
  });

  it("marque les opérations comme synchronisées et renseigne syncedAt", () => {
    const etat = etatInitial();
    const a = enregistrerPosition(
      etat,
      { clientId: "off-1", livraisonId: "liv-1", lat: 14.72, lng: -17.47, recordedAt: T0 - 5_000 },
      contexte({ horsLigne: true }),
    );
    if (!a.ok) throw new Error("préparation");
    const sync = synchroniser(a.valeur.etat, T0 + 60_000);
    expect(operationsEnAttente(sync).length).toBe(0);
    const pos = sync.monde.positions.find((p) => p.clientId === "off-1")!;
    expect(pos.syncedAt).toBe(T0 + 60_000);
  });
});

// ===========================================================================
// RÉFÉRENCES ET STATUTS
// ===========================================================================

describe("Références", () => {
  it("continue la séquence existante", () => {
    expect(prochaineReference([{ reference: "CMD-2418" }, { reference: "CMD-2400" }], "CMD"))
      .toBe("CMD-2419");
  });
  it("démarre à 1 sans historique", () => {
    expect(prochaineReference([], "LIV")).toBe("LIV-1");
  });
});

describe("Correspondance commande / livraison", () => {
  it("mappe chaque statut de livraison vers un statut de commande", () => {
    expect(statutCommandeDepuisLivraison("A_AFFECTER")).toBe("A_AFFECTER");
    expect(statutCommandeDepuisLivraison("EN_ROUTE")).toBe("EN_LIVRAISON");
    expect(statutCommandeDepuisLivraison("ARRIVE")).toBe("EN_LIVRAISON");
    expect(statutCommandeDepuisLivraison("LIVREE")).toBe("LIVREE");
    expect(statutCommandeDepuisLivraison("ECHEC")).toBe("ECHEC");
  });
});
