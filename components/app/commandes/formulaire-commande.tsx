"use client";

// Formulaire de commande, partagé par la création et la modification.
// Il ne contient aucune règle métier : il collecte la saisie et laisse le
// domaine refuser ce qui doit l'être, en affichant la raison telle quelle.

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Champ, CLASSE_SAISIE, MessageRefus } from "@/components/app/partage/ui";
import { formaterFcfa } from "@/lib/domain/paiements";
import type { Client } from "@/lib/domain/types";

export type LigneSaisie = {
  designation: string;
  quantite: number;
  prixUnitaire: number;
};

export function FormulaireCommande({
  clients,
  initial,
  libelleAction,
  onValider,
  onAnnuler,
}: {
  clients: Client[];
  initial?: { clientId: string; lignes: LigneSaisie[]; note?: string };
  libelleAction: string;
  onValider: (valeur: { clientId: string; lignes: LigneSaisie[]; note?: string }) => string | null;
  onAnnuler: () => void;
}) {
  const [clientId, setClientId] = useState(initial?.clientId ?? clients[0]?.id ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [lignes, setLignes] = useState<LigneSaisie[]>(
    initial?.lignes ?? [{ designation: "", quantite: 1, prixUnitaire: 0 }],
  );
  const [erreur, setErreur] = useState<string | null>(null);

  const total = lignes.reduce((t, l) => t + l.quantite * l.prixUnitaire, 0);

  const modifierLigne = (index: number, patch: Partial<LigneSaisie>) => {
    setLignes((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const client = clients.find((c) => c.id === clientId);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const raison = onValider({
          clientId,
          lignes: lignes.map((l) => ({
            designation: l.designation.trim(),
            quantite: Number(l.quantite),
            prixUnitaire: Number(l.prixUnitaire),
          })),
          note: note.trim() || undefined,
        });
        setErreur(raison);
      }}
      className="space-y-5"
    >
      {erreur ? <MessageRefus message={erreur} /> : null}

      <Champ label="Client">
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className={CLASSE_SAISIE}
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom} — {c.adresse.zone}
            </option>
          ))}
        </select>
      </Champ>

      {client ? (
        <div className="rounded-xl bg-surface px-4 py-3 text-sm">
          <p className="text-ink-500">{client.telephone}</p>
          <p className="mt-0.5 text-ink-700">{client.adresse.ligne}</p>
          {client.adresse.repere ? (
            <p className="mt-0.5 text-xs text-ink-500">Repère : {client.adresse.repere}</p>
          ) : null}
          {client.adresse.lat === undefined ? (
            <p className="mt-2 text-xs font-medium text-amber-700">
              Aucun point GPS enregistré pour ce client : la livraison ne pourra pas être créée
              tant que sa position n&apos;est pas renseignée.
            </p>
          ) : null}
        </div>
      ) : null}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-ink-700">Articles</legend>
        {lignes.map((l, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
            <div className="min-w-0 flex-1">
              <input
                aria-label={`Désignation de la ligne ${i + 1}`}
                placeholder="Désignation"
                value={l.designation}
                onChange={(e) => modifierLigne(i, { designation: e.target.value })}
                className={CLASSE_SAISIE}
              />
            </div>
            <div className="w-20">
              <input
                aria-label={`Quantité de la ligne ${i + 1}`}
                type="number"
                min={1}
                value={l.quantite}
                onChange={(e) => modifierLigne(i, { quantite: Number(e.target.value) })}
                className={CLASSE_SAISIE}
              />
            </div>
            <div className="w-32">
              <input
                aria-label={`Prix unitaire de la ligne ${i + 1}`}
                type="number"
                min={0}
                value={l.prixUnitaire}
                onChange={(e) => modifierLigne(i, { prixUnitaire: Number(e.target.value) })}
                className={CLASSE_SAISIE}
              />
            </div>
            <button
              type="button"
              aria-label={`Supprimer la ligne ${i + 1}`}
              onClick={() => setLignes((ls) => ls.filter((_, j) => j !== i))}
              disabled={lignes.length === 1}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-ink-500 transition-colors hover:border-red-200 hover:text-red-600 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setLignes((ls) => [...ls, { designation: "", quantite: 1, prixUnitaire: 0 }])
          }
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand"
        >
          <Plus className="h-4 w-4" aria-hidden /> Ajouter un article
        </button>
      </fieldset>

      <div className="flex items-baseline justify-between rounded-xl bg-brand-soft px-4 py-3">
        <span className="text-sm font-medium text-brand">Montant attendu</span>
        <span className="text-lg font-semibold tabular-nums text-brand">{formaterFcfa(total)}</span>
      </div>

      <Champ label="Note (optionnel)">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Instruction particulière, disponibilité du client…"
          className={CLASSE_SAISIE}
        />
      </Champ>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary text-sm">
          {libelleAction}
        </button>
        <button type="button" onClick={onAnnuler} className="btn-ghost text-sm">
          Annuler
        </button>
      </div>
    </form>
  );
}
