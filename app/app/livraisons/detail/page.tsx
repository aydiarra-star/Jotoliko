"use client";

// Fiche de livraison : c'est le cœur de Jotoliko.
// Elle réunit la timeline, la carte de suivi, la preuve et l'encaissement.
//
// La carte réutilise components/tracking/delivery-map.tsx sans le modifier ;
// les règles de fraîcheur et d'ETA viennent de lib/tracking.ts, également
// inchangé. Aucune position ni aucune ETA n'est inventée ici.

import Link from "next/link";
import { useState } from "react";
import { Check, MapPin, Phone, TriangleAlert } from "lucide-react";
import {
  BandeauDemo,
  Carte,
  CLASSE_SAISIE,
  EnTetePage,
  EtatVide,
  MessageRefus,
  MessageSucces,
  Pastille,
  StatutLivraisonPastille,
} from "@/components/app/partage/ui";
import { DeliveryMap } from "@/components/tracking/delivery-map";
import { useMagasin } from "@/lib/magasin";
import { calculerEncaissement, formaterFcfa, LIBELLES_MODE_PAIEMENT } from "@/lib/domain/paiements";
import { versStatutTracking } from "@/lib/domain/adaptateurs";
import { statutsLivraisonSuivants, STATUTS_LIVRAISON } from "@/lib/domain/statuts";
import { calculerEta, evaluerFraicheur, libelleEta, libelleFraicheur, progression } from "@/lib/tracking";
import { useParametreId, lienDetail } from "@/lib/use-parametre";
import type { ModePaiement } from "@/lib/domain/types";

