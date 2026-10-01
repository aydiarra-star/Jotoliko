"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, TriangleAlert } from "lucide-react";
import {
  BandeauDemo,
  Carte,
  EnTetePage,
  EtatVide,
  MessageRefus,
  MessageSucces,
  CLASSE_SAISIE,
} from "@/components/app/partage/ui";
import { useMagasin } from "@/lib/magasin";
import { formaterFcfa, libelleEcart, type LigneCaisseLivreur } from "@/lib/domain/paiements";
import { construireClotureJournee } from "@/lib/domain/rapports";
import type { Resultat } from "@/lib/domain/types";
import { lienDetail } from "@/lib/use-parametre";

export default function CloturePage() {
  const { etat, justifierEcart } = useMagasin();
  const maintenant = Date.now();

  const cloture = construireClotureJournee({
    maintenant,
    commandes: etat.monde.commandes,
    livraisons: etat.monde.livraisons,
    paiements: etat.monde.paiements,
    remises: etat.monde.remises,
    livreurIds: etat.monde.livreurs.map((l) => l.id),
    justifications: etat.monde.justifications,
  });

  const jour = new Date(cloture.journee.debut).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const nomLivreur = (id: string) =>
    etat.monde.livreurs.find((l) => l.id === id)?.nom ?? "—";

  // Les livreurs qui ont effectivement travaillé : les autres n'ont rien à
  // clôturer, et les afficher noierait l'information utile.
  const lignes = etat.monde.livreurs
    .map((l) => cloture.lignes.find((x) => x.livreurId === l.id))
    .filter((x): x is LigneCaisseLivreur => Boolean(x))
    .filter((x) => x.livraisonsConfiees > 0 || x.montantEncaisse > 0 || x.montantRemis > 0);

  return (
    <div className="space-y-6">
      <EnTetePage
        titre="Clôture de journée"
        description={`Arrêter la journée du ${jour} sans tableur : ce qui a été fait, ce qui a été encaissé, ce qui a été remis, et ce qui ne colle pas.`}
        actions={
          <Link href="/app/rapports" className="btn-ghost text-sm">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Rapports
          </Link>
        }
      />

      <BandeauDemo precision="Clôture établie sur des données fictives. Aucun mouvement d'argent réel." />

      {/* Verdict de clôture */}
      <div
        className={
          cloture.prete
            ? "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3"
            : "rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
        }
      >
        <p className="flex items-center gap-2 text-sm font-semibold">
          {cloture.prete ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
              Journée close : aucune caisse en écart non expliqué.
            </>
          ) : (
            <>
              <TriangleAlert className="h-4 w-4 text-amber-600" aria-hidden />
              {cloture.ecartsAExpliquer} écart
              {cloture.ecartsAExpliquer > 1 ? "s" : ""} de caisse
              {cloture.ecartsAExpliquer > 1 ? " restent" : " reste"} à expliquer.
            </>
          )}
        </p>
      </div>

      {/* Comptes de la journée */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Compteur
          titre="Commandes"
          lignes={[
            { label: "Total", valeur: String(cloture.commandes.total) },
            { label: "Livrées", valeur: String(cloture.commandes.livrees) },
            { label: "Restantes", valeur: String(cloture.commandes.restantes) },
          ]}
        />
        <Compteur
          titre="Livraisons"
          lignes={[
            { label: "Total", valeur: String(cloture.livraisons.total) },
            { label: "Livrées", valeur: String(cloture.livraisons.livrees) },
            { label: "Échouées", valeur: String(cloture.livraisons.echouees) },
            { label: "En cours", valeur: String(cloture.livraisons.enCours) },
          ]}
        />
        <Compteur
          titre="Caisse"
          lignes={[
            { label: "Attendu", valeur: formaterFcfa(cloture.caisse.montantAttendu) },
            { label: "Encaissé", valeur: formaterFcfa(cloture.caisse.montantEncaisse) },
            { label: "À remettre", valeur: formaterFcfa(cloture.caisse.montantARemettre) },
            { label: "Remis", valeur: formaterFcfa(cloture.caisse.montantRemis) },
          ]}
        />
      </div>

      {/* Ce qui reste à remettre et l'écart global */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            Reste à remettre
          </p>
          <p className="mt-2 text-xl font-semibold tabular-nums text-amber-700">
            {formaterFcfa(cloture.caisse.resteARemettre)}
          </p>
          <p className="mt-1 text-xs text-ink-500">
            Encaissé et non encore reversé au bureau.
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            Écart de caisse global
          </p>
          <p
            className={
              cloture.caisse.ecart === 0
                ? "mt-2 text-xl font-semibold text-success"
                : "mt-2 text-xl font-semibold text-red-600"
            }
          >
            {libelleEcart(cloture.caisse.ecart)}
          </p>
          <p className="mt-1 text-xs text-ink-500">
            Écart = remis − encaissé. Un écart nul veut dire caisse juste.
          </p>
        </div>
      </div>

      {/* Détail par livreur */}
      <Carte titre="Détail par livreur">
        {lignes.length === 0 ? (
          <EtatVide
            titre="Aucun livreur en activité"
            description="Aucune livraison n'a été confiée aujourd'hui."
          />
        ) : (
          <ul className="space-y-4">
            {lignes.map((l) => (
              <LigneLivreur
                key={l.livreurId}
                ligne={l}
                nom={nomLivreur(l.livreurId)}
                onJustifier={justifierEcart}
              />
            ))}
          </ul>
        )}
      </Carte>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Compteur({
  titre,
  lignes,
}: {
  titre: string;
  lignes: { label: string; valeur: string }[];
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{titre}</p>
      <dl className="mt-3 space-y-1.5">
        {lignes.map((l) => (
          <div key={l.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-sm text-ink-700">{l.label}</dt>
            <dd className="text-sm font-semibold tabular-nums">{l.valeur}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function LigneLivreur({
  ligne,
  nom,
  onJustifier,
}: {
  ligne: LigneCaisseLivreur;
  nom: string;
  onJustifier: (p: { livreurId: string; commentaire: string }) => Resultat<unknown>;
}) {
  const [commentaire, setCommentaire] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  const enregistrer = () => {
    const r = onJustifier({ livreurId: ligne.livreurId, commentaire });
    if (r.ok) {
      setErreur(null);
      setSucces(true);
      setCommentaire("");
    } else {
      setSucces(false);
      setErreur(r.raison);
    }
  };

  return (
    <li className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={lienDetail("/app/livreurs/detail", ligne.livreurId)}
            className="text-sm font-semibold text-brand hover:underline"
          >
            {nom}
          </Link>
          <p className="mt-0.5 text-xs text-ink-500">
            {ligne.livraisonsConfiees} livraison{ligne.livraisonsConfiees > 1 ? "s" : ""} ·{" "}
            {ligne.livraisonsLivrees} livrée{ligne.livraisonsLivrees > 1 ? "s" : ""}
            {ligne.livraisonsEchouees > 0 ? ` · ${ligne.livraisonsEchouees} échouée(s)` : ""}
          </p>
        </div>
        <span
          className={
            ligne.ecartJuste
              ? "text-xs font-semibold text-success"
              : ligne.ecartExplique
                ? "text-xs font-semibold text-amber-700"
                : "text-xs font-semibold text-red-600"
          }
        >
          {libelleEcart(ligne.ecart)}
        </span>
      </div>

      {/* Attendu / encaissé / à remettre / remis / reste */}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-3 sm:grid-cols-5">
        <Chiffre label="Attendu" valeur={formaterFcfa(ligne.montantAttendu)} />
        <Chiffre label="Encaissé" valeur={formaterFcfa(ligne.montantEncaisse)} />
        <Chiffre label="À remettre" valeur={formaterFcfa(ligne.montantARemettre)} />
        <Chiffre label="Remis" valeur={formaterFcfa(ligne.montantRemis)} />
        <Chiffre
          label="Reste à remettre"
          valeur={formaterFcfa(ligne.resteARemettre)}
          accent={ligne.resteARemettre > 0 ? "ambre" : undefined}
        />
      </dl>

      {/* Explication de l'écart */}
      {!ligne.ecartJuste ? (
        <div className="mt-4 rounded-xl bg-surface p-3">
          {ligne.justification ? (
            <div className="text-sm">
              <p className="font-medium text-ink-700">Écart expliqué</p>
              <p className="mt-1 text-ink-700">{ligne.justification.commentaire}</p>
              <p className="mt-1 text-xs text-ink-500">
                Enregistré le{" "}
                {new Date(ligne.justification.createdAt).toLocaleString("fr-FR")} · écart
                constaté {formaterFcfa(ligne.justification.ecart)}
              </p>
            </div>
          ) : (
            <>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink-700">
                  Expliquer cet écart
                </span>
                <textarea
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                  rows={2}
                  className={CLASSE_SAISIE}
                  placeholder="Ex. : 2 000 FCFA remis au client en trop, à régulariser demain."
                />
              </label>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button type="button" onClick={enregistrer} className="btn-primary text-sm">
                  Enregistrer l&apos;explication
                </button>
                <span className="text-xs text-ink-500">
                  L&apos;écart reste visible : il est expliqué, jamais effacé.
                </span>
              </div>
            </>
          )}

          {erreur ? (
            <div className="mt-3">
              <MessageRefus message={erreur} />
            </div>
          ) : null}
          {succes ? (
            <div className="mt-3">
              <MessageSucces message="Explication enregistrée. Une ligne d'audit a été ajoutée." />
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-success">
          Caisse juste : rien à expliquer pour ce livreur.
        </p>
      )}
    </li>
  );
}

function Chiffre({
  label,
  valeur,
  accent,
}: {
  label: string;
  valeur: string;
  accent?: "ambre";
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-ink-500">{label}</dt>
      <dd
        className={
          accent === "ambre"
            ? "mt-0.5 text-sm font-semibold tabular-nums text-amber-700"
            : "mt-0.5 text-sm font-semibold tabular-nums"
        }
      >
        {valeur}
      </dd>
    </div>
  );
}
