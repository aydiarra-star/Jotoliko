import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { BottomNav } from "@/components/jotcolis/bottom-nav";
import { PROHIBITED_ITEMS } from "@/lib/jotcolis-data";

export default function ObjetsInterditsPage() {
  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          <Link
            href="/trajets"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"
            aria-label="Retour aux trajets"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-bold text-slate-900">Objets interdits</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pt-5">
        <section className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2.5 text-orange-600">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <h2 className="text-base font-bold text-slate-900">
              Contenu interdit dans les colis
            </h2>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            Pour la sécurité des voyageurs et le respect des règles
            douanières, les objets suivants ne peuvent pas être transportés :
          </p>

          <ul className="mt-4 space-y-2.5 text-sm text-slate-800">
            {PROHIBITED_ITEMS.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed"
              >
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-orange-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

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
