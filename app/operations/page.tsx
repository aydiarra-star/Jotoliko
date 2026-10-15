"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  CircleUserRound,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  Smartphone,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

/**
 * KPI opérationnel. Le typage est explicite : un tableau de tuples non typé
 * infère `(string | LucideIcon)[]`, ce qui rend chaque élément non assignable
 * à `ReactNode` et casse le typecheck du build Next.
 */
type Kpi = { title: string; value: string; note: string; icon: LucideIcon };

const RESPONSABLE_KPIS: Kpi[] = [
  { title: "Missions aujourd’hui", value: "—", note: "Donnée serveur requise", icon: Route },
  { title: "À affecter", value: "—", note: "Aucune donnée inventée", icon: Package },
  { title: "En cours", value: "—", note: "Suivi réel requis", icon: MapPin },
  { title: "À vérifier", value: "2", note: "Démonstration", icon: AlertTriangle },
];

type Mission = {
  id: string;
  client: string;
  phone: string;
  quartier: string;
  repere: string;
  amount: number;
  status: "EN_ROUTE" | "ARRIVE" | "LIVREE" | "A_VERIFIER";
  gps: "FRAÎCHE" | "ANCIENNE" | "INDISPONIBLE";
};

const missions: Mission[] = [
  { id: "MIS-1042", client: "Client démonstration", phone: "—", quartier: "Donnée de démonstration", repere: "Aucun repère confirmé", amount: 0, status: "EN_ROUTE", gps: "FRAÎCHE" },
  { id: "MIS-1043", client: "Commande à affecter", phone: "—", quartier: "Quartier non renseigné", repere: "À vérifier", amount: 0, status: "A_VERIFIER", gps: "INDISPONIBLE" },
  { id: "MIS-1044", client: "Mission exemple", phone: "—", quartier: "Quartier non renseigné", repere: "À vérifier", amount: 0, status: "ARRIVE", gps: "ANCIENNE" },
];

const money = (value: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value) + " FCFA";

