"use client";

import Link from "next/link";
import { useState } from "react";
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
import { useMagasin } from "@/lib/magasin";
import { calculerCaisseLivreur, formaterFcfa, libelleEcart } from "@/lib/domain/paiements";
import { calculerPerformanceLivreur } from "@/lib/domain/rapports";
import { evaluerFraicheur, libelleFraicheur } from "@/lib/tracking";
import { useParametreId, lienDetail } from "@/lib/use-parametre";

export default function DetailLivreurPage() {
  const { id, pret } = useParametreId();
  const { etat, remiser } = useMagasin();
  const [montant, setMontant] = useState("");
  const [note, setNote] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  if (!pret) return null;

  const livreur = etat.monde.livreurs.find((l) => l.id === id);

  if (!livreur) {
    return (
      <div className="space-y-6">
        <EnTetePage titre="Livreur introuvable" />
        <EtatVide
          titre="Ce livreur n'existe pas"
          description="L'identifiant est peut-être incorrect."
          action={
            <Link href="/app/livreurs" className="btn-primary text-sm">
              Retour aux livreurs
            </Link>
          }
        />
      </div>
    );
  }

  const maintenant = Date.now();
  const livraisons = etat.monde.livraisons
    .filter((l) => l.livreurId === livreur.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  const vehicule = etat.monde.vehicules.find((v) => v.id === livreur.vehiculeId);
  const caisse = calculerCaisseLivreur({
    livreurId: livreur.id,
    livraisons: etat.monde.livraisons,
    paiements: etat.monde.paiements,
    remises: etat.monde.remises,
  });
  const performance = calculerPerformanceLivreur({
    livreurId: livreur.id,
    livraisons: etat.monde.livraisons,
  });
  const resteARemettre = Math.max(0, caisse.montantARemettre - caisse.montantRemis);

  const dernierePosition = (livraisonId: string) => {
    const positions = etat.monde.positions
      .filter((p) => p.livraisonId === livraisonId)
      .sort((a, b) => a.recordedAt - b.recordedAt);
    return positions.at(-1);
  };

  return (
    <div className="space-y-6">
      <EnTetePage
        titre={livreur.nom}
        description={`${livreur.matricule} · ${livreur.telephone}${vehicule ? ` · ${vehicule.libelle}` : ""}`}
        actions={
          <>
            <Link href="/app/livreurs" className="btn-ghost text-sm">
              Retour
            </Link>
            <Pastille ton={livreur.actif ? "succes" : "echec"}>
              {livreur.actif ? "Actif" : "Désactivé"}
            </Pastille>
          </>
        }
      />

      <BandeauDemo />

      {erreur ? <MessageRefus message={erreur} /> : null}
      {succes ? <MessageSucces message={succes} /> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Carte titre={`Livraisons (${livraisons.length})`}>
            {livraisons.length === 0 ? (
              <EtatVide
                titre="Aucune livraison confiée"
                description="Les livraisons affectées à ce livreur apparaîtront ici."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {livraisons.map((l) => {
                  const derniere = dernierePosition(l.id);
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
                            {client?.nom ?? "—"} · {l.adresse.zone} ·{" "}
                            {formaterFcfa(l.montantAttendu)}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-500">
                            {libelleFraicheur(derniere, maintenant)}
                            {derniere && evaluerFraicheur(derniere, maintenant) === "FRAICHE" ? (
                              <span className="ml-1 font-medium text-success">· à jour</span>
                            ) : null}
                          </p>
                        </div>
                        <StatutLivraisonPastille statut={l.statut} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Carte>

          <Carte titre="Performance">
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-ink-500">Confiées</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{performance.livraisonsConfiees}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Livrées</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-success">
                  {performance.livrees}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Échecs</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{performance.echouees}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Durée moyenne</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">
                  {performance.dureeMoyenneMinutes !== null
                    ? `${performance.dureeMoyenneMinutes} min`
                    : "Non mesurée"}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-ink-500">
              Aucun taux de réussite ni pourcentage d&apos;efficacité n&apos;est affiché : ces
              indicateurs n&apos;auraient pas de sens sans un volume et un historique suffisants.
              {performance.dureeMoyenneMinutes === null
                ? " La durée moyenne reste « non mesurée » tant qu'aucune livraison complète n'a été enregistrée."
                : " La durée moyenne est calculée sur les seules livraisons effectivement parties puis livrées."}
            </p>
          </Carte>
        </div>

        <div className="space-y-6">
          <Carte titre="Caisse">
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-baseline justify-between">
                <dt className="text-ink-500">Montant attendu</dt>
                <dd className="tabular-nums">{formaterFcfa(caisse.montantAttendu)}</dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-ink-500">Encaissé</dt>
                <dd className="font-semibold tabular-nums">{formaterFcfa(caisse.montantEncaisse)}</dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-ink-500">Restant à encaisser</dt>
                <dd className="tabular-nums">{formaterFcfa(caisse.montantRestantAEncaisser)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-slate-200 pt-2.5">
                <dt className="text-ink-500">À remettre</dt>
                <dd className="font-semibold tabular-nums text-amber-700">
                  {formaterFcfa(resteARemettre)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-ink-500">Déjà remis</dt>
                <dd className="tabular-nums">{formaterFcfa(caisse.montantRemis)}</dd>
              </div>
            </dl>
            <p
              className={
                caisse.ecart === 0
                  ? "mt-4 border-t border-slate-200 pt-4 text-sm font-semibold text-success"
                  : "mt-4 border-t border-slate-200 pt-4 text-sm font-semibold text-red-600"
              }
            >
              {libelleEcart(caisse.ecart)}
            </p>

            {resteARemettre > 0 ? (
              <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
                <input
                  type="number"
                  min={0}
                  max={resteARemettre}
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  placeholder={`Montant remis (max ${resteARemettre})`}
                  aria-label="Montant remis"
                  className={CLASSE_SAISIE}
                />
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note (optionnel)"
                  aria-label="Note de remise"
                  className={CLASSE_SAISIE}
                />
                <button
                  type="button"
                  onClick={() => {
                    const r = remiser({
                      livreurId: livreur.id,
                      montant: Number(montant),
                      note: note.trim() || undefined,
                    });
                    if (!r.ok) {
                      setErreur(r.raison);
                      setSucces(null);
                      return;
                    }
                    setErreur(null);
                    setSucces("Remise enregistrée.");
                    setMontant("");
                    setNote("");
                  }}
                  className="btn-primary w-full text-sm"
                >
                  Enregistrer la remise
                </button>
              </div>
            ) : null}
          </Carte>

          {etat.monde.remises.filter((r) => r.livreurId === livreur.id).length > 0 ? (
            <Carte titre="Remises">
              <ul className="space-y-2 text-xs">
                {etat.monde.remises
                  .filter((r) => r.livreurId === livreur.id)
                  .map((r) => (
                    <li key={r.id} className="flex items-baseline justify-between gap-2">
                      <span className="text-ink-500">
                        {new Date(r.recordedAt).toLocaleString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {r.note ? ` · ${r.note}` : ""}
                      </span>
                      <span className="shrink-0 tabular-nums">{formaterFcfa(r.montant)}</span>
                    </li>
                  ))}
              </ul>
            </Carte>
          ) : null}
        </div>
      </div>
    </div>
  );
}
