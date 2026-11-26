"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  Globe,
  KeyRound,
  LogIn,
  Plane,
  Search,
  ShieldCheck,
  Tag,
} from "lucide-react";
import { BottomNav } from "@/components/jotcolis/bottom-nav";

export default function HomePage() {
  const router = useRouter();
  const [from, setFrom] = useState("Paris");
  const [to, setTo] = useState("Dakar");
  const [date, setDate] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (from.trim()) params.set("from", from.trim());
    if (to.trim()) params.set("to", to.trim());
    if (date.trim()) params.set("date", date.trim());
    router.push(`/trajets?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-900">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500 text-sm font-bold text-white">
              JC
            </span>
            <span className="text-base font-bold tracking-tight text-slate-900">
              JotColis
            </span>
          </div>

          <Link
            href="/profil"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <LogIn className="h-3.5 w-3.5 text-orange-500" />
            Se connecter
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pt-5">
        {/* Discreet demo banner */}
        <div className="mb-4 flex justify-center">
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-500">
            Données de démonstration
          </span>
        </div>

        {/* Hero title & subtitle */}
        <section>
          <h1 className="text-2xl font-bold leading-snug tracking-tight text-slate-900">
            Envoyez vos colis Paris → Dakar avec un voyageur vérifié
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Trouvez un GP qui part déjà, contactez-le et suivez la remise de
            votre colis.
          </p>

          {/* Compact search form right below subtitle */}
          <form
            onSubmit={handleSearch}
            className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="home-from"
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  Départ
                </label>
                <input
                  id="home-from"
                  type="text"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  placeholder="Paris"
                  className="box-border min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-200"
                />
              </div>

              <div>
                <label
                  htmlFor="home-to"
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  Arrivée
                </label>
                <input
                  id="home-to"
                  type="text"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="Dakar"
                  className="box-border min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-200"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="home-date"
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                Date souhaitée
              </label>
              <div className="relative w-full">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="home-date"
                  type="text"
                  inputMode="numeric"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  placeholder="jj/mm/aaaa"
                  className="box-border min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-200"
                />
              </div>
            </div>

            <button
              type="submit"
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
            >
              <Search className="h-4 w-4" />
              Rechercher un trajet
            </button>
          </form>

          {/* Secondary button for GP */}
          <Link
            href="/trajets?publier=1"
            className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-100"
          >
            <Plane className="h-4 w-4" />
            Je voyage, je publie mon trajet
          </Link>
        </section>

        {/* Three concrete benefits */}
        <section className="mt-7 space-y-3" aria-label="Avantages JotColis">
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                GP vérifiés
              </h2>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                Pièce d&apos;identité et téléphone contrôlés
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
              <Tag className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Prix au kilo affiché
              </h2>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                Vous voyez le tarif avant de contacter le GP
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Code de remise
              </h2>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                Le destinataire reçoit un code à présenter à la livraison
              </p>
            </div>
          </div>
        </section>

        {/* Smaller globe placed lower */}
        <section className="mt-7 flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-5 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-orange-100 to-orange-200 text-orange-600">
            <Globe className="h-8 w-8" />
          </div>
          <p className="mt-2.5 text-xs font-medium text-slate-700">
            Liaison directe Paris ↔ Dakar
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            JotColis met en relation clients et GP. Le GP vérifie le contenu du
            colis et en est responsable pendant le transport.
          </p>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
