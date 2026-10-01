"use client";

import {
  BandeauDemo,
  Carte,
  EnTetePage,
  EtatVide,
} from "@/components/app/partage/ui";
import { useMagasin } from "@/lib/magasin";
import { formaterFcfa, libelleEcart } from "@/lib/domain/paiements";
import { construireRapportCaisse, construireTableauBord } from "@/lib/domain/rapports";
import { STATUTS_COMMANDE, STATUTS_LIVRAISON } from "@/lib/domain/statuts";
import type { StatutCommande, StatutLivraison } from "@/lib/domain/types";

export default function RapportsPage() {
  const { etat } = useMagasin();
  const maintenant = Date.now();

  const tb = construireTableauBord({
    maintenant,
    commandes: etat.monde.commandes,
    livraisons: etat.monde.livraisons,
    paiements: etat.monde.paiements,
    remises: etat.monde.remises,
    livreurs: etat.monde.livreurs.map((l) => ({ id: l.id, actif: l.actif })),
  });

  const caisse = construireRapportCaisse({
    maintenant,
    livraisons: etat.monde.livraisons,
    paiements: etat.monde.paiements,
    remises: etat.monde.remises,
    livreurIds: etat.monde.livreurs.map((l) => l.id),
  });

  const jour = new Date(tb.journee.debut).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const aucuneActivite = tb.commandes.total === 0 && tb.livraisons.total === 0;

  return (
    <div className="space-y-6">
      <EnTetePage
        titre="Rapports"
        description={`Rapport du ${jour}. Des comptes et des montants, rien d'autre.`}
      />

      <BandeauDemo precision="Rapport établi sur des données fictives. Aucun chiffre d'exploitation réelle." />

      {aucuneActivite ? (
        <Carte>
          <EtatVide
            titre="Aucune activité sur la période"
            description="Les rapports se remplissent dès que des commandes et des livraisons existent."
          />
        </Carte>
      ) : (
        <>
          {/* Commandes */}
          <Carte titre="Commandes du jour">
            <TableauStatuts
              lignes={(Object.keys(STATUTS_COMMANDE) as StatutCommande[])
                .filter((s) => tb.commandes.parStatut[s] > 0)
                .map((s) => ({
                  libelle: STATUTS_COMMANDE[s].libelle,
                  valeur: tb.commandes.parStatut[s],
                }))}
              total={tb.commandes.total}
              libelleTotal="Total"
            />
          </Carte>

          {/* Livraisons */}
          <Carte titre="Livraisons du jour">
            <TableauStatuts
              lignes={(Object.keys(STATUTS_LIVRAISON) as StatutLivraison[])
                .filter((s) => tb.livraisons.parStatut[s] > 0)
                .map((s) => ({
                  libelle: STATUTS_LIVRAISON[s].libelle,
                  valeur: tb.livraisons.parStatut[s],
                }))}
              total={tb.livraisons.total}
              libelleTotal="Total"
            />
            <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-slate-200 pt-5 text-sm">
              <div>
                <dt className="text-xs text-ink-500">Réussies</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-success">
                  {tb.livraisons.terminees}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Échouées</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{tb.livraisons.echouees}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">En cours</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{tb.livraisons.enCours}</dd>
              </div>
            </dl>
          </Carte>

          {/* Encaissements */}
          <Carte titre="Encaissements">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Ligne label="Attendu" valeur={formaterFcfa(caisse.totaux.montantAttendu)} />
              <Ligne
                label="Réalisé"
                valeur={formaterFcfa(caisse.totaux.montantEncaisse)}
                accent
              />
              <Ligne
                label="Reste à encaisser"
                valeur={formaterFcfa(caisse.totaux.montantRestantAEncaisser)}
              />
              <Ligne label="À remettre" valeur={formaterFcfa(caisse.totaux.montantARemettre)} />
            </dl>
            <div className="mt-5 border-t border-slate-200 pt-5">
              <p className="text-xs uppercase tracking-wide text-ink-500">Écart</p>
              <p
                className={
                  caisse.totaux.ecart === 0
                    ? "mt-1 text-sm font-semibold text-success"
                    : "mt-1 text-sm font-semibold text-red-600"
                }
              >
                {libelleEcart(caisse.totaux.ecart)}
              </p>
            </div>
          </Carte>

          {/* Avertissement méthodologique */}
          <Carte titre="Ce que ce rapport ne dit pas">
            <p className="text-sm leading-relaxed text-ink-700">
              Aucun pourcentage de performance, de gain de temps ou d&apos;efficacité n&apos;est
              calculé ici. Ces indicateurs n&apos;ont de sens qu&apos;avec un historique comparable
              sur une période antérieure, et Jotoliko n&apos;en dispose pas encore. Publier un
              « +32 % d&apos;efficacité » sans mesure préalable serait un chiffre inventé.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-700">
              Les seuls indicateurs exposés sont des comptes et des montants, directement
              vérifiables dans les commandes, livraisons et paiements de la période.
            </p>
          </Carte>
        </>
      )}
    </div>
  );
}

function TableauStatuts({
  lignes,
  total,
  libelleTotal,
}: {
  lignes: { libelle: string; valeur: number }[];
  total: number;
  libelleTotal: string;
}) {
  return (
    <table className="w-full text-sm">
      <tbody className="divide-y divide-slate-100">
        {lignes.map((l) => (
          <tr key={l.libelle}>
            <td className="py-2.5 text-ink-700">{l.libelle}</td>
            <td className="py-2.5 text-right font-medium tabular-nums">{l.valeur}</td>
          </tr>
        ))}
        <tr className="border-t border-slate-200">
          <td className="py-2.5 font-semibold">{libelleTotal}</td>
          <td className="py-2.5 text-right font-semibold tabular-nums">{total}</td>
        </tr>
      </tbody>
    </table>
  );
}

function Ligne({
  label,
  valeur,
  accent,
}: {
  label: string;
  valeur: string;
  accent?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd
        className={
          accent
            ? "mt-0.5 text-lg font-semibold tabular-nums text-success"
            : "mt-0.5 text-lg font-semibold tabular-nums"
        }
      >
        {valeur}
      </dd>
    </div>
  );
}
