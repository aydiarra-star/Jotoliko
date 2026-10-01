// Tests de la caisse, du pilotage de la journée et de l'explication des écarts.
//
// Ces tests portent sur les règles, pas sur l'interface. Ils vérifient trois
// choses que le pilote doit garantir :
//
//   1. les montants de la caisse sont déterministes et ne sont jamais inventés ;
//   2. un encaissement reste rattachable à sa livraison et à sa commande ;
//   3. un écart de caisse n'est jamais effacé : il est soit nul, soit expliqué.

import { describe, expect, it } from "vitest";
import {
  calculerCaisseLivreur,
  libelleEcart,
  validerJustificationEcart,
} from "./paiements";
import { construireClotureJournee, construireRapportCaisse } from "./rapports";
import {
  enregistrerPaiement,
  enregistrerRemise,
  justifierEcart,
  reparerEtat,
  type Contexte,
  type EtatApplication,
} from "./operations";
import { construireMonde } from "./donnees-demo";
import type { Livraison, Paiement, Remise } from "./types";

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

function livraison(overrides: Partial<Livraison> = {}): Livraison {
  return {
    id: "liv-x", companyId: "ent-1", reference: "LIV-X", commandeId: "cmd-x",
    clientId: "cli-x", adresse: { ligne: "x", zone: "x", ville: "Dakar" },
    destination: { lat: 14.7, lng: -17.4 }, livreurId: "drv-1",
    statut: "LIVREE", montantAttendu: 10000, createdAt: T0, updatedAt: T0,
    provenance: "DEMO", ...overrides,
  };
}

function paiement(overrides: Partial<Paiement> = {}): Paiement {
  return {
    id: "pay-x", companyId: "ent-1", livraisonId: "liv-x", commandeId: "cmd-x",
    livreurId: "drv-1", montant: 10000, mode: "ESPECES", recordedAt: T0,
    clientId: "c-pay-x", provenance: "DEMO", ...overrides,
  };
}

