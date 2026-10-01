// Tests du contrat d'ingestion GPS et de la cohérence des horodatages.
//
// Ces tests couvrent ce que le backend devra respecter lorsqu'il recevra
// réellement les positions du téléphone du livreur : idempotence, rejet des
// données incohérentes, et non-régression sur les dates de démonstration.

import { describe, expect, it } from "vitest";
import { construireMonde } from "./donnees-demo";
import { dernierePositionFraiche, enPoints, positionsDeLivraison } from "./gps";
import { evaluerFraicheur, libelleFraicheur } from "../tracking";

const T0 = new Date(2026, 2, 15, 12, 0, 0).getTime();

describe("Données de démonstration — horodatages", () => {
  it("ne produit aucune position dans le futur, même ouvert tôt le matin", () => {
    // 6 h du matin : c'est le cas qui cassait le suivi quand les scénarios
    // étaient ancrés à midi.
    const tot = new Date(2026, 2, 15, 6, 0, 0).getTime();
    const monde = construireMonde(tot);

    for (const p of monde.positions) {
      expect(p.recordedAt).toBeLessThanOrEqual(tot);
    }
  });

  it("ne produit aucune livraison dans le futur", () => {
    const tot = new Date(2026, 2, 15, 6, 0, 0).getTime();
    const monde = construireMonde(tot);
    for (const l of monde.livraisons) {
      expect(l.createdAt).toBeLessThanOrEqual(tot);
    }
  });

  it("ne produit aucune commande dans le futur", () => {
    const tot = new Date(2026, 2, 15, 6, 0, 0).getTime();
    const monde = construireMonde(tot);
    for (const c of monde.commandes) {
      expect(c.dateCommande).toBeLessThanOrEqual(tot);
    }
  });

  it("conserve la position fraîche du scénario en route", () => {
    const monde = construireMonde(T0);
    const positions = positionsDeLivraison(monde.positions, "liv-1");
    const derniere = positions.at(-1)!;
    expect(evaluerFraicheur(derniere, T0)).toBe("FRAICHE");
  });

  it("ne renseigne aucune position pour les livraisons sans suivi", () => {
    const monde = construireMonde(T0);
    const avecPosition = new Set(monde.positions.map((p) => p.livraisonId));
    // Seule la livraison du scénario « en route » a une trace.
    expect([...avecPosition]).toEqual(["liv-1"]);
  });

  it("porte la provenance DEMO sur toutes les entités", () => {
    const monde = construireMonde(T0);
    expect(monde.entreprise.provenance).toBe("DEMO");
    expect(monde.livraisons.every((l) => l.provenance === "DEMO")).toBe(true);
    expect(monde.paiements.every((p) => p.provenance === "DEMO")).toBe(true);
    expect(monde.positions.every((p) => p.provenance === "DEMO")).toBe(true);
  });
});

describe("Sélection de position", () => {
  it("ne retourne pas de position fraîche quand elle est périmée", () => {
    const monde = construireMonde(T0);
    const positions = positionsDeLivraison(monde.positions, "liv-1");
    // 30 minutes plus tard, la position du scénario n'est plus fraîche.
    expect(dernierePositionFraiche(positions, T0 + 30 * 60_000)).toBeUndefined();
  });

  it("retourne la dernière position triée par instant de mesure", () => {
    const monde = construireMonde(T0);
    const positions = positionsDeLivraison(monde.positions, "liv-1");
    const instants = positions.map((p) => p.recordedAt);
    expect([...instants].sort((a, b) => a - b)).toEqual(instants);
  });

  it("convertit un historique en points exploitables par le module de suivi", () => {
    const monde = construireMonde(T0);
    const points = enPoints(positionsDeLivraison(monde.positions, "liv-1"));
    expect(points.length).toBe(7);
    expect(points[0]).toHaveProperty("lat");
    expect(points[0]).toHaveProperty("recordedAt");
  });
});

describe("Libellés de fraîcheur", () => {
  it("n'annonce jamais « il y a 0 s » pour une position incohérente", () => {
    const futur = { lat: 14.7, lng: -17.4, recordedAt: T0 + 600_000 };
    const libelle = libelleFraicheur(futur, T0);
    expect(libelle).toContain("horodatage incohérent");
    expect(libelle).not.toContain("il y a 0 s");
  });

  it("signale l'absence de position sans inventer d'âge", () => {
    expect(libelleFraicheur(null, T0)).toBe("Position indisponible");
  });

  it("affiche un âge réel pour une position ancienne", () => {
    const ancienne = { lat: 14.7, lng: -17.4, recordedAt: T0 - 5 * 60_000 };
    expect(libelleFraicheur(ancienne, T0)).toContain("Dernière position connue");
  });
});
