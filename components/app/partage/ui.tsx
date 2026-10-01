import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STATUTS_COMMANDE } from "@/lib/domain/statuts";
import { STATUTS_LIVRAISON } from "@/lib/domain/statuts";
import type { StatutCommande, StatutLivraison } from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// Mise en page
// ---------------------------------------------------------------------------

export function EnTetePage({
  titre,
  description,
  actions,
}: {
  titre: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{titre}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-500">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Carte({
  children,
  className,
  titre,
  action,
}: {
  children: ReactNode;
  className?: string;
  titre?: string;
  action?: ReactNode;
}) {
  return (
    <section className={cn("card overflow-hidden", className)}>
      {titre ? (
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-sm font-semibold">{titre}</h2>
          {action}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Indicateurs
// ---------------------------------------------------------------------------

const TONS = {
  neutre: "bg-slate-100 text-ink-700",
  info: "bg-brand-soft text-brand",
  succes: "bg-success-soft text-success",
  echec: "bg-red-50 text-red-700",
} as const;

export function Pastille({
  children,
  ton = "neutre",
}: {
  children: ReactNode;
  ton?: keyof typeof TONS;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        TONS[ton],
      )}
    >
      {children}
    </span>
  );
}

export function StatutCommandePastille({ statut }: { statut: StatutCommande }) {
  const s = STATUTS_COMMANDE[statut];
  return <Pastille ton={s.couleur}>{s.libelle}</Pastille>;
}

export function StatutLivraisonPastille({ statut }: { statut: StatutLivraison }) {
  const s = STATUTS_LIVRAISON[statut];
  return <Pastille ton={s.couleur}>{s.libelle}</Pastille>;
}

export function Indicateur({
  label,
  valeur,
  detail,
  accent,
}: {
  label: string;
  valeur: ReactNode;
  detail?: ReactNode;
  accent?: "brand" | "success" | "ink";
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold tabular-nums",
          accent === "brand" && "text-brand",
          accent === "success" && "text-success",
          accent === "ink" && "text-ink",
        )}
      >
        {valeur}
      </p>
      {detail ? <p className="mt-1.5 text-xs text-ink-500">{detail}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// États vides
// ---------------------------------------------------------------------------

export function EtatVide({
  titre,
  description,
  action,
}: {
  titre: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-surface px-6 py-12 text-center">
      <p className="text-sm font-semibold">{titre}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-500">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * Affiche un refus métier tel quel. Les règles du domaine expliquent toujours
 * pourquoi une opération est refusée ; ce message est repris sans reformulation,
 * pour que l'utilisateur comprenne ce qui bloque.
 */
export function MessageRefus({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      {message}
    </div>
  );
}

export function MessageSucces({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
    >
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Champs de formulaire
// ---------------------------------------------------------------------------

export function Champ({
  label,
  children,
  aide,
}: {
  label: string;
  children: ReactNode;
  aide?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-700">{label}</span>
      {children}
      {aide ? <span className="mt-1 block text-xs text-ink-500">{aide}</span> : null}
    </label>
  );
}

export const CLASSE_SAISIE =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand-ring";

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/**
 * Marque une donnée comme fictive. Affiché partout où des données de
 * démonstration sont présentées, pour qu'aucun utilisateur ne les prenne pour
 * des chiffres réels de son exploitation.
 */
export function MarqueDemo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200",
        className,
      )}
      title="Cette donnée est fictive et sert uniquement à présenter l'interface."
    >
      Démo
    </span>
  );
}

export function BandeauDemo({ precision }: { precision?: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
      <span className="font-semibold">Données de démonstration.</span>{" "}
      {precision ??
        "Les clients, commandes, livraisons, positions et montants affichés sont fictifs. Aucune donnée ne provient d'une exploitation réelle."}
    </div>
  );
}