function remise(overrides: Partial<Remise> = {}): Remise {
  return {
    id: "rem-x", companyId: "ent-1", livreurId: "drv-1", montant: 10000,
    recordedAt: T0, provenance: "DEMO", ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Les cinq montants que le responsable doit lire d'un coup d'œil
// ---------------------------------------------------------------------------

describe("Caisse d'un livreur — attendu, encaissé, à remettre, remis, écart", () => {
  it("expose les cinq montants demandés par le responsable", () => {
    const ligne = calculerCaisseLivreur({
      livreurId: "drv-1",
      livraisons: [livraison({ montantAttendu: 10000 })],
      paiements: [paiement({ montant: 10000 })],
      remises: [remise({ montant: 6000 })],
    });

    expect(ligne.montantAttendu).toBe(10000);
    expect(ligne.montantEncaisse).toBe(10000);
    expect(ligne.montantARemettre).toBe(10000);
    expect(ligne.montantRemis).toBe(6000);
    expect(ligne.resteARemettre).toBe(4000);
    expect(ligne.ecart).toBe(-4000);
  });

  it("calcule l'écart comme remis moins encaissé, jamais autrement", () => {
    const ligne = calculerCaisseLivreur({
      livreurId: "drv-1",
      livraisons: [livraison({ montantAttendu: 5000 })],
      paiements: [paiement({ montant: 5000 })],
      remises: [remise({ montant: 5500 })],
    });
    // Excédent : le livreur a remis plus qu'il n'a encaissé.
    expect(ligne.ecart).toBe(500);
    expect(ligne.resteARemettre).toBe(0);
  });

  it("ne compte que les livraisons du livreur concerné", () => {
    const ligne = calculerCaisseLivreur({
      livreurId: "drv-1",
      livraisons: [
        livraison({ id: "liv-a", livreurId: "drv-1", montantAttendu: 3000 }),
        livraison({ id: "liv-b", livreurId: "drv-2", montantAttendu: 9000 }),
      ],
      paiements: [
        paiement({ id: "pay-a", livraisonId: "liv-a", montant: 3000 }),
        paiement({ id: "pay-b", livraisonId: "liv-b", montant: 9000 }),
      ],
      remises: [],
    });
    expect(ligne.montantAttendu).toBe(3000);
    expect(ligne.montantEncaisse).toBe(3000);
  });

  it("n'invente aucun montant : une caisse sans activité vaut zéro", () => {
    const ligne = calculerCaisseLivreur({
      livreurId: "drv-inconnu",
      livraisons: [livraison()],
      paiements: [paiement()],
      remises: [remise()],
    });
    expect(ligne.montantAttendu).toBe(0);
    expect(ligne.montantEncaisse).toBe(0);
    expect(ligne.ecart).toBe(0);
    expect(ligne.ecartJuste).toBe(true);
  });

  it("qualifie l'écart sans le masquer", () => {
    expect(libelleEcart(0)).toBe("Caisse juste");
    expect(libelleEcart(-2000)).toContain("Manquant");
    expect(libelleEcart(2000)).toContain("Excédent");
  });
});

// ---------------------------------------------------------------------------
// Rattachement encaissement → livraison → commande
// ---------------------------------------------------------------------------

describe("Rattachement d'un encaissement à sa livraison", () => {
  it("rattache le paiement à la livraison ET à la commande d'origine", () => {
    const depart = etatInitial();
    // Une livraison livrée qui n'est pas encore soldée : c'est le cas normal
    // d'un encaissement partiel sur le terrain.
    const liv = depart.monde.livraisons.find((l) => {
      if (l.statut !== "LIVREE") return false;
      const deja = depart.monde.paiements
        .filter((p) => p.livraisonId === l.id)
        .reduce((t, p) => t + p.montant, 0);
      return l.montantAttendu - deja > 0;
    });
    expect(liv).toBeDefined();
    if (!liv) return;

    const r = enregistrerPaiement(
      depart,
      { livraisonId: liv.id, montant: 1000, mode: "ESPECES" },
      contexte(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const paye = r.valeur.monde.paiements.at(-1)!;
    expect(paye.livraisonId).toBe(liv.id);
    expect(paye.commandeId).toBe(liv.commandeId);
    // Le livreur est repris de la livraison : le responsable n'a rien à
    // reconstituer à la main.
    expect(paye.livreurId).toBe(liv.livreurId);
  });

  it("refuse un encaissement sur une livraison déjà soldée", () => {
    const depart = etatInitial();
    const liv = depart.monde.livraisons.find((l) => {
      if (l.statut !== "LIVREE") return false;
      const deja = depart.monde.paiements
        .filter((p) => p.livraisonId === l.id)
        .reduce((t, p) => t + p.montant, 0);
      return l.montantAttendu - deja === 0;
    });
    if (!liv) return;
    const r = enregistrerPaiement(
      depart,
      { livraisonId: liv.id, montant: 1000, mode: "ESPECES" },
      contexte(),
    );
    expect(r.ok).toBe(false);
  });

  it("refuse un encaissement sur une livraison échouée", () => {
    const depart = etatInitial();
    const liv = depart.monde.livraisons.find((l) => l.statut === "ECHEC");
    if (!liv) return;
    const r = enregistrerPaiement(
      depart,
      { livraisonId: liv.id, montant: 1000, mode: "ESPECES" },
      contexte(),
    );
    expect(r.ok).toBe(false);
  });

  it("refuse d'encaisser plus que ce qui reste dû", () => {
    const depart = etatInitial();
    const liv = depart.monde.livraisons.find((l) => l.statut === "LIVREE")!;
    const deja = depart.monde.paiements
      .filter((p) => p.livraisonId === liv.id)
      .reduce((t, p) => t + p.montant, 0);
    const trop = liv.montantAttendu - deja + 1;
    const r = enregistrerPaiement(
      depart,
      { livraisonId: liv.id, montant: trop, mode: "ESPECES" },
      contexte(),
    );
    expect(r.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Écart : jamais silencieux
// ---------------------------------------------------------------------------

describe("Écart de caisse — jamais silencieusement ignoré", () => {
  it("détecte un écart non expliqué", () => {
    const rapport = construireRapportCaisse({
      maintenant: T0,
      livraisons: [livraison({ montantAttendu: 10000 })],
      paiements: [paiement({ montant: 10000 })],
      remises: [remise({ montant: 7000 })],
      livreurIds: ["drv-1"],
    });
    expect(rapport.ecarts.nombre).toBe(1);
    expect(rapport.ecarts.nonExpliques).toHaveLength(1);
    expect(rapport.ecarts.expliques).toHaveLength(0);
  });

  it("marque l'écart comme expliqué dès qu'une justification existe", () => {
    const rapport = construireRapportCaisse({
      maintenant: T0,
      livraisons: [livraison({ montantAttendu: 10000 })],
      paiements: [paiement({ montant: 10000 })],
      remises: [remise({ montant: 7000 })],
      livreurIds: ["drv-1"],
      justifications: [
        {
          id: "jus-1", companyId: "ent-1", livreurId: "drv-1",
          journee: new Date(T0).setHours(0, 0, 0, 0),
          ecart: -3000, commentaire: "Client absent, à récupérer demain.",
          createdAt: T0, provenance: "DEMO",
        },
      ],
    });
    expect(rapport.ecarts.nonExpliques).toHaveLength(0);
    expect(rapport.ecarts.expliques).toHaveLength(1);
    // L'écart reste visible : il est expliqué, pas effacé.
    expect(rapport.ecarts.expliques[0].ecart).toBe(-3000);
  });

  it("enregistre l'explication et laisse une ligne d'audit", () => {
    // Une caisse en manquant : le livreur a encaissé mais n'a remis qu'une
    // partie. C'est précisément le cas que l'explication doit documenter.
    const monde = construireMonde(T0);
    const avecEcart: EtatApplication = {
      ...etatInitial(),
      monde: {
        ...monde,
        livraisons: [livraison({ id: "liv-caisse", montantAttendu: 10000 })],
        paiements: [paiement({ id: "pay-caisse", livraisonId: "liv-caisse", montant: 10000 })],
        remises: [remise({ id: "rem-caisse", montant: 7000 })],
        justifications: [],
        audits: [],
      },
    };

    const r = justifierEcart(
      avecEcart,
      { livreurId: "drv-1", commentaire: "Manquant constaté, à régulariser." },
      contexte(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valeur.monde.justifications).toHaveLength(1);
    expect(r.valeur.monde.justifications[0].ecart).toBe(-3000);
    expect(r.valeur.monde.audits).toHaveLength(1);
    expect(r.valeur.monde.audits[0].action).toBe("ECART_JUSTIFIE");
  });

  it("refuse une explication vide ou trop courte", () => {
    expect(validerJustificationEcart("").ok).toBe(false);
    expect(validerJustificationEcart("ok").ok).toBe(false);
    expect(validerJustificationEcart("Manquant constaté.").ok).toBe(true);
  });

  it("refuse d'expliquer un écart là où la caisse est juste", () => {
    // Une caisse juste n'a rien à expliquer : accepter une justification
    // laisserait croire à un problème qui n'existe pas.
    const monde = construireMonde(T0);
    const sansEcart: EtatApplication = {
      ...etatInitial(),
      monde: {
        ...monde,
        remises: monde.livraisons
          .filter((l) => l.livreurId === "drv-1" && l.statut === "LIVREE")
          .map((l, i) => ({
            id: `rem-juste-${i}`,
            companyId: "ent-1",
            livreurId: "drv-1",
            montant: monde.paiements
              .filter((p) => p.livraisonId === l.id)
              .reduce((t, p) => t + p.montant, 0),
            recordedAt: T0,
            provenance: "DEMO" as const,
          })),
      },
    };
    const r = justifierEcart(
      sansEcart,
      { livreurId: "drv-1", commentaire: "Rien à signaler ici." },
      contexte(),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.raison).toContain("juste");
  });

  it("refuse une remise supérieure à ce qui reste à remettre", () => {
    const depart = etatInitial();
    const r = enregistrerRemise(
      depart,
      { livreurId: depart.monde.livreurs[0].id, montant: 999_999_999 },
      contexte(),
    );
    expect(r.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Clôture de journée
// ---------------------------------------------------------------------------

describe("Clôture de journée", () => {
  it("rassemble les comptes de la journée en une seule vue", () => {
    const monde = construireMonde(T0);
    const cloture = construireClotureJournee({
      maintenant: T0,
      commandes: monde.commandes,
      livraisons: monde.livraisons,
      paiements: monde.paiements,
      remises: monde.remises,
      livreurIds: monde.livreurs.map((l) => l.id),
      justifications: monde.justifications,
    });

    expect(cloture.commandes.total).toBeGreaterThan(0);
    expect(cloture.livraisons.total).toBeGreaterThan(0);
    expect(cloture.caisse.montantAttendu).toBeGreaterThanOrEqual(0);
    // Les totaux sont la somme exacte des lignes : rien n'est inventé.
    const somme = cloture.lignes.reduce((t, l) => t + l.montantEncaisse, 0);
    expect(cloture.caisse.montantEncaisse).toBe(somme);
  });

  it("n'est pas prête tant qu'un écart reste à expliquer", () => {
    const cloture = construireClotureJournee({
      maintenant: T0,
      commandes: [],
      livraisons: [livraison({ montantAttendu: 10000 })],
      paiements: [paiement({ montant: 10000 })],
      remises: [remise({ montant: 4000 })],
      livreurIds: ["drv-1"],
    });
    expect(cloture.prete).toBe(false);
    expect(cloture.ecartsAExpliquer).toBe(1);
  });

  it("est prête quand toutes les caisses sont justes", () => {
    const cloture = construireClotureJournee({
      maintenant: T0,
      commandes: [],
      livraisons: [livraison({ montantAttendu: 10000 })],
      paiements: [paiement({ montant: 10000 })],
      remises: [remise({ montant: 10000 })],
      livreurIds: ["drv-1"],
    });
    expect(cloture.prete).toBe(true);
    expect(cloture.ecartsAExpliquer).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Reprise d'un état enregistré par une version antérieure
// ---------------------------------------------------------------------------

describe("Reprise d'un état enregistré", () => {
  it("complète par du vide les collections absentes, sans rien inventer", () => {
    // Un état enregistré avant l'arrivée des justifications : le code plus
    // récent doit pouvoir le lire sans planter et sans ajouter de faux
    // mouvements d'argent.
    const ancien = etatInitial();
    const mondeSansJustifications = { ...ancien.monde } as Record<string, unknown>;
    delete mondeSansJustifications.justifications;
    delete mondeSansJustifications.audits;

    const repare = reparerEtat({
      ...ancien,
      monde: mondeSansJustifications as unknown as EtatApplication["monde"],
    });

    expect(repere(repare)).toEqual({ justifications: 0, audits: 0 });
    // Le reste de l'état est intact.
    expect(repare.monde.commandes).toBe(ancien.monde.commandes);
    expect(repare.monde.paiements).toBe(ancien.monde.paiements);
  });

  it("laisse intact un état déjà complet", () => {
    const complet = etatInitial();
    const repare = reparerEtat(complet);
    // Aucune donnée n'est ajoutée, retirée ni modifiée.
    expect(repare.monde).toEqual(complet.monde);
    expect(repare.file).toEqual(complet.file);
    expect(repare.enLigne).toBe(complet.enLigne);
  });

  it("permet d'expliquer un écart sur un état restauré", () => {
    // Le scénario réel : l'utilisateur avait des données enregistrées, la
    // nouvelle version ajoute l'explication d'écart, et le bouton doit marcher.
    const monde = construireMonde(T0);
    const sansNouvellesCollections = { ...monde } as Record<string, unknown>;
    delete sansNouvellesCollections.justifications;
    delete sansNouvellesCollections.audits;
    const restaure = reparerEtat({
      ...etatInitial(),
      monde: {
        ...(sansNouvellesCollections as unknown as EtatApplication["monde"]),
        livraisons: [livraison({ id: "liv-r", montantAttendu: 10000 })],
        paiements: [paiement({ id: "pay-r", livraisonId: "liv-r", montant: 10000 })],
        remises: [remise({ id: "rem-r", montant: 6000 })],
      },
    });

    const r = justifierEcart(
      restaure,
      { livreurId: "drv-1", commentaire: "Reliquat à récupérer demain." },
      contexte(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valeur.monde.justifications).toHaveLength(1);
  });
});

function repere(etat: EtatApplication) {
  return {
    justifications: etat.monde.justifications.length,
    audits: etat.monde.audits.length,
  };
}
