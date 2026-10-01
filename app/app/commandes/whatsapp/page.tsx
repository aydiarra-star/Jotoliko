"use client";

// Réception d'une commande WhatsApp.
//
// Le bureau colle le message reçu, l'application en propose une commande, le
// bureau relit et corrige, puis crée. Rien n'est enregistré avant validation.
//
// Ce qui n'a pas été compris est affiché à part, et non deviné. Une commande
// plausible mais fausse coûterait plus cher que la ressaisie qu'elle évite.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, Check, MessageSquare, Sparkles } from "lucide-react";
import {
  BandeauDemo,
  Carte,
  Champ,
  CLASSE_SAISIE,
  EnTetePage,
  MessageRefus,
} from "@/components/app/partage/ui";
import { FormulaireCommande, type LigneSaisie } from "@/components/app/commandes/formulaire-commande";
import { analyserMessage } from "@/lib/domain/whatsapp";
import { formaterFcfa } from "@/lib/domain/paiements";
import { useMagasin } from "@/lib/magasin";
import { lienDetail } from "@/lib/use-parametre";

export default function CommandeWhatsAppPage() {
  const router = useRouter();
  const { etat, creerCommande, creerClient } = useMagasin();

  const [texte, setTexte] = useState("");
  const [expediteur, setExpediteur] = useState("");
  const [analyse, setAnalyse] = useState<ReturnType<typeof analyserMessage> | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  // Un client créé à la volée depuis ce message doit être proposé aussitôt.
  const [clientForce, setClientForce] = useState<string | null>(null);
  const [nomNouveauClient, setNomNouveauClient] = useState("");

  const analyseCourante = analyse;

  const clientId = clientForce ?? analyseCourante?.clientId ?? "";
  const clientReconnu = etat.monde.clients.find((c) => c.id === clientId);

  const lignesInitiales: LigneSaisie[] =
    analyseCourante?.commande.lignes.map((l) => ({
      designation: l.designation,
      quantite: l.quantite,
      prixUnitaire: 0,
    })) ?? [];

  const totalAnnonce = analyseCourante?.commande.montantAnnonce;

  return (
    <div className="space-y-6">
      <EnTetePage
        titre="Commande reçue par WhatsApp"
        description="Collez le message reçu. L'application en propose une commande ; vous relisez et corrigez avant de créer."
        actions={
          <Link href="/app/commandes" className="btn-ghost text-sm">
            Retour
          </Link>
        }
      />

      <BandeauDemo />

      {erreur ? <MessageRefus message={erreur} /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Carte>
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
            <MessageSquare className="h-4 w-4 text-brand" aria-hidden />
            Message reçu
          </h2>
          <div className="space-y-4">
            <Champ
              label="Numéro de l'expéditeur (optionnel)"
              aide="Le numéro est aussi cherché dans le texte du message."
            >
              <input
                value={expediteur}
                onChange={(e) => setExpediteur(e.target.value)}
                placeholder="+221 77 123 45 67"
                inputMode="tel"
                className={CLASSE_SAISIE}
              />
            </Champ>

            <Champ label="Contenu du message">
              <textarea
                value={texte}
                onChange={(e) => setTexte(e.target.value)}
                rows={10}
                placeholder={"Bonjour\n2x sac de riz\n1x huile 5L\nTotal 12 000 FCFA"}
                className={CLASSE_SAISIE}
              />
            </Champ>

            <button
              type="button"
              onClick={() => {
                setErreur(null);
                setClientForce(null);
                setAnalyse(
                  analyserMessage(
                    { texte, expediteur, recuAt: Date.now() },
                    etat.monde.clients,
                  ),
                );
              }}
              disabled={!texte.trim()}
              className="btn-primary text-sm disabled:opacity-40"
            >
              <Sparkles className="h-4 w-4" aria-hidden /> Analyser le message
            </button>
          </div>
        </Carte>

        <Carte>
          <h2 className="mb-4 text-base font-semibold">Ce que l&apos;application a compris</h2>

          {!analyseCourante ? (
            <p className="text-sm text-ink-500">
              Collez un message puis lancez l&apos;analyse. Rien n&apos;est enregistré à cette
              étape.
            </p>
          ) : (
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Client</p>
                {clientReconnu ? (
                  <p className="mt-1 flex items-center gap-1.5 text-ink-800">
                    <Check className="h-4 w-4 text-emerald-600" aria-hidden />
                    {clientReconnu.nom}
                    <span className="text-ink-500">— reconnu par son numéro</span>
                  </p>
                ) : (
                  <p className="mt-1 text-ink-700">
                    Aucun client connu pour ce numéro.
                    {analyseCourante.telephone ? (
                      <span className="block text-xs text-ink-500 tabular-nums">
                        Numéro lu : {analyseCourante.telephone}
                      </span>
                    ) : (
                      <span className="block text-xs text-ink-500">
                        Aucun numéro lisible dans le message.
                      </span>
                    )}
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
                  Articles reconnus
                </p>
                {analyseCourante.commande.lignes.length === 0 ? (
                  <p className="mt-1 text-ink-500">Aucun article reconnu.</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {analyseCourante.commande.lignes.map((l, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-2">
                        <span className="text-ink-800">{l.designation}</span>
                        <span className="shrink-0 tabular-nums text-ink-500">
                          ×{l.quantite}
                          {!l.quantiteExplicite ? (
                            <span className="ml-1 text-xs text-amber-700">
                              (quantité supposée)
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {totalAnnonce !== undefined ? (
                <div className="rounded-xl bg-brand-soft px-3 py-2">
                  <p className="text-xs font-medium text-brand">Total annoncé dans le message</p>
                  <p className="text-base font-semibold tabular-nums text-brand">
                    {formaterFcfa(totalAnnonce)}
                  </p>
                  <p className="mt-0.5 text-xs text-brand/80">
                    À répartir sur les lignes : le message ne dit pas le prix de chaque article.
                  </p>
                </div>
              ) : null}

              {analyseCourante.commande.remiseAnnoncee !== undefined ? (
                <p className="text-ink-700">
                  Remise à prévoir :{" "}
                  <span className="font-medium tabular-nums">
                    {formaterFcfa(analyseCourante.commande.remiseAnnoncee)}
                  </span>
                </p>
              ) : null}

              {analyseCourante.informationsManquantes.length > 0 ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-red-800">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                    Informations manquantes
                  </p>
                  <ul className="mt-1.5 space-y-0.5">
                    {analyseCourante.informationsManquantes.map((m) => (
                      <li key={m.code} className="text-xs text-red-800">
                        • {m.libelle}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-xs text-red-800/80">
                    Rien n&apos;est deviné : complétez ces informations ci-dessous avant de créer
                    la commande.
                  </p>
                </div>
              ) : null}

              {analyseCourante.nonCompris.length > 0 ? (
                <div className="rounded-xl bg-amber-50 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                    Non compris — à vérifier de votre côté
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {analyseCourante.nonCompris.map((l, i) => (
                      <li key={i} className="text-xs text-amber-900">
                        « {l} »
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {analyseCourante.lignesIgnorees.length > 0 ? (
                <p className="text-xs text-ink-500">
                  Écarté (politesse) : {analyseCourante.lignesIgnorees.join(", ")}
                </p>
              ) : null}
            </div>
          )}
        </Carte>
      </div>

      {analyseCourante ? (
        <Carte>
          <h2 className="mb-1 text-base font-semibold">Commande à créer</h2>
          <p className="mb-4 text-sm text-ink-500">
            Complétez les prix : le message ne les donne pas toujours. La commande est créée au
            statut « À préparer ».
          </p>

          {etat.monde.clients.length === 0 ? (
            <MessageRefus message="Aucun client enregistré. Créez d'abord un client." />
          ) : (
            <>
              {!clientReconnu && analyseCourante.telephone ? (
                <div className="mb-5 rounded-xl border border-slate-200 bg-surface px-4 py-3">
                  <p className="text-sm text-ink-700">
                    Créer la fiche client pour le numéro{" "}
                    <span className="font-medium tabular-nums">{analyseCourante.telephone}</span> ?
                  </p>
                  <input
                    aria-label="Nom du nouveau client"
                    placeholder="Nom du client"
                    value={nomNouveauClient}
                    onChange={(e) => setNomNouveauClient(e.target.value)}
                    className={`${CLASSE_SAISIE} mt-2`}
                  />
                  <button
                    type="button"
                    className="btn-ghost mt-2 text-sm"
                    onClick={() => {
                      const nom = nomNouveauClient.trim();
                      if (!nom) {
                        setErreur("Indiquez le nom du client avant de créer sa fiche.");
                        return;
                      }
                      const r = creerClient({
                        nom,
                        telephone: analyseCourante.telephone!,
                        adresse: {
                          ligne: "À compléter",
                          zone: "À compléter",
                          ville: "Dakar",
                        },
                      });
                      if (!r.ok) {
                        setErreur(r.raison);
                        return;
                      }
                      const cree = r.valeur.monde.clients.at(-1);
                      if (cree) setClientForce(cree.id);
                      setNomNouveauClient("");
                      setErreur(null);
                    }}
                  >
                    Créer la fiche client
                  </button>
                  <p className="mt-2 text-xs text-ink-500">
                    L&apos;adresse sera à compléter : elle n&apos;est pas dans le message.
                  </p>
                </div>
              ) : null}

              {clientId ? (
                <FormulaireCommande
                  clients={etat.monde.clients}
                  initial={{ clientId, lignes: lignesInitiales }}
                  libelleAction="Créer la commande"
                  onValider={(v) => {
                    // Le total annoncé doit pouvoir être vérifié : sans aucun
                    // prix saisi, on refuserait ensuite de constater un écart.
                    const total = v.lignes.reduce((t, l) => t + l.quantite * l.prixUnitaire, 0);
                    if (totalAnnonce !== undefined && total === 0) {
                      return "Renseignez au moins un prix : le total annoncé dans le message doit pouvoir être vérifié.";
                    }
                    const r = creerCommande(v);
                    if (!r.ok) return r.raison;
                    const creee = r.valeur.monde.commandes.at(-1);
                    router.push(
                      creee ? lienDetail("/app/commandes/detail", creee.id) : "/app/commandes",
                    );
                    return null;
                  }}
                  onAnnuler={() => router.push("/app/commandes")}
                />
              ) : (
                <p className="text-sm text-ink-500">
                  Choisissez ou créez un client pour continuer.
                </p>
              )}
            </>
          )}
        </Carte>
      ) : null}
    </div>
  );
}
