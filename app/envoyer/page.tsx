"use client";

import { useState } from "react";
import Link from "next/link";
import { Calendar, Package, ArrowRight } from "lucide-react";
import { BottomNav } from "@/components/jotcolis/bottom-nav";

export default function EnvoyerPage() {
  const [from, setFrom] = useState("Paris");
  const [to, setTo] = useState("Dakar");
  const [weight, setWeight] = useState("3");
  const [date, setDate] = useState("");
  const [confirmedLegal, setConfirmedLegal] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-slate-900">Envoyer un colis</h1>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
            Données de démonstration
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pt-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Décrivez votre colis
              </h2>
              <p className="text-xs text-slate-500">
                Puis choisissez un GP qui fait ce trajet.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Départ
                </label>
                <input
                  type="text"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="box-border min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Arrivée
                </label>
                <input
                  type="text"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="box-border min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Poids estimé (kg)
              </label>
              <input
                type="number"
                min="1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="box-border min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Date souhaitée
              </label>
              <div className="relative w-full">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  inputMode="numeric"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  placeholder="jj/mm/aaaa"
                  className="box-border min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="rounded-xl bg-orange-50/70 p-3">
              <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-snug text-slate-700">
                <input
                  type="checkbox"
                  checked={confirmedLegal}
                  onChange={(e) => setConfirmedLegal(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                />
                <span>
                  Je confirme que mon colis ne contient aucun objet interdit ou
                  illégal.{" "}
                  <Link
                    href="/objets-interdits"
                    className="font-medium text-orange-700 underline underline-offset-2"
                  >
                    Voir la liste des objets interdits
                  </Link>
                </span>
              </label>
            </div>

            <Link
              href={`/trajets?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${encodeURIComponent(date)}`}
              aria-disabled={!confirmedLegal}
              onClick={(e) => {
                if (!confirmedLegal) e.preventDefault();
              }}
              className={`flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                confirmedLegal
                  ? "bg-orange-500 text-white hover:bg-orange-600"
                  : "cursor-not-allowed bg-slate-200 text-slate-500"
              }`}
            >
              Demander une place à un GP
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-500">
            JotColis met en relation clients et GP. Le GP vérifie le contenu du
            colis et en est responsable pendant le transport.
          </p>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
