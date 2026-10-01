"use client";

// Espace livreur.
//
// Volontairement en une seule page : le livreur travaille debout, sur un
// téléphone Android, souvent en plein soleil. Chaque action est un grand bouton,
// et l'état de synchronisation est visible en permanence.
//
// Les transitions passent par les mêmes règles que le bureau : le livreur ne
// peut ni annuler, ni réaffecter, ni livrer une commande qui n'est pas arrivée.

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CloudOff,
  MapPin,
  Navigation,
  Phone,
  Send,
  TriangleAlert,
} from "lucide-react";
import {
  BandeauDemo,
  Carte,
  CLASSE_SAISIE,
  EtatVide,
  MessageRefus,
  MessageSucces,
  Pastille,
  StatutLivraisonPastille,
} from "@/components/app/partage/ui";
import { useMagasin } from "@/lib/magasin";
import { LIVREUR_DEMO } from "@/lib/domain/donnees-demo";
import { actionsLivreur } from "@/lib/domain/statuts";
import { calculerEncaissement, formaterFcfa, LIBELLES_MODE_PAIEMENT } from "@/lib/domain/paiements";
import { evaluerFraicheur, libelleFraicheur } from "@/lib/tracking";
import { useParametreId, lienDetail } from "@/lib/use-parametre";
import type { ModePaiement } from "@/lib/domain/types";

