"use client";

import Link from "next/link";
import { useState } from "react";
import { MapPin, Phone, Plus, Search } from "lucide-react";
import {
  BandeauDemo,
  Carte,
  EnTetePage,
  EtatVide,
  MessageRefus,
} from "@/components/app/partage/ui";
import { useMagasin } from "@/lib/magasin";
import { lienDetail } from "@/lib/use-parametre";

export default function ClientsPage() {
  const { etat, supprimerClient } = useMagasin();
  const [recherche, setRecherche] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const terme = recherche.trim().toLowerCase();
  const clients = etat.monde.clients.filter(
    (c) =>
      !terme ||
      c.nom.toLowerCase().includes(terme) ||
      c.telephone.toLowerCase().includes(terme) ||
      c.adresse.zone.toLowerCase().includes(terme),
  );

  const compterCommandes = (clientId: string) =>
    etat.monde.commandes.filter((c) => c.clientId === clientId).length;

  return (
    <div className="space-y-6">
      <EnTetePage
        titre="Clients"
        description="Les destinataires de vos livraisons. Leur adresse et leur repère guident le livreur."
        actions={
          <Link href="/app/clients/nouveau" className="btn-primary text-sm">
            <Plus className="h-4 w-4" aria-hidden /> Nouveau client
          </Link>
        }
      />

      <BandeauDemo />

      {erreur ? <MessageRefus message={erreur} /> : null}

      {etat.monde.clients.length > 0 ? (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher par nom, téléphone ou zone…"
            aria-label="Rechercher un client"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-ring"
          />
        </div>
      ) : null}

      {clients.length === 0 ? (
        <Carte>
          <EtatVide
            titre={etat.monde.clients.length === 0 ? "Aucun client" : "Aucun résultat"}
            description={
              etat.monde.clients.length === 0
                ? "Créez un client pour pouvoir lui affecter une commande."
                : "Aucun client ne correspond à cette recherche."
            }
          />
        </Carte>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {clients.map((client) => {
            const commandes = compterCommandes(client.id);
            return (
              <Carte key={client.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold">{client.nom}</h2>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-500">
                      <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="tabular-nums">{client.telephone}</span>
                    </p>
                    <p className="mt-1.5 flex items-start gap-1.5 text-sm text-ink-700">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
                      <span className="min-w-0">
                        {client.adresse.ligne}
                        <span className="block text-xs text-ink-500">{client.adresse.zone}</span>
                        {client.adresse.repere ? (
                          <span className="block text-xs text-ink-500">
                            Repère : {client.adresse.repere}
                          </span>
                        ) : null}
                      </span>
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-ink-500">
                    {commandes} commande{commandes > 1 ? "s" : ""}
                  </span>
                </div>

                {client.adresse.lat === undefined ? (
                  <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    Aucun point GPS enregistré : une livraison pour ce client ne pourra pas être
                    créée tant que sa position n&apos;est pas renseignée.
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={lienDetail("/app/clients/detail", client.id)}
                    className="btn-ghost text-sm"
                  >
                    Modifier
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      const r = supprimerClient(client.id);
                      setErreur(r.ok ? null : r.raison);
                    }}
                    className="btn-ghost text-sm text-red-600 hover:border-red-200"
                  >
                    Supprimer
                  </button>
                </div>
              </Carte>
            );
          })}
        </div>
      )}
    </div>
  );
}
