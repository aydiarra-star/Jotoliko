"use client";

import Link from "next/link";
import { Carte, EnTetePage, EtatVide, Pastille } from "@/components/app/partage/ui";
import { useMagasin } from "@/lib/magasin";
import { evaluerFraicheur, libelleFraicheur } from "@/lib/tracking";
import { versStatutTracking } from "@/lib/domain/adaptateurs";
import { STATUTS_LIVRAISON } from "@/lib/domain/statuts";
import { lienDetail } from "@/lib/use-parametre";

/**
 * Vue de supervision : toutes les livraisons en cours, avec la fraîcheur réelle
 * de leur dernière position.
 *
 * La carte de détail et les règles de calcul restent celles de
 * components/tracking et lib/tracking.ts. Cet écran ne fait que les rassembler
 * pour le responsable.
 */
export default function SuiviPage() {
  const { etat } = useMagasin();
  const maintenant = Date.now();

  const suivies = etat.monde.livraisons.filter(
    (l) => l.statut === "EN_ROUTE" || l.statut === "ARRIVE",
  );

  const suivi = (livraisonId: string) => {
    const positions = etat.monde.positions
      .filter((p) => p.livraisonId === livraisonId)
      .sort((a, b) => a.recordedAt - b.recordedAt);
    const derniere = positions.at(-1);
    return {
      derniere,
      fraicheur: evaluerFraicheur(derniere, maintenant),
      texte: libelleFraicheur(derniere, maintenant),
    };
  };

  return (
    <div className="space-y-6">
      <EnTetePage
        titre="Suivi des tournées"
        description="Les livraisons en cours et la fraîcheur réelle de leur dernière position connue."
      />

      {suivies.length === 0 ? (
        <Carte>
          <EtatVide
            titre="Aucune tournée en cours"
            description="Les livraisons apparaissent ici dès qu'un livreur démarre sa tournée."
            action={
              <Link href="/app/livraisons" className="btn-primary text-sm">
                Voir les livraisons
              </Link>
            }
          />
        </Carte>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {suivies.map((l) => {
            const s = suivi(l.id);
            const livreur = l.livreurId
              ? etat.monde.livreurs.find((x) => x.id === l.livreurId)
              : undefined;
            const client = etat.monde.clients.find((c) => c.id === l.clientId);
            return (
              <Carte key={l.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold">{l.reference}</h2>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {client?.nom ?? "—"} · {l.adresse.zone}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {livreur ? `${livreur.nom} (${livreur.matricule})` : "Non affectée"}
                    </p>
                  </div>
                  <Pastille ton={STATUTS_LIVRAISON[l.statut].couleur}>
                    {STATUTS_LIVRAISON[l.statut].libelle}
                  </Pastille>
                </div>

                <div className="mt-4 space-y-2">
                  <p
                    className={
                      s.fraicheur === "FRAICHE"
                        ? "text-xs font-medium text-success"
                        : "text-xs text-ink-500"
                    }
                  >
                    {s.texte}
                  </p>
                  {s.derniere ? (
                    <p className="text-xs text-ink-500">
                      Coordonnées reçues : {s.derniere.lat.toFixed(4)},{" "}
                      {s.derniere.lng.toFixed(4)}
                    </p>
                  ) : (
                    <p className="rounded-xl bg-surface px-3 py-2 text-xs leading-relaxed text-ink-500">
                      Aucune position reçue. Aucun marqueur ne sera affiché sur la carte : le
                      suivi ne peut pas être simulé.
                    </p>
                  )}
                </div>

                <Link
                  href={lienDetail("/app/livraisons/detail", l.id)}
                  className="mt-4 inline-block text-xs font-semibold text-brand"
                >
                  Ouvrir la carte de suivi
                </Link>
              </Carte>
            );
          })}
        </div>
      )}

      <Carte titre="Suivi public par référence">
        <p className="text-sm leading-relaxed text-ink-700">
          Les pages de suivi publiques restent accessibles par référence, sans connexion, pour
          que le client puisse suivre sa commande :
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {["1042", "1039", "1041"].map((ref) => (
            <Link
              key={ref}
              href={`/suivi/${ref}`}
              className="btn-ghost text-sm"
            >
              /suivi/{ref}
            </Link>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-500">
          Ces pages utilisent le même moteur de suivi et affichent les mêmes règles de fraîcheur.
        </p>
      </Carte>
    </div>
  );
}
