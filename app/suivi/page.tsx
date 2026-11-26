"use client";

import { useState } from "react";
import { KeyRound, MapPin, Search } from "lucide-react";
import { BottomNav } from "@/components/jotcolis/bottom-nav";
import { DEMO_PARCELS } from "@/lib/jotcolis-data";

export default function SuiviPage() {
  const [query, setQuery] = useState("JC-4821");
  const parcel = DEMO_PARCELS.find(
    (p) => p.code.toLowerCase() === query.trim().toLowerCase()
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-slate-900">Suivi de colis</h1>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
            Données de démonstration
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 pt-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label
            htmlFor="suivi-code"
            className="mb-1.5 block text-xs font-medium text-slate-600"
          >
            Numéro de suivi
          </label>
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="suivi-code"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex : JC-4821"
              className="box-border min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        {parcel ? (
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">
                Colis {parcel.code}
              </span>
              <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
                {parcel.status}
              </span>
            </div>

            <div className="mt-3 space-y-1.5 text-xs text-slate-600">
              <p className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-orange-500" />
                {parcel.from} → {parcel.to} · {parcel.weightKg} kg
              </p>
              <p>GP : {parcel.gpName}</p>
              <p>Dernière mise à jour : {parcel.updatedAt}</p>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl bg-orange-50 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <KeyRound className="h-4 w-4 text-orange-600" />
                Code de remise
              </div>
              <span className="text-base font-bold tracking-widest text-orange-700">
                {parcel.deliveryCode}
              </span>
            </div>

            <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-500">
              JotColis met en relation clients et GP. Le GP vérifie le contenu
              du colis et en est responsable pendant le transport.
            </p>
          </article>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-600">
            Aucun colis trouvé pour cette référence. Essayez{" "}
            <span className="font-semibold text-slate-900">JC-4821</span>.
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
