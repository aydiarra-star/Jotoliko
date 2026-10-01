import { describe, expect, it } from "vitest";
import {
  calculerEta,
  calculerLigneCaisse,
  distanceKm,
  evaluerFraicheur,
  formaterAge,
  libelleEta,
  libelleFraicheur,
  messageStatut,
  progression,
  statutPaiement,
  vitesseMesuree,
  type Point,
} from "./tracking";

const T = 1_700_000_000_000; // instant de référence
const DAKAR = { lat: 14.6928, lng: -17.4467 };

function pt(lat: number, lng: number, ageMs: number): Point {
  return { lat, lng, recordedAt: T - ageMs };
}

describe("fraîcheur d'une position", () => {
  it("considère une position de moins d'une minute comme actuelle", () => {
    expect(evaluerFraicheur(pt(DAKAR.lat, DAKAR.lng, 8_000), T)).toBe("FRAICHE");
  });

  it("considère une position de plusieurs minutes comme ancienne, pas actuelle", () => {
    expect(evaluerFraicheur(pt(DAKAR.lat, DAKAR.lng, 4 * 60_000), T)).toBe("ANCIENNE");
  });

  it("considère une position de plus de quinze minutes comme indisponible", () => {
    expect(evaluerFraicheur(pt(DAKAR.lat, DAKAR.lng, 30 * 60_000), T)).toBe("INDISPONIBLE");
  });

  it("distingue l'absence totale de donnée", () => {
    expect(evaluerFraicheur(null, T)).toBe("AUCUNE_DONNEE");
    expect(evaluerFraicheur(undefined, T)).toBe("AUCUNE_DONNEE");
  });

  it("refuse une position horodatée dans le futur", () => {
    expect(evaluerFraicheur(pt(DAKAR.lat, DAKAR.lng, -60_000), T)).toBe("INDISPONIBLE");
  });
});

describe("libellé de fraîcheur", () => {
  it("n'annonce jamais une position fraîche quand elle est ancienne", () => {
    const libelle = libelleFraicheur(pt(DAKAR.lat, DAKAR.lng, 4 * 60_000), T);
    expect(libelle).toContain("Dernière position connue");
    expect(libelle).not.toContain("Dernière position :");
  });

  it("annonce clairement l'indisponibilité sans donnée", () => {
    expect(libelleFraicheur(null, T)).toBe("Position indisponible");
  });

  it("ne transforme pas une position périmée en position actuelle", () => {
    const libelle = libelleFraicheur(pt(DAKAR.lat, DAKAR.lng, 30 * 60_000), T);
    expect(libelle).toContain("indisponible");
  });
});

describe("formatage de l'âge", () => {
  it("exprime les secondes, minutes et heures", () => {
    expect(formaterAge(8_000)).toBe("8 s");
    expect(formaterAge(4 * 60_000)).toBe("4 min");
    expect(formaterAge(3 * 3_600_000)).toBe("3 h");
  });
});

describe("distance", () => {
  it("calcule une distance connue entre deux points de Dakar", () => {
    // Plateau -> Almadies, environ 12 km à vol d'oiseau.
    const plateau = { lat: 14.6708, lng: -17.4381 };
    const almadies = { lat: 14.7454, lng: -17.5173 };
    const d = distanceKm(plateau, almadies);
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(14);
  });

  it("retourne zéro pour un même point", () => {
    expect(distanceKm(DAKAR, DAKAR)).toBe(0);
  });
});

describe("vitesse mesurée", () => {
  it("retourne null sans historique suffisant", () => {
    expect(vitesseMesuree([])).toBeNull();
    expect(vitesseMesuree([pt(DAKAR.lat, DAKAR.lng, 0)])).toBeNull();
  });

  it("retourne null si le livreur ne s'est pas déplacé", () => {
    expect(
      vitesseMesuree([pt(DAKAR.lat, DAKAR.lng, 60_000), pt(DAKAR.lat, DAKAR.lng, 0)]),
    ).toBeNull();
  });

  it("retourne null si le temps écoulé est négligeable", () => {
    expect(
      vitesseMesuree([pt(14.67, -17.44, 500), pt(14.68, -17.45, 0)]),
    ).toBeNull();
  });

  it("rejette une vitesse aberrante plutôt que de l'afficher", () => {
    // ~100 km en une minute : mesure GPS erratique.
    expect(vitesseMesuree([pt(14.67, -17.44, 60_000), pt(15.67, -17.44, 0)])).toBeNull();
  });
});

