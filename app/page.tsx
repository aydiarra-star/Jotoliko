import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CloudOff, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { DashboardMockup } from "@/components/landing/dashboard-mockup";
import { Reveal } from "@/components/ui/reveal";
import { CTA, Section, SectionHeading } from "@/components/ui/section";
import { Icon } from "@/components/ui/icon";
import { features, markets, personas, problems, roadmap, stats, testimonials } from "@/lib/content";

export const metadata: Metadata = {
  title: "Jotoliko — Gérez. Livrez. Encaissez.",
  description:
    "La plateforme SaaS qui centralise vos commandes, vos livreurs, vos tournées et vos encaissements. Conçue pour les entreprises africaines.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 -z-10 grid-lines opacity-70" />
        <div
          aria-hidden
          className="absolute -top-40 left-1/2 -z-10 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl"
        />
        <div className="shell grid items-center gap-14 pb-20 pt-16 sm:pt-24 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
          <div>
            <Reveal>
              <span className="eyebrow">
                <Sparkles className="h-3.5 w-3.5" />
                Operating system des opérations terrain
              </span>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="mt-6 text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-[3.4rem]">
                Gérez vos livraisons et vos encaissements depuis une seule plateforme.
              </h1>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-500">
                Jotoliko aide les entreprises africaines à gérer leurs opérations de manière simple,
                rapide et efficace. Commandes, livreurs, tournées, preuves de livraison et caisse —
                tout au même endroit.
              </p>
            </Reveal>
            <Reveal delay={0.18}>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/demo" className="btn-primary">
                  Demander une démo <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/tarifs" className="btn-ghost">
                  Commencer gratuitement
                </Link>
              </div>
            </Reveal>
            <Reveal delay={0.24}>
              <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-ink-500">
                <li className="inline-flex items-center gap-2">
                  <CloudOff className="h-4 w-4 text-brand" /> Fonctionne hors ligne
                </li>
                <li className="inline-flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-brand" /> Cash tracé au centime
                </li>
                <li className="inline-flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-brand" /> Données isolées par entreprise
                </li>
              </ul>
            </Reveal>
          </div>

          <Reveal delay={0.1}>
            <DashboardMockup />
          </Reveal>
        </div>

        {/* market marquee */}
        <div className="border-y border-slate-200 bg-surface/70 py-5">
          <div className="shell flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-ink-500">
            <span className="font-semibold text-ink">Pensé pour l&apos;Afrique de l&apos;Ouest :</span>
            {markets.map((m) => (
              <span key={m} className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" /> {m}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <Section>
        <SectionHeading
          eyebrow="Le problème"
          title="Vos opérations vivent sur WhatsApp, Excel et des cahiers."
          body="Résultat : des commandes perdues, des livreurs injoignables et une caisse impossible à réconcilier. Jotoliko remplace ce désordre par une seule source de vérité."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {problems.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.06}>
              <div className="card h-full p-6">
                <div className="h-9 w-9 rounded-lg bg-slate-100" />
                <h3 className="mt-5 text-base font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* STATS */}
      <Section className="pt-0">
        <div className="grid gap-6 rounded-3xl bg-ink px-6 py-12 text-white sm:px-12 lg:grid-cols-4">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.06}>
              <div>
                <p className="text-4xl font-semibold text-white">{s.value}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.label}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* FEATURES */}
      <Section className="pt-0">
        <SectionHeading
          eyebrow="Fonctionnalités"
          title="Tout ce dont vos opérations terrain ont besoin."
          body="Un socle simple, pensé pour être adopté en une journée, pas en trois mois de formation."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <Reveal key={f.slug} delay={(i % 4) * 0.06}>
              <Link href={`/fonctionnalites#${f.slug}`} className="card group block h-full p-6 transition hover:-translate-y-1 hover:shadow-lift">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand">
                  <Icon name={f.icon} className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-base font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{f.body}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">
                  En savoir plus
                  <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* OFFLINE + CASH HIGHLIGHT */}
      <Section className="pt-0">
        <div className="grid gap-4 lg:grid-cols-2">
          <Reveal>
            <div className="card h-full p-8">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-white">
                <CloudOff className="h-5 w-5" />
              </span>
              <h3 className="mt-6 text-2xl font-semibold">Conçu pour le réseau qui vacille.</h3>
              <p className="mt-4 leading-relaxed text-ink-500">
                Un livreur sans réseau reste un livreur. Missions, déclarations de livraison et
                encaissements sont enregistrés sur le téléphone, puis synchronisés dès que la
                connexion revient. Aucune livraison n&apos;est perdue.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="card h-full p-8">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-success text-white">
                <Wallet className="h-5 w-5" />
              </span>
              <h3 className="mt-6 text-2xl font-semibold">Le cash tracé jusqu&apos;à la remise.</h3>
              <p className="mt-4 leading-relaxed text-ink-500">
                Jotoliko enregistre ce que chaque livreur encaisse, calcule ce qu&apos;il doit
                reverser et met en évidence le moindre écart. C&apos;est là que le produit devient
                indispensable à votre quotidien.
              </p>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* PERSONAS */}
      <Section className="pt-0">
        <SectionHeading
          eyebrow="Solutions"
          title="Un outil, plusieurs métiers."
          body="Du livreur indépendant au distributeur multi-sites, Jotoliko s'adapte à votre réalité terrain."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {personas.map((p, i) => (
            <Reveal key={p.title} delay={(i % 3) * 0.06}>
              <Link href="/solutions" className="card group flex h-full items-start gap-4 p-6 transition hover:-translate-y-1 hover:shadow-lift">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-ink">
                  <Icon name={p.icon} className="h-5 w-5" />
                </span>
                <span>
                  <h3 className="text-base font-semibold">{p.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{p.body}</p>
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* TESTIMONIALS */}
      <Section className="pt-0">
        <SectionHeading
          eyebrow="Témoignages"
          title="Ce que change Jotoliko, concrètement."
        />
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {testimonials.map((t, i) => (
            <Reveal key={t.author} delay={i * 0.07}>
              <figure className="card flex h-full flex-col justify-between p-7">
                <blockquote className="text-base leading-relaxed text-ink">
                  « {t.quote} »
                </blockquote>
                <figcaption className="mt-6 text-sm">
                  <span className="font-semibold text-ink">{t.author}</span>
                  <span className="block text-ink-500">{t.role}</span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ROADMAP */}
      <Section className="pt-0">
        <SectionHeading
          eyebrow="Roadmap"
          title="Une base solide, une vision claire."
          body="Nous livrons d'abord ce qui fait tourner vos opérations, puis nous étendons vers les canaux que vos clients utilisent déjà."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {roadmap.map((r, i) => (
            <Reveal key={r.phase} delay={i * 0.06}>
              <div className="card h-full p-6">
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
            </Reveal>
          ))}
        </div>
      </Section>

      <CTA
        title="Prêt à reprendre le contrôle de vos opérations ?"
        body="Voyez Jotoliko sur vos propres commandes. Nous configurons un environnement de démonstration avec vos données en moins de 48 heures."
        primary={{ href: "/demo", label: "Demander une démo" }}
        secondary={{ href: "/fonctionnalites", label: "Explorer les fonctionnalités" }}
      />
    </>
  );
}
