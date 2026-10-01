import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Check } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { CTA, Section } from "@/components/ui/section";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { features } from "@/lib/content";

export function generateStaticParams() {
  return features.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const feature = features.find((f) => f.slug === slug);
  if (!feature) return {};
  return {
    title: feature.title,
    description: feature.body,
    alternates: { canonical: `/fonctionnalites/${feature.slug}` },
  };
}

export default async function FeaturePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const feature = features.find((f) => f.slug === slug);
  if (!feature) notFound();

  const others = features.filter((f) => f.slug !== feature.slug).slice(0, 3);

  return (
    <>
      <PageHero eyebrow={feature.tagline} title={feature.title} body={feature.body}>
        <Link
          href="/fonctionnalites"
          className="inline-flex items-center gap-2 text-sm font-semibold text-brand"
        >
          <ArrowLeft className="h-4 w-4" /> Toutes les fonctionnalités
        </Link>
      </PageHero>

      <Section>
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-2xl font-semibold sm:text-3xl">Ce que ça change pour vous</h2>
            <ul className="mt-8 space-y-4">
              {feature.points.map((p, i) => (
                <Reveal key={p} delay={i * 0.05}>
                  <li className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-success-soft text-success">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                    <span className="text-base leading-relaxed text-ink-700">{p}</span>
                  </li>
                </Reveal>
              ))}
            </ul>
          </div>

          <Reveal delay={0.1}>
            <div className="card overflow-hidden">
              <div className="border-b border-slate-200 bg-surface px-5 py-3 text-xs font-medium text-ink-500">
                app.jotoliko.com/{feature.slug}
              </div>
              <div className="grid place-items-center bg-white p-10">
                <span className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-soft text-brand">
                  <Icon name={feature.icon} className="h-8 w-8" />
                </span>
                <p className="mt-6 text-center text-sm text-ink-500">
                  Aperçu produit — configuration de démonstration fournie avec vos propres données.
                </p>
                <Link href="/demo" className="btn-primary mt-6">
                  Voir en démo
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section className="pt-0">
        <h2 className="text-2xl font-semibold">À explorer ensuite</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {others.map((f) => (
            <Link
              key={f.slug}
              href={`/fonctionnalites/${f.slug}`}
              className="card group p-6 transition hover:-translate-y-1 hover:shadow-lift"
            >
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-ink">
                <Icon name={f.icon} className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">{f.tagline}</p>
            </Link>
          ))}
        </div>
      </Section>

      <CTA
        title="Voyez cette fonctionnalité sur vos données."
        body="Nous préparons une démonstration configurée avec vos commandes, vos zones et vos livreurs."
      />
    </>
  );
}