describe("ETA", () => {
  const destination = pt(14.72, -17.47, 0);

  it("est indisponible sans aucune position", () => {
    const eta = calculerEta({ positions: [], destination, maintenant: T, statut: "EN_ROUTE" });
    expect(eta.disponible).toBe(false);
    if (!eta.disponible) expect(eta.raison).toBe("PAS_DE_POSITION");
  });

  it("est indisponible si la position est trop ancienne", () => {
    const eta = calculerEta({
      positions: [pt(14.70, -17.45, 5 * 60_000)],
      destination,
      maintenant: T,
      statut: "EN_ROUTE",
    });
    expect(eta.disponible).toBe(false);
    if (!eta.disponible) expect(eta.raison).toBe("POSITION_TROP_ANCIENNE");
  });

  it("est indisponible sans vitesse réellement mesurée", () => {
    const eta = calculerEta({
      positions: [pt(14.70, -17.45, 10_000)],
      destination,
      maintenant: T,
      statut: "EN_ROUTE",
    });
    expect(eta.disponible).toBe(false);
    if (!eta.disponible) expect(eta.raison).toBe("PAS_DE_VITESSE_MESUREE");
  });

  it("est indisponible quand la livraison n'est pas en route", () => {
    for (const statut of ["A_ASSIGNER", "AFFECTEE", "ARRIVE", "LIVREE", "ECHEC", "ANNULEE"] as const) {
      const eta = calculerEta({
        positions: [pt(14.68, -17.44, 120_000), pt(14.70, -17.45, 0)],
        destination,
        maintenant: T,
        statut,
      });
      expect(eta.disponible).toBe(false);
    }
  });

  it("est indisponible si le livreur est déjà sur place", () => {
    const eta = calculerEta({
      positions: [pt(14.68, -17.44, 120_000), pt(destination.lat, destination.lng, 0)],
      destination,
      maintenant: T,
      statut: "EN_ROUTE",
    });
    expect(eta.disponible).toBe(false);
    if (!eta.disponible) expect(eta.raison).toBe("DISTANCE_NULLE");
  });

  it("calcule une ETA plausible à partir de positions réelles", () => {
    // Déplacement réel de ~1,1 km en 2 minutes, soit ~33 km/h.
    const eta = calculerEta({
      positions: [pt(14.680, -17.440, 120_000), pt(14.690, -17.441, 0)],
      destination: { lat: 14.700, lng: -17.442, recordedAt: T },
      maintenant: T,
      statut: "EN_ROUTE",
    });
    expect(eta.disponible).toBe(true);
    if (eta.disponible) {
      expect(eta.minutes).toBeGreaterThan(0);
      expect(eta.minutes).toBeLessThan(30);
    }
  });

  it("annonce l'indisponibilité sans jamais inventer d'heure", () => {
    const libelle = libelleEta({ disponible: false, raison: "PAS_DE_POSITION" }, T);
    expect(libelle).toBe("Heure d'arrivée indisponible");
  });

  it("affiche une heure seulement quand l'ETA est disponible", () => {
    const libelle = libelleEta({ disponible: true, minutes: 12, arrivee: T + 12 * 60_000 }, T);
    expect(libelle).toContain("Arrivée estimée");
    expect(libelle).toContain("12 min");
  });
});

describe("progression du trajet", () => {
  it("retourne 0 au départ et se rapproche de 1 à l'arrivée", () => {
    const depart = { lat: 14.68, lng: -17.44, recordedAt: T };
    const destination = { lat: 14.72, lng: -17.48, recordedAt: T };
    const auDepart = progression({ depart, actuelle: depart, destination });
    const aMiChemin = progression({
      depart,
      actuelle: { lat: 14.70, lng: -17.46, recordedAt: T },
      destination,
    });
    expect(auDepart).toBeCloseTo(0, 2);
    expect(aMiChemin).toBeGreaterThan(0.4);
    expect(aMiChemin).toBeLessThan(0.6);
  });

  it("retourne null si le trajet est dégénéré", () => {
    const p = { lat: 14.68, lng: -17.44, recordedAt: T };
    expect(progression({ depart: p, actuelle: p, destination: p })).toBeNull();
  });
});

describe("statuts de livraison", () => {
  it("n'active le suivi GPS que lorsque c'est pertinent", () => {
    expect(messageStatut("A_ASSIGNER")).toContain("Pas encore de suivi GPS");
    expect(messageStatut("AFFECTEE")).toContain("identifié");
    expect(messageStatut("EN_ROUTE")).toContain("en route");
    expect(messageStatut("ARRIVE")).toContain("arrivé");
    expect(messageStatut("LIVREE")).toContain("effectuée");
  });
});

describe("paiement", () => {
  it("distingue à encaisser, partiel et encaissé", () => {
    expect(statutPaiement(12_500, 0)).toBe("A_ENCAISSER");
    expect(statutPaiement(12_500, 5_000)).toBe("PARTIEL");
    expect(statutPaiement(12_500, 12_500)).toBe("ENCAISSE");
  });
});

describe("caisse", () => {
  it("calcule l'écart entre ce qui est remis et ce qui est attendu", () => {
    const ligne = calculerLigneCaisse({
      livreurId: "d1",
      commandesConfiees: 8,
      commandesLivrees: 6,
      montantAttendu: 92_500,
      montantEncaisse: 92_500,
      montantRemis: 90_500,
    });
    expect(ligne.montantARemettre).toBe(92_500);
    expect(ligne.ecart).toBe(-2_000);
  });

  it("signale un écart nul quand la caisse est équilibrée", () => {
    const ligne = calculerLigneCaisse({
      livreurId: "d2",
      commandesConfiees: 4,
      commandesLivrees: 4,
      montantAttendu: 40_000,
      montantEncaisse: 40_000,
      montantRemis: 40_000,
    });
    expect(ligne.ecart).toBe(0);
  });
});
