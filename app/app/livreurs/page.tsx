"use client";

import Link from "next/link";
import {
  BandeauDemo,
  Carte,
  EnTetePage,
  EtatVide,
  Pastille,
} from "@/components/app/partage/ui";
import { useMagasin } from "@/lib/magasin";
import { calculerCaisseLivreur, formaterFcfa, libelleEcart } from "@/lib/domain/paiements";
import { STATUTS_LIVRAISON } from "@/lib/domain/statuts";
import { lienDetail } from "@/lib/use-parametre";

export default function LivreursPage() {
  const { etat } = useMagasin();

  const lignes = etat.monde.livreurs.map((l) => {
    const livraisons = etat.monde.livraisons.filter((v) => v.livreurId === l.id);
    const enCours = livraisons.find(
      (v) => v.statut === "EN_ROUTE" || v.statut === "ARRIVE" || v.statut === "AFFECTEE",
    );
    const caisse = calculerCaisseLivreur({
      livreurId: l.id,
      livraisons: etat.monde.livraisons,
      paiements: etat.monde.paiements,
      remises: etat.monde.remises,
    });
    const vehicule = etat.monde.vehicules.find((v) => v.id === l.vehiculeId);
    return { livreur: l, livraisons, enCours, caisse, vehicule };
  });

  return (
    <div className="space-y-6">
      <EnTetePage
        titre="Livreurs"
        description="Qui est en tournée, combien de livraisons, et surtout combien chacun doit remettre."
      />

      <BandeauDemo />

      {lignes.length === 0 ? (
        <Carte>
          <EtatVide
            titre="Aucun livreur"
            description="Ajoutez des livreurs pour pouvoir leur affecter des livraisons."
          />
        </Carte>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {lignes.map(({ livreur, livraisons, enCours, caisse, vehicule }) => (
            <Carte key={livreur.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-base font-semibold">{livreur.nom}</h2>
                    {!livreur.actif ? <Pastille ton="echec">Désactivé</Pastille> : null}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {livreur.matricule} · {livreur.telephone}
                    {vehicule ? ` · ${vehicule.libelle}` : ""}
                  </p>
                </div>
                <Pastille ton={enCours ? "info" : "neutre"}>
                  {enCours ? "En tournée" : "Disponible"}
                </Pastille>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-ink-500">Livraisons</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums">{livraisons.length}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">Livrées</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums">{caisse.livraisonsLivrees}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">Encaissé</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums">
                    {formaterFcfa(caisse.montantEncaisse)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">À remettre</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-amber-700">
                    {formaterFcfa(Math.max(0, caisse.montantARemettre - caisse.montantRemis))}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                <p
                  className={
                    caisse.ecart === 0
                      ? "text-xs font-medium text-success"
                      : "text-xs font-medium text-red-600"
                  }
                >
                  {libelleEcart(caisse.ecart)}
                </p>
                <div className="flex gap-3 text-xs font-semibold">
                  {enCours ? (
                    <Link
                      href={lienDetail("/app/livraisons/detail", enCours.id)}
                      className="text-brand"
                    >
                      Livraison en cours
                    </Link>
                  ) : null}
                  <Link href={lienDetail("/app/livreurs/detail", livreur.id)} className="text-brand">
                    Fiche complète
                  </Link>
                </div>
              </div>
            </Carte>
          ))}
        </div>
      )}
    </div>
  );
}
