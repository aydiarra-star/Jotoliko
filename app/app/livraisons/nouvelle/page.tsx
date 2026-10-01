"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Carte,
  EnTetePage,
  EtatVide,
  MessageRefus,
  StatutCommandePastille,
} from "@/components/app/partage/ui";
import { useMagasin } from "@/lib/magasin";
import { formaterFcfa } from "@/lib/domain/paiements";

/**
 * Création d'une livraison à partir d'une commande qui n'en a pas encore.
 * L'écran ne liste que les commandes éligibles : les règles métier décident,
 * pas l'interface.
 */
export default function NouvelleLivraisonPage() {
  const { etat, creerLivraison } = useMagasin();
  const [erreur, setErreur] = useState<string | null>(null);

  const eligibles = etat.monde.commandes.filter(
    (c) =>
      !c.livraisonId &&
      !["LIVREE", "ECHEC", "ANNULEE"].includes(c.statut),
  );

  const clientNom = (id: string) =>
    etat.monde.clients.find((c) => c.id === id)?.nom ?? "—";

  return (
    <div className="space-y-6">
      <EnTetePage
        titre="Nouvelle livraison"
        description="Une livraison se crée à partir d'une commande. Choisissez la commande à mettre en tournée."
        actions={
          <Link href="/app/livraisons" className="btn-ghost text-sm">
            Retour
          </Link>
        }
      />

      {erreur ? <MessageRefus message={erreur} /> : null}

      <Carte titre={`Commandes prêtes à livrer (${eligibles.length})`}>
        {eligibles.length === 0 ? (
          <EtatVide
            titre="Aucune commande à mettre en livraison"
            description="Toutes les commandes ouvertes ont déjà une livraison. Créez une commande pour en ajouter une."
            action={
              <Link href="/app/commandes/nouvelle" className="btn-primary text-sm">
                Nouvelle commande
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {eligibles.map((c) => {
              const client = etat.monde.clients.find((x) => x.id === c.clientId);
              const sansGps = client?.adresse.lat === undefined;
              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{c.reference}</p>
                    <p className="text-xs text-ink-500">
                      {clientNom(c.clientId)} · {client?.adresse.zone ?? "—"} ·{" "}
                      {formaterFcfa(c.montantAttendu)}
                    </p>
                    {sansGps ? (
                      <p className="mt-1 text-xs font-medium text-amber-700">
                        Ce client n&apos;a pas de point GPS : la livraison sera refusée.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <StatutCommandePastille statut={c.statut} />
                    <button
                      type="button"
                      onClick={() => {
                        const r = creerLivraison(c.id);
                        setErreur(r.ok ? null : (r.raison ?? "Opération refusée."));
                      }}
                      className="btn-primary text-sm"
                    >
                      Créer la livraison
                    </button>
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
