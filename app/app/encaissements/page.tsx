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
import { formaterFcfa, libelleEcart } from "@/lib/domain/paiements";
import { construireRapportCaisse } from "@/lib/domain/rapports";
import { LIBELLES_MODE_PAIEMENT } from "@/lib/domain/paiements";
import { lienDetail } from "@/lib/use-parametre";

export default function EncaissementsPage() {
  const { etat } = useMagasin();
  const maintenant = Date.now();

  const rapport = construireRapportCaisse({
    maintenant,
    livraisons: etat.monde.livraisons,
    paiements: etat.monde.paiements,
    remises: etat.monde.remises,
    livreurIds: etat.monde.livreurs.map((l) => l.id),
  });

  const nomLivreur = (id: string) =>
    etat.monde.livreurs.find((l) => l.id === id)?.nom ?? "—";

  // Détail des encaissements livraison par livraison, pour la journée.
  const livraisons = etat.monde.livraisons
    .filter((l) => l.statut !== "ANNULEE")
    .sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="space-y-6">
      <EnTetePage
        titre="Encaissements"
        description="Ce que les clients doivent, ce que les livreurs ont encaissé, et ce qu'ils doivent reverser."
      />

      <BandeauDemo precision="Montants, encaissements et remises fictifs. Aucun mouvement d'argent réel n'est enregistré par cette application." />

      {/* Totaux du jour */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Total label="Montant attendu" valeur={formaterFcfa(rapport.totaux.montantAttendu)} />
        <Total label="Encaissé" valeur={formaterFcfa(rapport.totaux.montantEncaisse)} accent />
        <Total label="Restant à encaisser" valeur={formaterFcfa(rapport.totaux.montantRestantAEncaisser)} />
        <Total label="Déjà remis" valeur={formaterFcfa(rapport.totaux.montantRemis)} />
      </div>

      <Carte>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-500">Écart de caisse global</p>
            <p
              className={
                rapport.totaux.ecart === 0
                  ? "mt-1 text-lg font-semibold text-success"
                  : "mt-1 text-lg font-semibold text-red-600"
              }
            >
              {libelleEcart(rapport.totaux.ecart)}
            </p>
          </div>
          <p className="max-w-md text-xs leading-relaxed text-ink-500">
            L&apos;écart compare ce que les livreurs ont encaissé à ce qu&apos;ils ont réellement
            remis. Un manquant signale de l&apos;argent encaissé et non encore reversé — c&apos;est
            précisément ce que Jotoliko rend visible.
          </p>
        </div>
      </Carte>

      {/* Caisse par livreur */}
      <Carte titre="Caisse par livreur">
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-ink-500">
                <th className="px-5 py-2.5 font-medium">Livreur</th>
                <th className="px-5 py-2.5 text-right font-medium">Encaissé</th>
                <th className="px-5 py-2.5 text-right font-medium">À remettre</th>
                <th className="px-5 py-2.5 text-right font-medium">Remis</th>
                <th className="px-5 py-2.5 text-right font-medium">Écart</th>
                <th className="px-5 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rapport.lignes.map((l) => {
                const aRemettre = Math.max(0, l.montantARemettre - l.montantRemis);
                return (
                  <tr key={l.livreurId} className="transition-colors hover:bg-surface">
                    <td className="px-5 py-3">{nomLivreur(l.livreurId)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {formaterFcfa(l.montantEncaisse)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-amber-700">
                      {formaterFcfa(aRemettre)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {formaterFcfa(l.montantRemis)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span
                        className={
                          l.ecart === 0
                            ? "text-xs font-medium text-success"
                            : "text-xs font-medium text-red-600"
                        }
                      >
                        {l.ecart === 0 ? "Juste" : formaterFcfa(l.ecart)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={lienDetail("/app/livreurs/detail", l.livreurId)}
                        className="text-xs font-semibold text-brand"
                      >
                        Détail
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Carte>

      {/* Détail par livraison */}
      <Carte titre="Détail par livraison">
        {livraisons.length === 0 ? (
          <EtatVide titre="Aucune livraison" description="Aucune livraison à encaisser." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {livraisons.map((l) => {
              const paiements = etat.monde.paiements.filter((p) => p.livraisonId === l.id);
              const encaisse = paiements.reduce((t, p) => t + p.montant, 0);
              const reste = Math.max(0, l.montantAttendu - encaisse);
              const client = etat.monde.clients.find((c) => c.id === l.clientId);
              return (
                <li key={l.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={lienDetail("/app/livraisons/detail", l.id)}
                        className="text-sm font-medium text-brand hover:underline"
                      >
                        {l.reference}
                      </Link>
                      <p className="text-xs text-ink-500">
                        {client?.nom ?? "—"} ·{" "}
                        {l.livreurId ? nomLivreur(l.livreurId) : "non affectée"}
                      </p>
                      {paiements.length > 0 ? (
                        <p className="mt-0.5 text-xs text-ink-500">
                          {paiements
                            .map(
                              (p) =>
                                `${formaterFcfa(p.montant)} ${LIBELLES_MODE_PAIEMENT[p.mode]}${
                                  p.syncedAt === undefined ? " (à synchroniser)" : ""
                                }`,
                            )
                            .join(" + ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {formaterFcfa(encaisse)}
                        <span className="text-ink-500"> / {formaterFcfa(l.montantAttendu)}</span>
                      </p>
                      <div className="mt-1">
                        {reste === 0 ? (
                          <Pastille ton="succes">Soldée</Pastille>
                        ) : (
                          <Pastille ton="neutre">Reste {formaterFcfa(reste)}</Pastille>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Carte>
    </div>
  );
}

function Total({
  label,
  valeur,
  accent,
}: {
  label: string;
  valeur: string;
  accent?: boolean;
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p
        className={
          accent
            ? "mt-2 text-xl font-semibold tabular-nums text-success"
            : "mt-2 text-xl font-semibold tabular-nums"
        }
      >
        {valeur}
      </p>
    </div>
  );
}
