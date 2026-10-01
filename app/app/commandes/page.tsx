"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  BandeauDemo,
  Carte,
  CLASSE_SAISIE,
  EnTetePage,
  EtatVide,
  StatutCommandePastille,
} from "@/components/app/partage/ui";
import { useMagasin } from "@/lib/magasin";
import { lienDetail } from "@/lib/use-parametre";
import { formaterFcfa } from "@/lib/domain/paiements";
import { STATUTS_COMMANDE } from "@/lib/domain/statuts";
import type { StatutCommande } from "@/lib/domain/types";

export default function CommandesPage() {
  const { etat } = useMagasin();
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<StatutCommande | "TOUTES">("TOUTES");

  const clientNom = (id: string) => etat.monde.clients.find((c) => c.id === id)?.nom ?? "—";
  const livreurNom = (livraisonId?: string) => {
    const liv = etat.monde.livraisons.find((l) => l.id === livraisonId);
    if (!liv?.livreurId) return null;
    return etat.monde.livreurs.find((l) => l.id === liv.livreurId)?.nom ?? null;
  };

  const commandes = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return etat.monde.commandes
      .filter((c) => (filtre === "TOUTES" ? true : c.statut === filtre))
      .filter((c) => {
        if (!q) return true;
        const nom = clientNom(c.clientId).toLowerCase();
        return (
          c.reference.toLowerCase().includes(q) ||
          nom.includes(q) ||
          c.lignes.some((l) => l.designation.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.dateCommande - a.dateCommande);
  }, [etat.monde.commandes, etat.monde.clients, recherche, filtre]);

  const compteur = (statut: StatutCommande | "TOUTES") =>
    statut === "TOUTES"
      ? etat.monde.commandes.length
      : etat.monde.commandes.filter((c) => c.statut === statut).length;

  return (
    <div className="space-y-6">
      <EnTetePage
        titre="Commandes"
        description="Toutes les commandes de l'entreprise, de la saisie à la livraison."
        actions={
          <Link href="/app/commandes/nouvelle" className="btn-primary text-sm">
            Nouvelle commande
          </Link>
        }
      />

      <BandeauDemo />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher une référence, un client, un article…"
            aria-label="Rechercher une commande"
            className={`${CLASSE_SAISIE} pl-9`}
          />
        </div>
        <select
          value={filtre}
          onChange={(e) => setFiltre(e.target.value as StatutCommande | "TOUTES")}
          aria-label="Filtrer par statut"
          className={`${CLASSE_SAISIE} w-auto`}
        >
          <option value="TOUTES">Tous les statuts ({compteur("TOUTES")})</option>
          {(Object.keys(STATUTS_COMMANDE) as StatutCommande[]).map((s) => (
            <option key={s} value={s}>
              {STATUTS_COMMANDE[s].libelle} ({compteur(s)})
            </option>
          ))}
        </select>
      </div>

      <Carte>
        {commandes.length === 0 ? (
          <EtatVide
            titre="Aucune commande ne correspond"
            description="Modifiez la recherche ou le filtre, ou créez une nouvelle commande."
            action={
              <Link href="/app/commandes/nouvelle" className="btn-primary text-sm">
                Nouvelle commande
              </Link>
            }
          />
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-ink-500">
                  <th className="px-5 py-2.5 font-medium">Référence</th>
                  <th className="px-5 py-2.5 font-medium">Client</th>
                  <th className="px-5 py-2.5 font-medium">Zone</th>
                  <th className="px-5 py-2.5 font-medium">Livreur</th>
                  <th className="px-5 py-2.5 text-right font-medium">Montant</th>
                  <th className="px-5 py-2.5 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {commandes.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-surface">
                    <td className="px-5 py-3">
                      <Link
                        href={lienDetail("/app/commandes/detail", c.id)}
                        className="font-medium text-brand hover:underline"
                      >
                        {c.reference}
                      </Link>
                    </td>
                    <td className="px-5 py-3">{clientNom(c.clientId)}</td>
                    <td className="px-5 py-3 text-ink-500">
                      {etat.monde.clients.find((x) => x.id === c.clientId)?.adresse.zone ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-ink-500">{livreurNom(c.livraisonId) ?? "—"}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {formaterFcfa(c.montantAttendu)}
                    </td>
                    <td className="px-5 py-3">
                      <StatutCommandePastille statut={c.statut} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
    </div>
  );
}
