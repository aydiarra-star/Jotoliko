import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { LiveConsole } from "@/components/operations/live-console";

export const metadata: Metadata = {
  title: "Espace opérations",
  description: "Espace de consultation des missions Jotoliko protégé par l'API.",
  robots: { index: false, follow: false },
};

export default function EspacePage() {
  return (
    <main className="min-h-screen bg-[#f6f8f7] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Jotoliko OS</p>
            <h1 className="mt-1 text-xl font-semibold">Espace opérations connecté</h1>
          </div>
          <Link href="/operations/" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800"><ArrowLeft className="h-4 w-4" /> Centre de démonstration</Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-white p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <p className="text-sm leading-relaxed text-slate-700">Cette page ne remplace pas l’API : elle la consomme. L’API décide de l’identité, du rôle et des missions accessibles. Cette première version est volontairement en lecture seule ; aucune action de caisse ou de clôture n’est exposée avant les tests d’intégration complets.</p>
        </div>
        <LiveConsole />
      </div>
    </main>
  );
}