export default function EspaceLivreurPage() {
  const { id, pret } = useParametreId();
  const {
    etat,
    demarrer,
    arriver,
    terminer,
    echouer,
    ajouterPreuve,
    encaisser,
    positionner,
    synchroniserTout,
  } = useMagasin();

  // Le livreur de démonstration peut être remplacé par ?id=drv-2 pour montrer
  // l'isolation : chacun ne voit que ses propres livraisons.
  const livreurId = id ?? LIVREUR_DEMO;

  const [selection, setSelection] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [motif, setMotif] = useState("");
  const [receptionnaire, setReceptionnaire] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [montant, setMontant] = useState("");
  const [mode, setMode] = useState<ModePaiement>("ESPECES");

  if (!pret) return null;

  const livreur = etat.monde.livreurs.find((l) => l.id === livreurId);
  if (!livreur) {
    return (
      <EtatVide
        titre="Livreur introuvable"
        description="L'identifiant du livreur est incorrect."
        action={
          <Link href="/app" className="btn-primary text-sm">
            Retour au tableau de bord
          </Link>
        }
      />
    );
  }

  const maintenant = Date.now();
  // Périmètre du livreur : uniquement ses propres livraisons.
  const mesLivraisons = etat.monde.livraisons
    .filter((l) => l.livreurId === livreur.id)
    .sort((a, b) => a.createdAt - b.createdAt);
  const actives = mesLivraisons.filter(
    (l) => l.statut !== "LIVREE" && l.statut !== "ECHEC" && l.statut !== "ANNULEE",
  );
  const enAttente = etat.file.filter((o) => o.etat === "EN_ATTENTE").length;

  const livraison = selection
    ? mesLivraisons.find((l) => l.id === selection)
    : actives[0];
  const client = livraison
    ? etat.monde.clients.find((c) => c.id === livraison.clientId)
    : undefined;
  const encaissement = livraison
    ? calculerEncaissement(livraison, etat.monde.paiements)
    : undefined;
  const preuve = livraison
    ? etat.monde.preuves.find((p) => p.id === livraison.preuveId)
    : undefined;

  const positions = livraison
    ? etat.monde.positions
        .filter((p) => p.livraisonId === livraison.id)
        .sort((a, b) => a.recordedAt - b.recordedAt)
    : [];
  const derniere = positions.at(-1);

  const agir = (f: () => { ok: boolean; raison?: string }, message: string) => {
    const r = f();
    if (!r.ok) {
      setErreur(r.raison ?? "Action refusée.");
      setSucces(null);
      return;
    }
    setErreur(null);
    setSucces(message);
  };

  // Sans backend, la position est produite localement pour démontrer le
  // contrat d'ingestion. Elle est clairement identifiée comme telle.
  const envoyerPosition = () => {
    if (!livraison || !client?.adresse.lat || client.adresse.lng === undefined) return;
    const r = positionner({
      clientId: crypto.randomUUID(),
      livraisonId: livraison.id,
      lat: client.adresse.lat,
      lng: client.adresse.lng,
      accuracy: 10,
      recordedAt: Date.now(),
    });
    if (!r.ok) {
      setErreur(r.raison ?? "Position refusée.");
      return;
    }
    setErreur(null);
    setSucces(
      r.valeur.ajoutee
        ? "Position transmise. Elle apparaît sur la carte du bureau."
        : "Position déjà connue : elle n'a pas été comptée deux fois.",
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="rounded-2xl bg-ink p-5 text-white">
        <p className="text-sm text-slate-300">Bonjour</p>
        <h1 className="mt-0.5 text-2xl font-semibold">{livreur.nom}</h1>
        <p className="mt-3 text-sm text-slate-300">
          {actives.length} livraison{actives.length > 1 ? "s" : ""} en cours aujourd&apos;hui
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {etat.enLigne ? (
            <Pastille ton="succes">En ligne</Pastille>
          ) : (
            <Pastille ton="echec">Hors ligne</Pastille>
          )}
          {enAttente > 0 ? (
            <button
              type="button"
              onClick={synchroniserTout}
              disabled={!etat.enLigne}
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-2.5 py-1 text-xs font-medium text-amber-200 disabled:opacity-60"
            >
              <CloudOff className="h-3 w-3" aria-hidden />
              {enAttente} à synchroniser
            </button>
          ) : (
            <Pastille ton="succes">Tout est synchronisé</Pastille>
          )}
        </div>
      </div>

      <BandeauDemo precision="Scénario de démonstration : le livreur et les livraisons sont fictifs. En production, les positions viennent du téléphone du livreur." />

      {erreur ? <MessageRefus message={erreur} /> : null}
      {succes ? <MessageSucces message={succes} /> : null}

      {mesLivraisons.length === 0 ? (
        <Carte>
          <EtatVide
            titre="Aucune livraison"
            description="Vous n'avez aucune livraison confiée pour le moment."
          />
        </Carte>
      ) : (
        <>
          {/* Sélection de la tournée */}
          <Carte titre="Ma tournée">
            <ul className="divide-y divide-slate-100">
              {mesLivraisons.map((l) => {
                const c = etat.monde.clients.find((x) => x.id === l.clientId);
                const active = livraison?.id === l.id;
                return (
                  <li key={l.id} className="py-2.5 first:pt-0 last:pb-0">
                    <button
                      type="button"
                      onClick={() => setSelection(l.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                        active ? "bg-brand-soft" : "hover:bg-surface"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {l.reference} · {c?.nom ?? "—"}
                        </p>
                        <p className="text-xs text-ink-500">
                          {l.adresse.zone} · {formaterFcfa(l.montantAttendu)}
                        </p>
                      </div>
                      <StatutLivraisonPastille statut={l.statut} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Carte>

          {livraison && client ? (
            <>
              {/* Détail de la livraison */}
              <Carte>
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-ink-500">
                        Livraison {livraison.reference}
                      </p>
                      <h2 className="mt-1 text-lg font-semibold">{client.nom}</h2>
                    </div>
                    <StatutLivraisonPastille statut={livraison.statut} />
                  </div>

                  <div className="space-y-1.5 rounded-xl bg-surface px-4 py-3 text-sm">
                    <p className="font-medium text-ink-700">{livraison.adresse.ligne}</p>
                    <p className="text-xs text-ink-500">{livraison.adresse.zone}</p>
                    {livraison.adresse.repere ? (
                      <p className="text-xs text-ink-500">Repère : {livraison.adresse.repere}</p>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
                      À encaisser
                    </p>
                    <p className="mt-0.5 text-xl font-semibold tabular-nums text-amber-900">
                      {formaterFcfa(encaissement!.reste)}
                    </p>
                    {encaissement!.montantEncaisse > 0 ? (
                      <p className="mt-0.5 text-xs text-amber-800">
                        Déjà encaissé : {formaterFcfa(encaissement!.montantEncaisse)}
                      </p>
                    ) : null}
                  </div>

                  {/* Actions rapides */}
                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href={`tel:${client.telephone.replace(/\s/g, "")}`}
                      className="btn-ghost justify-center text-sm"
                    >
                      <Phone className="h-4 w-4" aria-hidden /> Appeler
                    </a>
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${livraison.destination.lat}&mlon=${livraison.destination.lng}#map=16/${livraison.destination.lat}/${livraison.destination.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-ghost justify-center text-sm"
                    >
                      <Navigation className="h-4 w-4" aria-hidden /> GPS
                    </a>
                  </div>

                  {/* Transitions terrain */}
                  <div className="space-y-2">
                    {actionsLivreur(livraison.statut).map((a) => (
                      <button
                        key={a.action}
                        type="button"
                        onClick={() => {
                          if (a.action === "DEMARRER") {
                            agir(() => demarrer(livraison.id), "Livraison démarrée. Bonne route.");
                          } else if (a.action === "ARRIVER") {
                            agir(() => arriver(livraison.id), "Arrivée enregistrée.");
                          } else if (a.action === "LIVRER") {
                            if (!preuve) {
                              setErreur(
                                "Enregistrez d'abord la preuve de livraison avant de clôturer.",
                              );
                              setSucces(null);
                              return;
                            }
                            agir(() => terminer(livraison.id), "Livraison effectuée.");
                          } else {
                            setSelection(livraison.id);
                            setMotif("");
                          }
                        }}
                        className={
                          a.action === "ECHOUER"
                            ? "w-full rounded-xl border border-red-200 px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                            : "btn-primary w-full py-3 text-sm"
                        }
                      >
                        {a.libelle}
                      </button>
                    ))}
                  </div>

                  {livraison.statut === "EN_ROUTE" ? (
                    <button
                      type="button"
                      onClick={envoyerPosition}
                      className="btn-ghost w-full text-sm"
                    >
                      <Send className="h-4 w-4" aria-hidden /> Transmettre ma position
                    </button>
                  ) : null}

                  {derniere ? (
                    <p className="flex items-center gap-1.5 text-xs text-ink-500">
                      <MapPin className="h-3 w-3" aria-hidden />
                      {libelleFraicheur(derniere, maintenant)}
                      {evaluerFraicheur(derniere, maintenant) === "FRAICHE" ? (
                        <span className="font-medium text-success">· à jour</span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              </Carte>

              {/* Échec motivé */}
              {livraison.statut !== "LIVREE" &&
              livraison.statut !== "ECHEC" &&
              livraison.statut !== "ANNULEE" ? (
                <Carte titre="Signaler un échec">
                  <div className="space-y-2">
                    <textarea
                      value={motif}
                      onChange={(e) => setMotif(e.target.value)}
                      rows={2}
                      placeholder="Raison : client injoignable, adresse introuvable, refus…"
                      aria-label="Motif de l'échec"
                      className={CLASSE_SAISIE}
                    />
                    <button
                      type="button"
                      disabled={!motif.trim()}
                      onClick={() =>
                        agir(
                          () => echouer(livraison.id, motif),
                          "Échec signalé. Le bureau est informé.",
                        )
                      }
                      className="w-full rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                    >
                      <TriangleAlert className="mr-1.5 inline h-4 w-4" aria-hidden />
                      Confirmer l&apos;échec
                    </button>
                  </div>
                </Carte>
              ) : null}

              {/* Preuve */}
              {livraison.statut === "ARRIVE" || livraison.statut === "LIVREE" ? (
                <Carte titre="Preuve de livraison">
                  {preuve ? (
                    <div className="space-y-2 text-sm">
                      <p className="flex items-center gap-1.5 font-medium text-success">
                        <CheckCircle2 className="h-4 w-4" aria-hidden />
                        Preuve enregistrée
                      </p>
                      <p className="text-ink-500">
                        {preuve.nomReceptionnaire
                          ? `Réceptionnaire : ${preuve.nomReceptionnaire}`
                          : "Aucun réceptionnaire renseigné"}
                      </p>
                      <p className="text-xs text-ink-500">
                        Photo : {preuve.photoRef ? "jointe" : "aucune"} · Position :{" "}
                        {preuve.position ? "transmise" : "non transmise"}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={receptionnaire}
                        onChange={(e) => setReceptionnaire(e.target.value)}
                        placeholder="Nom du réceptionnaire"
                        aria-label="Nom du réceptionnaire"
                        className={CLASSE_SAISIE}
                      />
                      <textarea
                        value={commentaire}
                        onChange={(e) => setCommentaire(e.target.value)}
                        rows={2}
                        placeholder="Commentaire (optionnel)"
                        aria-label="Commentaire de la preuve"
                        className={CLASSE_SAISIE}
                      />
                      <p className="text-xs leading-relaxed text-ink-500">
                        Aucune photo n&apos;est simulée : sans appareil photo branché, la preuve
                        est enregistrée avec le réceptionnaire et le commentaire uniquement. Les
                        champs photo et position restent vides tant qu&apos;ils ne sont pas
                        réellement fournis.
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          agir(
                            () =>
                              ajouterPreuve({
                                livraisonId: livraison.id,
                                nomReceptionnaire: receptionnaire || undefined,
                                commentaire: commentaire || undefined,
                              }),
                            "Preuve enregistrée.",
                          )
                        }
                        className="btn-primary w-full text-sm"
                      >
                        Enregistrer la preuve
                      </button>
                    </div>
                  )}
                </Carte>
              ) : null}

              {/* Encaissement */}
              {livraison.statut !== "ECHEC" && livraison.statut !== "ANNULEE" ? (
                <Carte titre="Encaissement">
                  <div className="space-y-3">
                    <dl className="space-y-2 text-sm">
                      <div className="flex items-baseline justify-between">
                        <dt className="text-ink-500">Attendu</dt>
                        <dd className="tabular-nums">
                          {formaterFcfa(encaissement!.montantAttendu)}
                        </dd>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <dt className="text-ink-500">Encaissé</dt>
                        <dd className="font-semibold tabular-nums text-success">
                          {formaterFcfa(encaissement!.montantEncaisse)}
                        </dd>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <dt className="text-ink-500">Reste</dt>
                        <dd className="tabular-nums">{formaterFcfa(encaissement!.reste)}</dd>
                      </div>
                    </dl>

                    {encaissement!.reste > 0 ? (
                      <>
                        <input
                          type="number"
                          min={0}
                          max={encaissement!.reste}
                          value={montant}
                          onChange={(e) => setMontant(e.target.value)}
                          placeholder={`Montant reçu (max ${encaissement!.reste})`}
                          aria-label="Montant reçu"
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
                          Enregistrer
                        </button>
                      </>
                    ) : (
                      <Pastille ton="succes">Montant intégralement encaissé</Pastille>
                    )}
                  </div>
                </Carte>
              ) : null}

              <Link
                href={lienDetail("/app/livraisons/detail", livraison.id)}
                className="block text-center text-xs font-semibold text-brand"
              >
                Voir la fiche complète de la livraison
              </Link>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