export default function DetailLivraisonPage() {
  const { id, pret } = useParametreId();
  const { etat, affecter, encaisser } = useMagasin();

  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [livreurChoisi, setLivreurChoisi] = useState("");
  const [montant, setMontant] = useState("");
  const [mode, setMode] = useState<ModePaiement>("ESPECES");

  if (!pret) return null;

  const livraison = etat.monde.livraisons.find((l) => l.id === id);

  if (!livraison) {
    return (
      <div className="space-y-6">
        <EnTetePage titre="Livraison introuvable" />
        <EtatVide
          titre="Cette livraison n'existe pas"
          description="L'identifiant est peut-être incorrect."
          action={
            <Link href="/app/livraisons" className="btn-primary text-sm">
              Retour aux livraisons
            </Link>
          }
        />
      </div>
    );
  }

  const maintenant = Date.now();
  const client = etat.monde.clients.find((c) => c.id === livraison.clientId);
  const commande = etat.monde.commandes.find((c) => c.id === livraison.commandeId);
  const livreur = livraison.livreurId
    ? etat.monde.livreurs.find((l) => l.id === livraison.livreurId)
    : undefined;
  const preuve = etat.monde.preuves.find((p) => p.id === livraison.preuveId);
  const encaissement = calculerEncaissement(livraison, etat.monde.paiements);
  const evenements = etat.monde.evenements
    .filter((e) => e.livraisonId === livraison.id)
    .sort((a, b) => a.horodatage - b.horodatage);

  // Positions réellement reçues, triées. Aucune n'est fabriquée.
  const positions = etat.monde.positions
    .filter((p) => p.livraisonId === livraison.id)
    .sort((a, b) => a.recordedAt - b.recordedAt)
    .map((p) => ({ lat: p.lat, lng: p.lng, recordedAt: p.recordedAt }));

  const derniere = positions.at(-1);
  const fraicheur = evaluerFraicheur(derniere, maintenant);

  // L'ETA n'est calculée que si le domaine l'autorise : statut en route,
  // position fraîche et vitesse réellement mesurée sur deux points.
  const eta = calculerEta({
    positions,
    destination: { ...livraison.destination, recordedAt: livraison.createdAt },
    maintenant,
    statut: versStatutTracking(livraison.statut),
  });

  const avancement =
    livraison.depart && derniere
      ? progression({
          depart: { ...livraison.depart, recordedAt: livraison.createdAt },
          actuelle: derniere,
          destination: { ...livraison.destination, recordedAt: livraison.createdAt },
        })
      : null;

  const close = ["LIVREE", "ECHEC", "ANNULEE"].includes(livraison.statut);

  const agir = (f: () => { ok: boolean; raison?: string }, message: string) => {
    const r = f();
    if (!r.ok) {
      setErreur(r.raison ?? "Opération refusée.");
      setSucces(null);
      return;
    }
    setErreur(null);
    setSucces(message);
  };

  return (
    <div className="space-y-6">
      <EnTetePage
        titre={`Livraison ${livraison.reference}`}
        description={
          commande
            ? `Commande ${commande.reference} · ${livraison.adresse.ligne}`
            : livraison.adresse.ligne
        }
        actions={
          <>
            <Link href="/app/livraisons" className="btn-ghost text-sm">
              Retour
            </Link>
            <StatutLivraisonPastille statut={livraison.statut} />
          </>
        }
      />

      <BandeauDemo />

      {erreur ? <MessageRefus message={erreur} /> : null}
      {succes ? <MessageSucces message={succes} /> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Carte de suivi */}
          <Carte titre="Suivi">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-ink-500" aria-hidden />
                  <span className={fraicheur === "FRAICHE" ? "font-medium text-success" : "text-ink-700"}>
                    {libelleFraicheur(derniere, maintenant)}
                  </span>
                </span>
                <span className="text-ink-500">
                  {eta.disponible ? libelleEta(eta, maintenant) : "Heure d'arrivée indisponible"}
                </span>
              </div>

              {avancement !== null ? (
                <div>
                  <div className="flex items-center justify-between text-xs text-ink-500">
                    <span>Départ</span>
                    <span>{Math.round(avancement * 100)} % du trajet</span>
                    <span>Client</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand transition-[width] duration-500"
                      style={{ width: `${Math.round(avancement * 100)}%` }}
                    />
                  </div>
                </div>
              ) : null}

              <DeliveryMap
                trace={positions}
                destination={{ ...livraison.destination, recordedAt: livraison.createdAt }}
                statut={versStatutTracking(livraison.statut)}
                maintenant={maintenant}
                nomLivreur={livreur?.nom ?? "Livreur"}
              />

              <p className="text-xs leading-relaxed text-ink-500">
                Le tracé plein suit les positions réellement enregistrées par le téléphone du
                livreur. La partie en pointillés relie la dernière position connue à la
                destination : ce n&apos;est pas un itinéraire routier calculé.
              </p>

              {positions.length === 0 ? (
                <p className="rounded-xl bg-surface px-4 py-3 text-xs leading-relaxed text-ink-500">
                  Aucune position n&apos;a été reçue pour cette livraison. Le suivi GPS ne
                  s&apos;affiche que lorsqu&apos;une position réelle a été transmise : rien
                  n&apos;est simulé ici.
                </p>
              ) : null}
            </div>
          </Carte>

          {/* Timeline */}
          <Carte titre="Historique">
            {evenements.length === 0 ? (
              <EtatVide
                titre="Aucun événement"
                description="Les étapes de la livraison apparaîtront ici, dans l'ordre."
              />
            ) : (
              <ol className="relative space-y-4 border-l border-slate-200 pl-6">
                {evenements.map((e) => (
                  <li key={e.id} className="relative">
                    <span
                      className="absolute -left-[1.72rem] top-1 grid h-3 w-3 place-items-center rounded-full bg-brand ring-4 ring-white"
                      aria-hidden
                    />
                    <p className="text-sm">{e.libelle}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {new Date(e.horodatage).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {e.origine === "TERRAIN" ? "terrain" : e.origine === "BUREAU" ? "bureau" : "système"}
                      {e.syncedAt === undefined && e.origine === "TERRAIN" ? (
                        <span className="ml-1.5 font-medium text-amber-700">
                          (en attente de synchronisation)
                        </span>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Carte>

          {/* Preuve */}
          <Carte titre="Preuve de livraison">
            {!preuve ? (
              <EtatVide
                titre="Aucune preuve enregistrée"
                description="La preuve est déposée par le livreur depuis son espace, une fois arrivé chez le client."
              />
            ) : (
              <div className="space-y-3 text-sm">
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-ink-500">Réceptionnaire</dt>
                    <dd className="mt-0.5">{preuve.nomReceptionnaire ?? "Non renseigné"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-500">Horodatage</dt>
                    <dd className="mt-0.5">
                      {new Date(preuve.recordedAt).toLocaleString("fr-FR")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-500">Photo</dt>
                    <dd className="mt-0.5">
                      {preuve.photoRef ? (
                        <Pastille ton="succes">Photo jointe</Pastille>
                      ) : (
                        <Pastille ton="neutre">Aucune photo</Pastille>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-500">Position</dt>
                    <dd className="mt-0.5">
                      {preuve.position ? (
                        <Pastille ton="succes">
                          {preuve.position.lat.toFixed(4)}, {preuve.position.lng.toFixed(4)}
                        </Pastille>
                      ) : (
                        <Pastille ton="neutre">Position non transmise</Pastille>
                      )}
                    </dd>
                  </div>
                </dl>
                {preuve.commentaire ? (
                  <p className="rounded-xl bg-surface px-4 py-3 leading-relaxed text-ink-700">
                    {preuve.commentaire}
                  </p>
                ) : null}
              </div>
            )}
          </Carte>
        </div>

        {/* Colonne latérale */}
        <div className="space-y-6">
          <Carte titre="Destinataire">
            {client ? (
              <div className="space-y-3 text-sm">
                <p className="font-medium">{client.nom}</p>
                <a
                  href={`tel:${client.telephone.replace(/\s/g, "")}`}
                  className="inline-flex items-center gap-1.5 text-brand"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden />
                  {client.telephone}
                </a>
                <div>
                  <p className="text-ink-700">{livraison.adresse.ligne}</p>
                  <p className="text-xs text-ink-500">{livraison.adresse.zone}</p>
                  {livraison.adresse.repere ? (
                    <p className="mt-1 text-xs text-ink-500">
                      Repère : {livraison.adresse.repere}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-500">Client introuvable.</p>
            )}
          </Carte>

          <Carte titre="Livreur">
            {livreur ? (
              <div className="space-y-2 text-sm">
                <p className="font-medium">{livreur.nom}</p>
                <p className="text-ink-500">
                  {livreur.matricule} · {livreur.telephone}
                </p>
                <Link
                  href={lienDetail("/app/livreurs/detail", livreur.id)}
                  className="text-xs font-semibold text-brand"
                >
                  Voir la fiche livreur
                </Link>
              </div>
            ) : (
              <p className="text-sm text-ink-500">Aucun livreur affecté.</p>
            )}
          </Carte>

          {/* Affectation */}
          {livraison.statut === "A_AFFECTER" ? (
            <Carte titre="Affecter un livreur">
              <div className="space-y-3">
                <select
                  value={livreurChoisi}
                  onChange={(e) => setLivreurChoisi(e.target.value)}
                  aria-label="Choisir un livreur"
                  className={CLASSE_SAISIE}
                >
                  <option value="">Choisir un livreur…</option>
                  {etat.monde.livreurs
                    .filter((l) => l.actif)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nom} — {l.matricule}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={!livreurChoisi}
                  onClick={() =>
                    agir(
                      () => affecter(livraison.id, livreurChoisi),
                      "Livraison affectée.",
                    )
                  }
                  className="btn-primary w-full text-sm disabled:opacity-50"
                >
                  Affecter
                </button>
              </div>
            </Carte>
          ) : null}

          {/* Encaissement */}
          <Carte titre="Encaissement">
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-baseline justify-between">
                <dt className="text-ink-500">Montant attendu</dt>
                <dd className="tabular-nums">{formaterFcfa(encaissement.montantAttendu)}</dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-ink-500">Encaissé</dt>
                <dd className="font-semibold tabular-nums text-success">
                  {formaterFcfa(encaissement.montantEncaisse)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-ink-500">Reste</dt>
                <dd className="tabular-nums">{formaterFcfa(encaissement.reste)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-slate-200 pt-2.5">
                <dt className="text-ink-500">Statut</dt>
                <dd>
                  <Pastille ton={encaissement.statut === "ENCAISSE" ? "succes" : "neutre"}>
                    {encaissement.libelle}
                  </Pastille>
                </dd>
              </div>
            </dl>

            {encaissement.paiements.length > 0 ? (
              <ul className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-xs">
                {encaissement.paiements.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-2">
                    <span className="text-ink-500">
                      {LIBELLES_MODE_PAIEMENT[p.mode]}
                      {p.syncedAt === undefined ? " · à synchroniser" : ""}
                    </span>
                    <span className="tabular-nums">{formaterFcfa(p.montant)}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {!close && encaissement.reste > 0 ? (
              <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
                <input
                  type="number"
                  min={0}
                  max={encaissement.reste}
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  placeholder={`Montant à encaisser (max ${encaissement.reste})`}
                  aria-label="Montant encaissé"
                  className={CLASSE_SAISIE}
                />
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as ModePaiement)}
                  aria-label="Mode de paiement"
                  className={CLASSE_SAISIE}
                >
                  {(Object.keys(LIBELLES_MODE_PAIEMENT) as ModePaiement[]).map((m) => (
                    <option key={m} value={m}>
                      {LIBELLES_MODE_PAIEMENT[m]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const r = encaisser({
                      livraisonId: livraison.id,
                      montant: Number(montant),
                      mode,
                    });
                    if (!r.ok) {
                      setErreur(r.raison);
                      setSucces(null);
                      return;
                    }
                    setErreur(null);
                    setSucces("Encaissement enregistré.");
                    setMontant("");
                  }}
                  className="btn-primary w-full text-sm"
                >
                  Enregistrer l&apos;encaissement
                </button>
              </div>
            ) : null}
          </Carte>

          {/* Transitions autorisées */}
          {!close ? (
            <Carte titre="Étapes suivantes">
              <ul className="space-y-2 text-sm">
                {statutsLivraisonSuivants(livraison.statut).map((s) => (
                  <li key={s} className="flex items-center gap-2 text-ink-500">
                    {s === "ARRIVE" ? (
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    ) : s === "ECHEC" ? (
                      <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" aria-hidden />
                    )}
                    {STATUTS_LIVRAISON[s].libelle}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-relaxed text-ink-500">
                Les étapes terrain sont déclenchées par le livreur depuis son espace, pour que
                l&apos;heure et la position enregistrées soient celles du terrain.
              </p>
              <Link
                href="/app/livreur"
                className="mt-3 inline-block text-xs font-semibold text-brand"
              >
                Ouvrir l&apos;espace livreur
              </Link>
            </Carte>
          ) : null}
        </div>
      </div>
    </div>
  );
}
