import { describe, expect, it } from "vitest";
import {
  SAISIE_ROI_PAR_DEFAUT,
  calculerRoi,
  formaterFcfa,
  formaterNombre,
  type SaisieRoi,
} from "./roi";

const base: SaisieRoi = {
  livreurs: 10,
  livraisonsParJour: 12,
  montantMoyen: 8500,
  joursParMois: 26,
  ecartsParMois: 50000,
};

describe("Calculateur ROI", () => {
  it("calcule les volumes à partir des chiffres saisis", () => {
    const r = calculerRoi(base);
    // 10 × 12 × 26 = 3 120 livraisons par mois.
    expect(r.livraisonsParMois).toBe(3120);
    expect(r.livraisonsParAn).toBe(37440);
  });

  it("calcule les montants encaissés", () => {
    const r = calculerRoi(base);
    // 3 120 × 8 500 = 26 520 000 FCFA par mois.
    expect(r.montantEncaisseParMois).toBe(26520000);
    expect(r.montantEncaisseParAn).toBe(318240000);
  });

  it("annualise les écarts saisis par le visiteur", () => {
    const r = calculerRoi(base);
    expect(r.ecartsParAn).toBe(600000);
  });

  it("calcule la part des écarts dans le montant encaissé", () => {
    const r = calculerRoi(base);
    // 50 000 / 26 520 000 ≈ 0,19 %.
    expect(r.partEcarts).toBeGreaterThan(0.18);
    expect(r.partEcarts).toBeLessThan(0.2);
  });

  it("n'applique aucun taux de gain : doubler les écarts double le résultat", () => {
    // Le calcul décrit la situation saisie, il ne promet pas de réduction.
    const simple = calculerRoi(base);
    const double = calculerRoi({ ...base, ecartsParMois: 100000 });
    expect(double.ecartsParAn).toBe(simple.ecartsParAn * 2);
  });

  it("traite une saisie à zéro sans division par zéro", () => {
    const r = calculerRoi({
      livreurs: 0,
      livraisonsParJour: 0,
      montantMoyen: 0,
      joursParMois: 0,
      ecartsParMois: 0,
    });
    expect(r.livraisonsParMois).toBe(0);
    expect(r.montantEncaisseParMois).toBe(0);
    expect(r.partEcarts).toBe(0);
  });

  it("refuse les valeurs négatives et non numériques", () => {
    const r = calculerRoi({
      livreurs: -5,
      livraisonsParJour: Number.NaN,
      montantMoyen: -100,
      joursParMois: Number.POSITIVE_INFINITY,
      ecartsParMois: -1,
    });
    expect(r.livraisonsParMois).toBe(0);
    expect(r.ecartsParAn).toBe(0);
  });

  it("borne les valeurs absurdes", () => {
    const r = calculerRoi({ ...base, joursParMois: 400, livraisonsParJour: 99999 });
    expect(r.livraisonsParMois).toBe(10 * 1000 * 31);
  });

  it("expose une saisie par défaut plausible", () => {
    const r = calculerRoi(SAISIE_ROI_PAR_DEFAUT);
    expect(r.livraisonsParMois).toBeGreaterThan(0);
    expect(r.partEcarts).toBeGreaterThan(0);
  });
});

describe("Formatage", () => {
  it("formate les FCFA avec séparateur d'espace", () => {
    expect(formaterFcfa(26520000)).toBe("26 520 000 FCFA");
  });

  it("formate les nombres avec séparateur d'espace", () => {
    expect(formaterNombre(3120)).toBe("3 120");
  });

  it("arrondit les montants non entiers", () => {
    expect(formaterFcfa(1500.6)).toBe("1 501 FCFA");
  });
});
