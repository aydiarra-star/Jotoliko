"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Info } from "lucide-react";
import {
  SAISIE_ROI_PAR_DEFAUT,
  calculerRoi,
  formaterFcfa,
  formaterNombre,
  type SaisieRoi,
} from "@/lib/roi";

type Champ = {
  cle: keyof SaisieRoi;
  label: string;
  suffixe?: string;
  min: number;
  max: number;
  pas: number;
};

const champs: Champ[] = [
  { cle: "livreurs", label: "Livreurs ou agents terrain", min: 1, max: 500, pas: 1 },
  { cle: "livraisonsParJour", label: "Livraisons par livreur et par jour", min: 1, max: 60, pas: 1 },
  { cle: "montantMoyen", label: "Montant moyen encaissé par livraison", suffixe: "FCFA", min: 0, max: 1000000, pas: 500 },
  { cle: "joursParMois", label: "Jours travaillés par mois", min: 1, max: 31, pas: 1 },
  { cle: "ecartsParMois", label: "Écarts de caisse constatés par mois", suffixe: "FCFA", min: 0, max: 10000000, pas: 5000 },
];

/**
 * Calculateur fondé sur les chiffres du visiteur.
 *
 * Il ne promet aucun pourcentage de gain : il chiffre la situation actuelle
 * (volumes, montants, poids des écarts) pour que le visiteur se situe lui-même.
 */
export function CalculateurRoi() {
  const [saisie, setSaisie] = useState<SaisieRoi>(SAISIE_ROI_PAR_DEFAUT);
  const resultat = useMemo(() => calculerRoi(saisie), [saisie]);

  function maj(cle: keyof SaisieRoi, valeur: string) {
    const nombre = Number(valeur);
    setSaisie((s) => ({ ...s, [cle]: Number.isFinite(nombre) ? nombre : 0 }));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="card p-7 sm:p-8">
        <h3 className="text-lg font-semibold">Vos chiffres</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          Remplissez avec vos valeurs réelles. Le calcul se fait sur vos données, pas sur une
          moyenne de marché.
        </p>

        <div className="mt-7 space-y-5">
          {champs.map((c) => (
            <label key={c.cle} className="block">
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-ink-700">{c.label}</span>
                <span className="text-sm font-semibold tabular-nums text-ink">
                  {formaterNombre(saisie[c.cle])}
                  {c.suffixe ? <span className="ml-1 text-xs font-normal text-ink-500">{c.suffixe}</span> : null}
                </span>
              </span>
              <input
                type="range"
                min={c.min}
                max={c.max}
                step={c.pas}
                value={saisie[c.cle]}
                onChange={(e) => maj(c.cle, e.target.value)}
                className="mt-3 w-full accent-brand"
              />
              <input
                type="number"
                min={c.min}
                max={c.max}
                value={saisie[c.cle]}
                onChange={(e) => maj(c.cle, e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm tabular-nums outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-ring"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="card flex flex-col p-7 sm:p-8">
        <h3 className="text-lg font-semibold">Ce que vos chiffres décrivent</h3>

        <dl className="mt-7 grid gap-5 sm:grid-cols-2">
          <Indicateur label="Livraisons par mois" valeur={formaterNombre(resultat.livraisonsParMois)} />
          <Indicateur label="Livraisons par an" valeur={formaterNombre(resultat.livraisonsParAn)} />
          <Indicateur label="Encaissé par mois" valeur={formaterFcfa(resultat.montantEncaisseParMois)} />
          <Indicateur label="Encaissé par an" valeur={formaterFcfa(resultat.montantEncaisseParAn)} />
          <Indicateur label="Écarts de caisse par an" valeur={formaterFcfa(resultat.ecartsParAn)} />
          <Indicateur
            label="Part des écarts"
            valeur={`${resultat.partEcarts.toFixed(2)} %`}
            note="du montant encaissé"
          />
        </dl>

        <div className="mt-7 flex gap-3 rounded-2xl bg-surface p-5">
          <Info className="h-5 w-5 shrink-0 text-brand" strokeWidth={1.75} />
          <p className="text-sm leading-relaxed text-ink-500">
            Ces montants décrivent votre situation actuelle, calculée à partir de vos saisies.
            Jotoliko ne promet pas de les réduire d&apos;un pourcentage donné : la plateforme rend
            chaque écart visible et le rattache à un livreur, ce qui vous permet de le traiter au
            lieu de le découvrir en fin de mois.
          </p>
        </div>

        <a href="/demo" className="btn-primary mt-7 self-start">
          Voir comment Jotoliko traite ces écarts
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

function Indicateur({ label, valeur, note }: { label: string; valeur: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-5">
      <dt className="text-sm text-ink-500">{label}</dt>
      <dd className="mt-2 text-xl font-semibold tabular-nums text-ink">{valeur}</dd>
      {note ? <dd className="mt-1 text-xs text-ink-500">{note}</dd> : null}
    </div>
  );
}