export default function OperationsPage() {
  const [role, setRole] = useState<"responsable" | "livreur" | "vendeur">("responsable");
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      missions.filter((m) =>
        [m.id, m.client, m.quartier, m.repere].join(" ").toLowerCase().includes(query.toLowerCase())
      ),
    [query]
  );

  return (
    <main className="min-h-screen bg-[#f6f8f7] text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Jotoliko OS</p>
            <h1 className="text-lg font-semibold">Centre des opérations</h1>
          </div>
          <div className="hidden rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 sm:block">
            Mode démonstration — serveur non connecté
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <div className="mb-6 flex flex-wrap gap-2">
          {([
            ["responsable", "Responsable", CircleUserRound],
            ["livreur", "Livreur", Smartphone],
            ["vendeur", "Vendeur", Package],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              onClick={() => setRole(value)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                role === value ? "bg-emerald-600 text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-slate-200"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {role === "responsable" && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {RESPONSABLE_KPIS.map(({ title, value, note, icon: Icon }) => (
                <div key={title} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
                  <div className="flex items-center justify-between">
                    <Icon className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                    <span className="text-2xl font-bold">{value}</span>
                  </div>
                  <p className="mt-4 font-semibold">{title}</p>
                  <p className="mt-1 text-xs text-slate-500">{note}</p>
                </div>
              ))}
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_.6fr]">
              <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Aujourd’hui</p>
                    <h2 className="mt-1 text-xl font-semibold">Activité opérationnelle</h2>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Commande, client, quartier…"
                      className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 sm:w-64"
                    />
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {filtered.map((m) => (
                    <div key={m.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-slate-400">{m.id}</p>
                          <p className="mt-1 font-semibold">{m.client}</p>
                          <p className="mt-1 text-sm text-slate-500">{m.quartier} · {m.repere}</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          m.status === "A_VERIFIER" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                        }`}>
                          {m.status === "A_VERIFIER" ? "À VÉRIFIER" : m.status}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> GPS {m.gps.toLowerCase()}</span>
                        <span className="inline-flex items-center gap-1.5"><WalletCards className="h-3.5 w-3.5" /> Attendu {money(m.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <aside className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm">
                <div className="flex items-center gap-2 text-emerald-400">
                  <ShieldCheck className="h-5 w-5" />
                  <span className="text-xs font-bold uppercase tracking-widest">Trust Layer</span>
                </div>
                <h2 className="mt-3 text-xl font-semibold">Ce que le système sait réellement</h2>
                <ul className="mt-5 space-y-3 text-sm text-slate-300">
                  <li>✓ Les données absentes restent absentes.</li>
                  <li>✓ Les positions sont datées.</li>
                  <li>✓ Les ETA sont conditionnelles.</li>
                  <li>✓ Les écarts financiers sont séparés.</li>
                  <li>✓ Les anomalies restent visibles.</li>
                </ul>
              </aside>
            </section>
          </>
        )}

        {role === "livreur" && (
          <section className="mx-auto max-w-xl">
            <div className="rounded-[2rem] bg-white p-5 shadow-xl ring-1 ring-slate-200/70 sm:p-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Ma journée</p>
                  <h2 className="mt-1 text-2xl font-semibold">Mission actuelle</h2>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Hors ligne possible</span>
              </div>

              <div className="mt-6 rounded-2xl bg-slate-50 p-5">
                <p className="text-xs font-semibold text-slate-400">MIS-1042</p>
                <h3 className="mt-2 text-xl font-semibold">Client démonstration</h3>
                <p className="mt-2 text-sm text-slate-600">Donnée de localisation non confirmée.</p>
                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  <p>Quartier : <strong>non renseigné</strong></p>
                  <p>Repère : <strong>aucun repère confirmé</strong></p>
                  <p>Montant attendu : <strong>0 FCFA</strong></p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button className="rounded-2xl bg-slate-100 p-4 font-semibold"><Phone className="mx-auto mb-2 h-5 w-5" />Appeler</button>
                <button className="rounded-2xl bg-slate-100 p-4 font-semibold"><MapPin className="mx-auto mb-2 h-5 w-5" />Naviguer</button>
                <button className="rounded-2xl bg-emerald-600 p-4 font-semibold text-white"><CheckCircle2 className="mx-auto mb-2 h-5 w-5" />Arrivé</button>
                <button className="rounded-2xl bg-emerald-50 p-4 font-semibold text-emerald-700"><Package className="mx-auto mb-2 h-5 w-5" />Preuve</button>
                <button className="rounded-2xl bg-emerald-50 p-4 font-semibold text-emerald-700"><CheckCircle2 className="mx-auto mb-2 h-5 w-5" />Livré</button>
                <button className="rounded-2xl bg-slate-100 p-4 font-semibold"><Banknote className="mx-auto mb-2 h-5 w-5" />Encaisser</button>
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <RefreshCw className="h-4 w-4 shrink-0" /> Synchronisation serveur non disponible dans cette version publique.
              </div>
            </div>
          </section>
        )}

        {role === "vendeur" && (
          <section>
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200/70">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Mon activité</p>
              <h2 className="mt-1 text-2xl font-semibold">Commandes, clients et argent</h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Commandes", "—"],
                  ["En livraison", "—"],
                  ["Encaissé", "—"],
                  ["Écarts", "À vérifier"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-slate-50 p-5">
                    <p className="text-sm text-slate-500">{label}</p>
                    <p className="mt-2 text-xl font-bold">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-6 text-center">
                <p className="font-semibold">Recherche vendeur</p>
                <p className="mt-1 text-sm text-slate-500">Nom, téléphone, référence, quartier ou livreur.</p>
              </div>
            </div>
          </section>
        )}

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 text-xs text-slate-500">
          <span>Jotoliko OS · données de démonstration explicitement signalées</span>
          <span className="inline-flex items-center gap-1">Voir la roadmap <ArrowRight className="h-3 w-3" /></span>
        </footer>
      </div>
    </main>
  );
}
