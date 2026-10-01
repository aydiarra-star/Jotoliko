"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, MapPin, Phone, RefreshCw, ShieldCheck } from "lucide-react";
import {
  calculerEta,
  evaluerFraicheur,
  formaterFcfa,
  libelleEta,
  libelleFraicheur,
  libelleStatutPaiement,
  messageStatut,
  progression,
  STATUTS,
  statutPaiement,
} from "@/lib/tracking";
import { enPoint, enPoints, type LivraisonDemo } from "@/lib/demo";

const DeliveryMap = dynamic(() => import("./delivery-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[380px] w-full items-center justify-center rounded-2xl bg-surface ring-1 ring-slate-200 md:h-[460px]">
      <span className="text-sm text-ink-500">Chargement de la carte…</span>
    </div>
  ),
});

const COULEUR_STATUT: Record<string, string> = {
  neutre: "bg-slate-100 text-ink-700 ring-slate-200",
  info: "bg-brand/10 text-brand ring-brand/20",
  succes: "bg-success/10 text-success ring-success/20",
  echec: "bg-red-50 text-red-600 ring-red-200",
};

export function DeliveryDetail({ livraison }: { livraison: LivraisonDemo }) {
  // Instant de référence figé à l'ouverture : les relevés de démonstration sont
  // datés par rapport à lui, et vieillissent réellement à l'écran.
  const reference = useRef(Date.now());
  const [maintenant, setMaintenant] = useState(() => reference.current);

  useEffect(() => {
    setMaintenant(Date.now());
    const t = setInterval(() => setMaintenant(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  const trace = useMemo(() => enPoints(livraison.trace, reference.current), [livraison.trace]);
  const destination = useMemo(
    () => enPoint(livraison.destination, reference.current),
    [livraison.destination],
  );
  const depart = useMemo(() => enPoint(livraison.depart, reference.current), [livraison.depart]);

  const affichage = STATUTS[livraison.statut];
  const position = trace.at(-1) ?? null;
  const fraicheur = evaluerFraicheur(position, maintenant);

  const eta = useMemo(
    () =>
      calculerEta({
        positions: trace,
        destination,
        maintenant,
        statut: livraison.statut,
      }),
    [trace, destination, livraison.statut, maintenant],
  );

  const avancement = useMemo(
    () => (position ? progression({ depart, actuelle: position, destination }) : null),
    [depart, destination, position],
  );

  const paiement = statutPaiement(livraison.montantDu, livraison.montantEncaisse);
  const restant = Math.max(0, livraison.montantDu - livraison.montantEncaisse);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${COULEUR_STATUT[affichage.couleur]}`}
        >
          {affichage.libelle}
        </span>
        <span className="text-sm text-ink-500">{messageStatut(livraison.statut)}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <DeliveryMap
            trace={trace}
            destination={destination}
            statut={livraison.statut}
            maintenant={maintenant}
            nomLivreur={livraison.livreur.nom.split(" ")[0]}
          />

          <div className="card p-5">
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-500">
              <RefreshCw className="h-4 w-4" aria-hidden />
              <span>{libelleFraicheur(position, maintenant)}</span>
              {fraicheur === "FRAICHE" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                  à jour
                </span>
              )}
            </div>

            <p className="mt-3 text-sm font-medium text-ink">{libelleEta(eta, maintenant)}</p>

            {avancement !== null && affichage.suiviGps && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-ink-500">
                  <span>Départ</span>
                  <span>{Math.round(avancement * 100)} % du trajet</span>
                  <span>Client</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-brand transition-all"
                    style={{ width: `${Math.round(avancement * 100)}%` }}
                  />
                </div>
              </div>
            )}

            <p className="mt-4 text-xs leading-relaxed text-ink-500">
              Le tracé plein suit les positions réellement enregistrées. La partie en
              pointillés relie la dernière position connue à la destination : ce n&apos;est pas
              un itinéraire routier calculé.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <p className="eyebrow">Client</p>
            <p className="mt-2 font-semibold text-ink">{livraison.client.nom}</p>
            <p className="mt-1 flex items-start gap-2 text-sm text-ink-500">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {livraison.client.adresse}
                <br />
                {livraison.client.zone}
              </span>
            </p>
            <a
              href={`tel:${livraison.client.telephone.replace(/\s/g, "")}`}
              className="btn-ghost mt-4 w-full justify-center text-sm"
            >
              <Phone className="h-4 w-4" aria-hidden />
              Appeler le client
            </a>
          </div>

          <div className="card p-5">
            <p className="eyebrow">Livreur</p>
            <p className="mt-2 font-semibold text-ink">
              {livraison.livreur.nom}{" "}
              <span className="font-normal text-ink-500">· {livraison.livreur.matricule}</span>
            </p>
            <a
              href={`tel:${livraison.livreur.telephone.replace(/\s/g, "")}`}
              className="btn-ghost mt-4 w-full justify-center text-sm"
            >
              <Phone className="h-4 w-4" aria-hidden />
              Appeler le livreur
            </a>
          </div>

          <div className="card p-5">
            <p className="eyebrow">Encaissement</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-500">Montant à encaisser</dt>
                <dd className="font-medium text-ink">{formaterFcfa(livraison.montantDu)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Montant encaissé</dt>
                <dd className="font-medium text-ink">{formaterFcfa(livraison.montantEncaisse)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Restant</dt>
                <dd className="font-medium text-ink">{formaterFcfa(restant)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2">
                <dt className="text-ink-500">Statut</dt>
                <dd className="font-semibold text-ink">{libelleStatutPaiement(paiement)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Mode</dt>
                <dd className="text-ink">{livraison.modePaiement}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {livraison.statut === "LIVREE" && (
        <div className="card p-5">
          <p className="eyebrow">Preuve de livraison</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-500">
            <span className="inline-flex items-center gap-2">
              <Camera className="h-4 w-4" aria-hidden />
              Photo enregistrée
            </span>
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-success" aria-hidden />
              Réceptionnaire : {livraison.client.nom}
            </span>
            <span>Position et horodatage joints</span>
          </div>
        </div>
      )}

      <div className="card p-5">
        <p className="eyebrow">Historique</p>
        <ol className="mt-4 space-y-3">
          {livraison.evenements.map((e) => (
            <li key={`${e.heure}-${e.libelle}`} className="flex gap-3 text-sm">
              <span className="w-12 shrink-0 font-medium tabular-nums text-ink-500">{e.heure}</span>
              <span className="relative flex-1 pb-3 pl-4 before:absolute before:left-0 before:top-1.5 before:h-2 before:w-2 before:-translate-x-1/2 before:rounded-full before:bg-brand/70 before:content-['']">
                {e.libelle}
                <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-500">
                  {e.origine}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default DeliveryDetail;
