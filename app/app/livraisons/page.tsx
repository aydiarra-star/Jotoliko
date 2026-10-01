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
  StatutLivraisonPastille,
} from "@/components/app/partage/ui";
import { useMagasin } from "@/lib/magasin";
import { formaterFcfa } from "@/lib/domain/paiements";
import { STATUTS_LIVRAISON } from "@/lib/domain/statuts";
import { evaluerFraicheur, libelleFraicheur } from "@/lib/tracking";
import { lienDetail } from "@/lib/use-parametre";
import type { StatutLivraison } from "@/lib/domain/types";

export default function LivraisonsPage() {
  const { etat } = useMagasin();
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<StatutLivraison | "TOUTES">("TOUTES");
  const maintenant = Date.now();

  const livraisons = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return etat.monde.livraisons
      .filter((l) => (filtre === "TOUTES" ? true : l.statut === filtre))
      .filter((l) => {
        if (!q) return true;
        const client = etat.monde.clients.find((c) => c.id === l.clientId);
        return (
          l.reference.toLowerCase().includes(q) ||
          (client?.nom.toLowerCase().includes(q) ?? false) ||
          l.adresse.zone.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [etat.monde.livraisons, etat.monde.clients, recherche, filtre]);

  const compteur = (s: StatutLivraison | "TOUTES") =>
    s === "TOUTES"
      ? etat.monde.livraisons.length
      : etat.monde.livraisons.filter((l) => l.statut === s).length;

  const nomLivreur = (id?: string) =>
    id ? (etat.monde.livreurs.find((l) => l.id === id)?.nom ?? "—") : "—";

  /** Dernière position connue, sans jamais la présenter comme actuelle si elle ne l'est pas. */
  const suivi = (livraisonId: string) => {
    const positions = etat.monde.positions
      .filter((p) => p.livraisonId === livraisonId)
      .sort((a, b) => a.recordedAt - b.recordedAt);
    const derniere = positions.at(-1);
    if (!derniere) return { texte: "Aucune position reçue", fraiche: false };
    return {
      texte: libelleFraicheur(derniere, maintenant),
      fraiche: evaluerFraicheur(derniere, maintenant) === "FRAICHE",
    };
  };

  return (
    <div className="space-y-6">
      <EnTetePage
        titre="Livraisons"
        description="L'opération terrain : qui livre quoi, où, et où en est chaque tournée."
        actions={
          <Link href="/app/livraisons/nouvelle" className="btn-primary text-sm">
            Nouvelle livraison
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
            placeholder="Rechercher une livraison, un client, une zone…"
            aria-label="Rechercher une livraison"
            className={`${CLASSE_SAISIE} pl-9`}
          />
        </div>
        <select
          value={filtre}
          onChange={(e) => setFiltre(e.target.value as StatutLivraison | "TOUTES")}
          aria-label="Filtrer par statut"
          className={`${CLASSE_SAISIE} w-auto`}
        >
          <option value="TOUTES">Tous les statuts ({compteur("TOUTES")})</option>
          {(Object.keys(STATUTS_LIVRAISON) as StatutLivraison[]).map((s) => (
            <option key={s} value={s}>
              {STATUTS_LIVRAISON[s].libelle} ({compteur(s)})
            </option>
          ))}
        </select>
      </div>

      <Carte>
        {livraisons.length === 0 ? (
          <EtatVide
            titre="Aucune livraison ne correspond"
            description="Modifiez la recherche ou le filtre. Une livraison se crée depuis une commande."
            action={
              <Link href="/app/commandes" className="btn-primary text-sm">
                Voir les commandes
              </Link>
            }
          />
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-ink-500">
                  <th className="px-5 py-2.5 font-medium">Référence</th>
                  <th className="px-5 py-2.5 font-medium">Client / zone</th>
                  <th className="px-5 py-2.5 font-medium">Livreur</th>
                  <th className="px-5 py-2.5 font-medium">Dernière position</th>
                  <th className="px-5 py-2.5 text-right font-medium">Montant</th>
                  <th className="px-5 py-2.5 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {livraisons.map((l) => {
                  const client = etat.monde.clients.find((c) => c.id === l.clientId);
                  const s = suivi(l.id);
                  return (
                    <tr key={l.id} className="transition-colors hover:bg-surface">
                      <td className="px-5 py-3">
                        <Link
                          href={lienDetail("/app/livraisons/detail", l.id)}
                          className="font-medium text-brand hover:underline"
                        >
                          {l.reference}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <p>{client?.nom ?? "—"}</p>
                        <p className="text-xs text-ink-500">{l.adresse.zone}</p>
                      </td>
                      <td className="px-5 py-3 text-ink-500">{nomLivreur(l.livreurId)}</td>
                      <td className="px-5 py-3">
                        <span
                          className={
                            s.fraiche
                              ? "text-xs font-medium text-success"
                              : "text-xs text-ink-500"
                          }
                        >
                          {s.texte}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {formaterFcfa(l.montantAttendu)}
                      </td>
                      <td className="px-5 py-3">
                        <StatutLivraisonPastille statut={l.statut} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
    </div>
  );
}
