import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { CTA, Section } from "@/components/ui/section";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { features, roadmap } from "@/lib/content";

export const metadata: Metadata = {
  title: "Fonctionnalités",
  description:
    "Commandes, livreurs, tournées, suivi GPS, preuve de livraison, encaissements et rapports : découvrez tout ce que Jotoliko centralise.",
  alternates: { canonical: "/fonctionnalites" },
};

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        eyebrow="Fonctionnalités"
        title="Un système d'exploitation pour vos opérations terrain."
        body="Chaque module répond à un problème réel du terrain africain : réseau instable, paiement à la livraison, adressage approximatif, adoption rapide."
      >
        <div className="flex flex-wrap gap-3">
          <Link href="/demo" className="btn-primary">
            Demander une démo
          </Link>
          <Link href="/tarifs" className="btn-ghost">
            Voir les tarifs
          </Link>
        </div>
      </PageHero>

      <Section>
        <div className="grid gap-4 md:grid-cols-2">
          {features.map((f, i) => (
            <Reveal key={f.slug} delay={(i % 2) * 0.06}>
              <article id={f.slug} className="card h-full scroll-mt-24 p-7">
                <div className="flex items-start gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                    <Icon name={f.icon} className="h-6 w-6" />
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold">{f.title}</h2>
                    <p className="text-sm font-medium text-brand">{f.tagline}</p>
                  </div>
                </div>
                <p className="mt-5 text-sm leading-relaxed text-ink-500">{f.body}</p>
                <ul className="mt-5 space-y-2.5">
                  {f.points.map((p) => (
                    <li key={p} className="flex gap-2 text-sm text-ink-700">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                      {p}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/fonctionnalites/${f.slug}`}
                  className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand"
                >
                  Détail du module
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="pt-0">
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 px-7 py-6">
            <h2 className="text-2xl font-semibold">Roadmap produit</h2>
            <p className="mt-2 text-sm text-ink-500">
              Nous livrons par étapes, en priorisant ce qui fait tourner vos opérations.
            </p>
          </div>
          <div className="grid divide-y divide-slate-200 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
            {roadmap.map((r) => (
              <div key={r.phase} className="border-slate-200 p-7 sm:border-r last:border-r-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">{r.phase}</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-ink-500">
                    {r.label}
                  </span>
                </div>
                <ul className="mt-4 space-y-2.5">
                  {r.items.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-ink-500">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <CTA
        title="Une démo vaut mille slides."
        body="Nous configurons un environnement avec vos zones, vos livreurs et vos commandes types."
      />
    </>
  );
}
