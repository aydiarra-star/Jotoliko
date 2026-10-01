"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  Menu,
  Package,
  Truck,
  Users,
  Wallet,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { Logo } from "@/components/ui/navbar";
import { cn } from "@/lib/utils";
import { useMagasin } from "@/lib/magasin";
import { operationsEnAttente, operationsEnEchec } from "@/lib/domain/operations";

const LIENS = [
  { href: "/app", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
  { href: "/app/commandes", label: "Commandes", icon: ClipboardList },
  { href: "/app/livraisons", label: "Livraisons", icon: Package },
  { href: "/app/livreurs", label: "Livreurs", icon: Users },
  { href: "/app/encaissements", label: "Encaissements", icon: Wallet },
  { href: "/app/rapports", label: "Rapports", icon: BarChart3 },
];

export function BarreLaterale() {
  const chemin = usePathname();
  const [ouvert, setOuvert] = useState(false);

  const liens = (
    <nav className="flex flex-col gap-1">
      {LIENS.map((l) => {
        const actif = l.exact ? chemin === l.href : chemin.startsWith(l.href);
        const Icone = l.icon;
        return (
          <Link
            key={l.href}
            href={l.href}
            onClick={() => setOuvert(false)}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              actif
                ? "bg-brand text-white shadow-[0_8px_20px_-10px_rgba(37,99,235,0.9)]"
                : "text-slate-300 hover:bg-white/5 hover:text-white",
            )}
          >
            <Icone className="h-4 w-4 shrink-0" aria-hidden />
            {l.label}
          </Link>
        );
      })}
      <Link
        href="/app/livreur"
        onClick={() => setOuvert(false)}
        className={cn(
          "mt-2 flex items-center gap-3 rounded-xl border border-white/10 px-3 py-2.5 text-sm font-medium transition-colors",
          chemin.startsWith("/app/livreur")
            ? "bg-white/10 text-white"
            : "text-slate-300 hover:bg-white/5 hover:text-white",
        )}
      >
        <Truck className="h-4 w-4 shrink-0" aria-hidden />
        Espace livreur
      </Link>
    </nav>
  );

  return (
    <>
      {/* Barre supérieure mobile */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setOuvert((v) => !v)}
          aria-label={ouvert ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={ouvert}
          className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-ink"
        >
          {ouvert ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {ouvert ? (
        <div className="fixed inset-x-0 top-14 z-40 border-b border-white/10 bg-ink p-4 lg:hidden">
          {liens}
        </div>
      ) : null}

      {/* Barre latérale bureau */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-ink px-4 py-6 lg:flex">
        <div className="mb-8">
          <Logo light />
        </div>
        {liens}
        <div className="mt-auto space-y-3 pt-6">
          <EtatReseau />
          <Link href="/" className="block text-xs text-slate-400 hover:text-white">
            ← Retour au site
          </Link>
        </div>
      </aside>
    </>
  );
}

/** Indicateur de connectivité et de file d'attente. */
export function EtatReseau() {
  const { etat, basculerReseau, synchroniserTout } = useMagasin();
  const enAttente = operationsEnAttente(etat).length;
  const enEchec = operationsEnEchec(etat).length;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <button
        type="button"
        onClick={basculerReseau}
        className="flex w-full items-center gap-2 text-left text-xs font-medium text-slate-200 hover:text-white"
        title="Basculer la connectivité simulée"
      >
        {etat.enLigne ? (
          <Wifi className="h-3.5 w-3.5 text-success" aria-hidden />
        ) : (
          <WifiOff className="h-3.5 w-3.5 text-amber-400" aria-hidden />
        )}
        {etat.enLigne ? "En ligne" : "Hors ligne"}
      </button>

      {enAttente > 0 ? (
        <div className="mt-2 space-y-1.5">
          <p className="text-xs text-amber-300">
            {enAttente} opération{enAttente > 1 ? "s" : ""} en attente de synchronisation
          </p>
          {etat.enLigne ? (
            <button
              type="button"
              onClick={synchroniserTout}
              className="w-full rounded-lg bg-white/10 px-2 py-1.5 text-xs font-medium text-white hover:bg-white/20"
            >
              Synchroniser
            </button>
          ) : (
            <p className="text-[11px] text-slate-400">
              Repassez en ligne pour synchroniser.
            </p>
          )}
        </div>
      ) : null}

      {enEchec > 0 ? (
        <p className="mt-2 text-xs text-red-300">
          {enEchec} opération{enEchec > 1 ? "s" : ""} en échec de synchronisation
        </p>
      ) : null}
    </div>
  );
}
