"use client";

import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";
import {
  BandeauDemo,
  Carte,
  EnTetePage,
  EtatVide,
  Indicateur,
  StatutLivraisonPastille,
} from "@/components/app/partage/ui";
import { useMagasin } from "@/lib/magasin";
import { lienDetail } from "@/lib/use-parametre";
import { construireTableauBord } from "@/lib/domain/rapports";
import { formaterFcfa, libelleEcart } from "@/lib/domain/paiements";
import { STATUTS_COMMANDE } from "@/lib/domain/statuts";
import type { StatutCommande } from "@/lib/domain/types";

export default function TableauDeBordPage() {
  const { etat, reinitialiser } = useMagasin();

  const maintenant = Date.now();
  const tb = construireTableauBord({
    maintenant,
    commandes: etat.monde.commandes,
    livraisons: etat.monde.livraisons,
    paiements: etat.monde.paiements,
    remises: etat.monde.remises,
    livreurs: etat.monde.livreurs.map((l) => ({ id: l.id, actif: l.actif })),
  });

  const livreursEnTournee = etat.monde.livreurs.filter((l) =>
    etat.monde.livraisons.some(
      (v) => v.livreurId === l.id && (v.statut === "EN_ROUTE" || v.statut === "ARRIVE"),
    ),
  );

  const livraisonsARisque = etat.monde.livraisons.filter(
    (l) =>
      l.statut === "AFFECTEE" &&
      l.assigneeAt !== undefined &&
      maintenant - l.assigneeAt > 90 * 60_000,
  );

  const ligneCommande = (statut: StatutCommande) =>
    tb.commandes.parStatut[statut] > 0;

  return (
    <div className="space-y-6">
      <EnTetePage
        titre="Tableau de bord"
        description="L'état des opérations du jour, en une page."
        actions={
          <>
            <button type="button" onClick={reinitialiser} className="btn-ghost text-sm">
              <RefreshCw className="h-4 w-4" aria-hidden /> Réinitialiser la démo
            </button>
            <Link href="/app/commandes/nouvelle" className="btn-primary text-sm">
              Nouvelle commande
            </Link>
          </>
        }
      />

      <BandeauDemo precision="Ces compteurs sont calculés à partir de commandes, livraisons et encaissements fictifs. Ils ne reflètent aucune activité réelle." />

      {/* Réponse directe aux questions du responsable */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicateur
          label="Commandes du jour"
          valeur={tb.commandes.total}
          detail={`${tb.commandes.aTraiter} en attente d'action`}
          accent="ink"
        />
        <Indicateur
          label="En livraison"
          valeur={tb.livraisons.enCours}
          detail={`sur ${tb.livraisons.total} livraisons`}
          accent="brand"
        />
        <Indicateur
          label="Livrées"
          valeur={tb.livraisons.terminees}
          detail={`${tb.livraisons.echouees} échec${tb.livraisons.echouees > 1 ? "s" : ""}`}
          accent="success"
        />
        <Indicateur
          label="À affecter"
          valeur={tb.commandes.parStatut.A_AFFECTER}
          detail={`${tb.commandes.parStatut.A_PREPARER} à préparer`}
          accent="ink"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Répartition des commandes */}
        <Carte titre="Répartition des commandes du jour" className="lg:col-span-2">
          {tb.commandes.total === 0 ? (
            <EtatVide
              titre="Aucune commande aujourd'hui"
              description="Créez une commande pour la voir apparaître ici."
              action={
                <Link href="/app/commandes/nouvelle" className="btn-primary text-sm">
                  Nouvelle commande
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {(Object.keys(STATUTS_COMMANDE) as StatutCommande[])
                .filter(ligneCommande)
                .map((statut) => {
                  const nombre = tb.commandes.parStatut[statut];
                  const part = (nombre / tb.commandes.total) * 100;
                  return (
                    <li key={statut} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                      <span className="w-32 shrink-0 text-sm text-ink-700">
                        {STATUTS_COMMANDE[statut].libelle}
                      </span>
                      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <span
                          className="block h-full rounded-full bg-brand"
                          style={{ width: `${part}%` }}
                        />
                      </span>
                      <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums">
                        {nombre}
                      </span>
                    </li>
                  );
                })}
            </ul>
          )}
        </Carte>

        {/* Encaissements */}
        <Carte titre="Encaissements du jour">
          <dl className="space-y-3 text-sm">
            <Ligne label="Montant attendu" valeur={formaterFcfa(tb.encaissements.montantAttendu)} />
            <Ligne label="Encaissé" valeur={formaterFcfa(tb.encaissements.montantEncaisse)} fort />
            <Ligne label="Reste à encaisser" valeur={formaterFcfa(tb.encaissements.resteAEncaisser)} />
            <Ligne label="À remettre" valeur={formaterFcfa(tb.encaissements.montantARemettre)} />
            <Ligne label="Déjà remis" valeur={formaterFcfa(tb.encaissements.montantRemis)} />
          </dl>
          <div className="mt-4 border-t border-slate-200 pt-4">
            <p className="text-xs uppercase tracking-wide text-ink-500">Écart de caisse</p>
            <p
              className={
                tb.encaissements.ecart === 0
                  ? "mt-1 text-sm font-semibold text-success"
                  : "mt-1 text-sm font-semibold text-red-600"
              }
            >
              {libelleEcart(tb.encaissements.ecart)}
            </p>
          </div>
          <Link
            href="/app/encaissements"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand"
          >
            Voir la caisse par livreur <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </Carte>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Livreurs en tournée */}
        <Carte
          titre="Livreurs en tournée"
          action={
            <Link href="/app/livreurs" className="text-xs font-semibold text-brand">
              Tous les livreurs
            </Link>
          }
        >
          {livreursEnTournee.length === 0 ? (
            <EtatVide
              titre="Aucun livreur en tournée"
              description="Les livreurs apparaissent ici dès qu'une livraison est démarrée."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {livreursEnTournee.map((l) => {
                const enCours = etat.monde.livraisons.filter(
                  (v) => v.livreurId === l.id && (v.statut === "EN_ROUTE" || v.statut === "ARRIVE"),
                );
                return (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{l.nom}</p>
                      <p className="text-xs text-ink-500">
                        {l.matricule} · {enCours.length} livraison{enCours.length > 1 ? "s" : ""} en cours
                      </p>
                    </div>
                    <Link
                      href={lienDetail("/app/livreurs/detail", l.id)}
                      className="shrink-0 text-xs font-semibold text-brand"
                    >
                      Voir
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Carte>

        {/* Livraisons affectées qui traînent */}
        <Carte titre="Livraisons affectées sans départ">
          {livraisonsARisque.length === 0 ? (
            <EtatVide
              titre="Aucune livraison en attente de départ"
              description="Une livraison affectée depuis plus de 90 minutes apparaîtrait ici."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {livraisonsARisque.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.reference}</p>
                    <p className="text-xs text-ink-500">
                      {l.adresse.zone} · affectée il y a{" "}
                      {Math.round((maintenant - (l.assigneeAt ?? l.createdAt)) / 60_000)} min
                    </p>
                  </div>
                  <StatutLivraisonPastille statut={l.statut} />
                </li>
              ))}
            </ul>
          )}
        </Carte>
      </div>
    </div>
  );
}

function Ligne({ label, valeur, fort }: { label: string; valeur: string; fort?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className={fort ? "font-semibold tabular-nums text-success" : "tabular-nums"}>
        {valeur}
      </dd>
    </div>
  );
}
