"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Carte, EnTetePage, EtatVide } from "@/components/app/partage/ui";
import { FormulaireClient } from "@/components/app/clients/formulaire-client";
import { useMagasin } from "@/lib/magasin";
import { formaterFcfa } from "@/lib/domain/paiements";
import { STATUTS_COMMANDE } from "@/lib/domain/statuts";
import { lienDetail, useParametreId } from "@/lib/use-parametre";

export default function DetailClientPage() {
  const router = useRouter();
  const { id } = useParametreId();
  const { etat, pret, modifierClient } = useMagasin();

  const client = id ? etat.monde.clients.find((c) => c.id === id) : undefined;

  // Avant l'hydratation, l'état est vide : afficher « introuvable » serait un
  // mensonge le temps d'un rendu.
  if (!pret) {
    return (
      <div className="space-y-6">
        <EnTetePage titre="Client" />
        <Carte>
          <p className="text-sm text-ink-500">Chargement…</p>
        </Carte>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="space-y-6">
        <EnTetePage titre="Client introuvable" />
        <Carte>
          <EtatVide
            titre="Ce client n'existe pas"
            description="Il a peut-être été supprimé, ou le lien est incomplet."
          />
          <div className="mt-4">
            <Link href="/app/clients" className="btn-ghost text-sm">
              Retour aux clients
            </Link>
          </div>
        </Carte>
      </div>
    );
  }

  const commandes = etat.monde.commandes
    .filter((c) => c.clientId === client.id)
    .sort((a, b) => b.dateCommande - a.dateCommande);

  return (
    <div className="space-y-6">
      <EnTetePage
        titre={client.nom}
        description={`${client.adresse.ligne} — ${client.adresse.zone}`}
        actions={
          <Link href="/app/clients" className="btn-ghost text-sm">
            Retour
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Carte>
          <h2 className="mb-4 text-base font-semibold">Fiche client</h2>
          <FormulaireClient
            initial={{
              nom: client.nom,
              telephone: client.telephone,
              adresse: client.adresse,
              note: client.note,
            }}
            libelleAction="Enregistrer"
            onValider={(v) => {
              const r = modifierClient({ clientId: client.id, ...v });
              if (!r.ok) return r.raison;
              router.push("/app/clients");
              return null;
            }}
            onAnnuler={() => router.push("/app/clients")}
          />
        </Carte>

        <Carte>
          <h2 className="mb-4 text-base font-semibold">Historique</h2>
          {commandes.length === 0 ? (
            <EtatVide
              titre="Aucune commande"
              description="Ce client n'a pas encore passé de commande."
            />
          ) : (
            <ul className="space-y-3">
              {commandes.map((c) => (
                <li key={c.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <Link
                    href={lienDetail("/app/commandes/detail", c.id)}
                    className="flex items-baseline justify-between gap-2 hover:text-brand"
                  >
                    <span className="text-sm font-medium tabular-nums">{c.reference}</span>
                    <span className="text-sm tabular-nums text-ink-700">
                      {formaterFcfa(c.montantAttendu)}
                    </span>
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {STATUTS_COMMANDE[c.statut].libelle}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Carte>
      </div>
    </div>
  );
}
