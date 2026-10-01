"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Phone, Plus } from "lucide-react";
import {
  BandeauDemo,
  Carte,
  Champ,
  CLASSE_SAISIE,
  EnTetePage,
  EtatVide,
  MessageRefus,
  MessageSucces,
  Pastille,
  StatutCommandePastille,
  StatutLivraisonPastille,
} from "@/components/app/partage/ui";
import { FormulaireCommande } from "@/components/app/commandes/formulaire-commande";
import { useMagasin } from "@/lib/magasin";
import { calculerEncaissement, formaterFcfa } from "@/lib/domain/paiements";
import { statutsCommandeSuivants, STATUTS_COMMANDE } from "@/lib/domain/statuts";
import { useParametreId, lienDetail } from "@/lib/use-parametre";
import type { StatutCommande } from "@/lib/domain/types";

export default function DetailCommandePage() {
  const { id, pret } = useParametreId();
  const {
    etat,
    creerLivraison,
    affecter,
    annulerCommande,
    modifierCommande,
    faireEvoluerCommande,
  } = useMagasin();

  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [modification, setModification] = useState(false);
  const [livreurChoisi, setLivreurChoisi] = useState("");

  if (!pret) return null;

  const commande = etat.monde.commandes.find((c) => c.id === id);

  if (!commande) {
    return (
      <div className="space-y-6">
        <EnTetePage titre="Commande introuvable" />
        <EtatVide
          titre="Cette commande n'existe pas"
          description="L'identifiant est peut-être incorrect, ou la commande a été retirée."
          action={
            <Link href="/app/commandes" className="btn-primary text-sm">
              Retour aux commandes
            </Link>
          }
        />
      </div>
    );
  }

  const client = etat.monde.clients.find((c) => c.id === commande.clientId);
  const livraison = etat.monde.livraisons.find((l) => l.id === commande.livraisonId);
  const livreur = livraison?.livreurId
    ? etat.monde.livreurs.find((l) => l.id === livraison.livreurId)
    : undefined;
  const encaissement = livraison
    ? calculerEncaissement(livraison, etat.monde.paiements)
    : undefined;

  const close = ["LIVREE", "ECHEC", "ANNULEE"].includes(commande.statut);

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

  // Transitions manuelles utiles au bureau : préparation et mise à disposition.
  // Les étapes terrain sont pilotées par la livraison, pas depuis cet écran.
  const statutsPossibles = statutsCommandeSuivants(commande.statut).filter(
    (s) => s === "PRETE" || s === "A_AFFECTER",
  ) as StatutCommande[];

  return (
    <div className="space-y-6">
      <EnTetePage
        titre={`Commande ${commande.reference}`}
        description={`Créée le ${new Date(commande.dateCommande).toLocaleDateString("fr-FR")} · ${commande.lignes.length} ligne${commande.lignes.length > 1 ? "s" : ""}`}
        actions={
          <>
            <Link href="/app/commandes" className="btn-ghost text-sm">
              Retour
            </Link>
            <StatutCommandePastille statut={commande.statut} />
          </>
        }
      />

      <BandeauDemo />

      {erreur ? <MessageRefus message={erreur} /> : null}
      {succes ? <MessageSucces message={succes} /> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Carte titre="Articles">
            <ul className="divide-y divide-slate-100">
              {commande.lignes.map((l) => (
                <li
                  key={l.id}
                  className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.designation}</p>
                    <p className="text-xs text-ink-500">
                      {l.quantite} × {formaterFcfa(l.prixUnitaire)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums">
                    {formaterFcfa(l.quantite * l.prixUnitaire)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-baseline justify-between border-t border-slate-200 pt-4">
              <span className="text-sm font-medium">Montant attendu</span>
              <span className="text-lg font-semibold tabular-nums">
                {formaterFcfa(commande.montantAttendu)}
              </span>
            </div>
          </Carte>

          {modification ? (
            <Carte titre="Modifier la commande">
              <FormulaireCommande
                clients={etat.monde.clients}
                initial={{
                  clientId: commande.clientId,
                  lignes: commande.lignes.map((l) => ({
                    designation: l.designation,
                    quantite: l.quantite,
                    prixUnitaire: l.prixUnitaire,
                  })),
                  note: commande.note,
                }}
                libelleAction="Enregistrer"
                onValider={(v) => {
                  const r = modifierCommande({ commandeId: commande.id, ...v });
                  if (!r.ok) return r.raison;
                  setModification(false);
                  setSucces("Commande mise à jour.");
                  return null;
                }}
                onAnnuler={() => setModification(false)}
              />
            </Carte>
          ) : (
            <Carte
              titre="Livraison"
              action={
                !livraison && !close ? (
                  <button
                    type="button"
                    onClick={() =>
                      agir(
                        () => creerLivraison(commande.id),
                        "Livraison créée. Affectez-la maintenant à un livreur.",
                      )
                    }
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden /> Créer la livraison
                  </button>
                ) : undefined
              }
            >
              {!livraison ? (
                <EtatVide
                  titre="Aucune livraison pour cette commande"
                  description={
                    commande.statut === "ANNULEE"
                      ? "Cette commande est annulée : aucune livraison ne sera créée."
                      : "Créez la livraison, puis affectez-la à un livreur."
                  }
                />
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <Link
                        href={lienDetail("/app/livraisons/detail", livraison.id)}
                        className="text-sm font-semibold text-brand hover:underline"
                      >
                        {livraison.reference}
                      </Link>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {livraison.adresse.ligne} · {livraison.adresse.zone}
                      </p>
                    </div>
                    <StatutLivraisonPastille statut={livraison.statut} />
                  </div>

                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-ink-500">Livreur</dt>
                      <dd className="mt-0.5">
                        {livreur ? `${livreur.nom} (${livreur.matricule})` : "Non affecté"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-500">Encaissement</dt>
                      <dd className="mt-0.5">
                        {encaissement
                          ? `${formaterFcfa(encaissement.montantEncaisse)} / ${formaterFcfa(encaissement.montantAttendu)} · ${encaissement.libelle}`
                          : "—"}
                      </dd>
                    </div>
                  </dl>

                  {livraison.statut === "A_AFFECTER" ? (
                    <div className="rounded-xl bg-surface p-4">
                      <Champ label="Affecter à un livreur">
                        <div className="flex flex-wrap gap-2">
                          <select
                            value={livreurChoisi}
                            onChange={(e) => setLivreurChoisi(e.target.value)}
                            className={`${CLASSE_SAISIE} min-w-48 flex-1`}
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
                                "Livraison affectée. Le livreur la voit dans son espace.",
                              )
                            }
                            className="btn-primary text-sm disabled:opacity-50"
                          >
                            Affecter
                          </button>
                        </div>
                      </Champ>
                    </div>
                  ) : null}

                  <Link
                    href={lienDetail("/app/livraisons/detail", livraison.id)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand"
                  >
                    Ouvrir le suivi de la livraison
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
              )}
            </Carte>
          )}
        </div>

        <div className="space-y-6">
          <Carte titre="Client">
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
                  <p className="text-ink-700">{client.adresse.ligne}</p>
                  <p className="text-xs text-ink-500">
                    {client.adresse.zone}, {client.adresse.ville}
                  </p>
                  {client.adresse.repere ? (
                    <p className="mt-1 text-xs text-ink-500">Repère : {client.adresse.repere}</p>
                  ) : null}
                </div>
                {client.adresse.lat !== undefined ? (
                  <Pastille ton="succes">Point GPS renseigné</Pastille>
                ) : (
                  <Pastille ton="echec">Aucun point GPS</Pastille>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-500">Client introuvable.</p>
            )}
          </Carte>

          <Carte titre="Actions">
            <div className="space-y-2">
              {!close ? (
                <button
                  type="button"
                  onClick={() => setModification((v) => !v)}
                  className="btn-ghost w-full text-sm"
                >
                  {modification ? "Fermer la modification" : "Modifier la commande"}
                </button>
              ) : null}

              {statutsPossibles.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    agir(
                      () => faireEvoluerCommande(commande.id, s),
                      `Commande marquée « ${STATUTS_COMMANDE[s].libelle} ».`,
                    )
                  }
                  className="btn-ghost w-full text-sm"
                >
                  Marquer « {STATUTS_COMMANDE[s].libelle} »
                </button>
              ))}

              {!close ? (
                <button
                  type="button"
                  onClick={() => agir(() => annulerCommande(commande.id), "Commande annulée.")}
                  className="w-full rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                  Annuler la commande
                </button>
              ) : null}
            </div>
          </Carte>

          {commande.note ? (
            <Carte titre="Note">
              <p className="text-sm leading-relaxed text-ink-700">{commande.note}</p>
            </Carte>
          ) : null}
        </div>
      </div>
    </div>
  );
}
