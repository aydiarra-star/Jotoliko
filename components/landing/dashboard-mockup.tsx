"use client";

import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Bike,
  CheckCircle2,
  Clock,
  MapPin,
  Wallet,
} from "lucide-react";

const kpis = [
  { label: "Commandes du jour", value: "184", delta: "+12%", tone: "brand" },
  { label: "Livraisons terminées", value: "147", delta: "+8%", tone: "success" },
  { label: "CA encaissé", value: "4,2 M", delta: "FCFA", tone: "ink" },
  { label: "En tournée", value: "9", delta: "livreurs", tone: "brand" },
];

const rows = [
  { id: "CMD-2418", client: "Aïssatou Ndiaye", zone: "Mermoz", status: "En route" },
  { id: "CMD-2417", client: "Pharmacie Espoir", zone: "Plateau", status: "Livrée" },
  { id: "CMD-2416", client: "Boutique Léna", zone: "Almadies", status: "En route" },
  { id: "CMD-2415", client: "Restaurant Saveurs", zone: "Sacré-Cœur", status: "À affecter" },
];

const statusTone: Record<string, string> = {
  "En route": "bg-brand-soft text-brand",
  Livrée: "bg-success-soft text-success",
  "À affecter": "bg-slate-100 text-ink-500",
};

export function DashboardMockup() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-brand/15 via-transparent to-success/15 blur-2xl"
      />
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-lift"
      >
        <div className="flex items-center gap-2 border-b border-slate-200 bg-surface px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="ml-3 rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-ink-500 ring-1 ring-slate-200">
            app.jotoliko.com/dashboard
          </span>
        </div>

        <div className="grid gap-4 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((k, i) => (
              <motion.div
                key={k.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 + i * 0.07, duration: 0.4 }}
                className="rounded-xl border border-slate-200/80 bg-white p-3"
              >
                <p className="text-[11px] font-medium text-ink-500">{k.label}</p>
                <p className="mt-1 text-xl font-semibold text-ink">{k.value}</p>
                <p
                  className={
                    k.tone === "success"
                      ? "text-[11px] font-semibold text-success"
                      : k.tone === "brand"
                        ? "text-[11px] font-semibold text-brand"
                        : "text-[11px] font-medium text-ink-500"
                  }
                >
                  {k.delta}
                </p>
              </motion.div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <div className="rounded-xl border border-slate-200/80 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
                <p className="text-sm font-semibold text-ink">Commandes en cours</p>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand">
                  Temps réel <ArrowUpRight className="h-3 w-3" />
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.08, duration: 0.35 }}
                    className="grid grid-cols-[1.1fr_1.4fr_1fr_0.9fr] items-center gap-2 px-4 py-3 text-xs"
                  >
                    <span className="font-semibold text-ink">{r.id}</span>
                    <span className="truncate text-ink-700">{r.client}</span>
                    <span className="flex items-center gap-1 text-ink-500">
                      <MapPin className="h-3 w-3" /> {r.zone}
                    </span>
                    <span
                      className={`justify-self-start rounded-full px-2 py-0.5 font-medium ${statusTone[r.status]}`}
                    >
                      {r.status}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-xl border border-slate-200/80 bg-white p-4">
                <p className="text-sm font-semibold text-ink">Encaissements du jour</p>
                <div className="mt-3 space-y-2.5">
                  {[
                    { d: "Moussa", v: "412 000", pct: 86 },
                    { d: "Ibrahima", v: "298 500", pct: 64 },
                    { d: "Fatou", v: "176 000", pct: 38 },
                  ].map((x, i) => (
                    <div key={x.d}>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1.5 text-ink-700">
                          <Bike className="h-3 w-3 text-brand" /> {x.d}
                        </span>
                        <span className="font-semibold text-ink">{x.v}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${x.pct}%` }}
                          transition={{ delay: 0.7 + i * 0.1, duration: 0.7, ease: "easeOut" }}
                          className="h-full rounded-full bg-brand"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-white p-4">
                <p className="text-sm font-semibold text-ink">Caisse à reverser</p>
                <div className="mt-3 flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-success-soft text-success">
                    <Wallet className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-lg font-semibold text-ink">886 500 FCFA</p>
                    <p className="text-[11px] text-ink-500">3 écarts détectés</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-surface px-4 py-3 text-[11px] text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" /> CMD-2417 livrée à 14:12
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-brand" /> CMD-2416 en route depuis 12 min
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-ink-500" /> Moussa à 1,2 km du client
            </span>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="absolute -bottom-8 -right-3 hidden w-44 animate-float sm:block lg:-right-10"
      >
        <div className="rounded-[1.75rem] border-[6px] border-ink bg-white shadow-lift">
          <div className="rounded-[1.35rem] bg-surface p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">
              Mes missions
            </p>
            <div className="mt-2 space-y-2">
              {[
                { id: "CMD-2418", zone: "Mermoz" },
                { id: "CMD-2416", zone: "Almadies" },
              ].map((m) => (
                <div key={m.id} className="rounded-lg bg-white p-2 shadow-sm ring-1 ring-slate-200/70">
                  <p className="text-[10px] font-semibold text-ink">{m.id}</p>
                  <p className="text-[9px] text-ink-500">{m.zone}</p>
                  <div className="mt-1.5 flex gap-1">
                    <span className="rounded bg-brand px-1.5 py-0.5 text-[8px] font-semibold text-white">
                      Appeler
                    </span>
                    <span className="rounded bg-ink px-1.5 py-0.5 text-[8px] font-semibold text-white">
                      GPS
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 rounded-lg bg-success px-2 py-1.5 text-center text-[9px] font-semibold text-white">
              Livraison effectuée
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
