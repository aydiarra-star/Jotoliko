import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Check, CircleAlert } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { CTA, Section, SectionHeading } from "@/components/ui/section";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { features } from "@/lib/content";
import { secteurs, trouverSecteur } from "@/lib/secteurs";

export function generateStaticParams() {
  return secteurs.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const secteur = trouverSecteur(slug);
  if (!secteur) return {};
  return {
    title: secteur.nom,
    description: secteur.accroche,
    alternates: { canonical: `/secteurs/${secteur.slug}` },
  };
}

export default async function SecteurPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const secteur = trouverSecteur(slug);
  if (!secteur) notFound();

  const autres = secteurs.filter((s) => s.slug !== secteur.slug).slice(0, 3);
  const fonctionnalites = secteur.fonctionnalites
    .map((f) => features.find((x) => x.slug === f))
    .filter((f): f is (typeof features)[number] => Boolean(f));

  return (
    <>
      <PageHero eyebrow={secteur.nomCourt} title={secteur.nom} body={secteur.accroche}>
        <div className="flex flex-wrap gap-3">
          <Link href="/demo" className="btn-primary">
            Demander une démo
          </Link>
          <Link href="/secteurs" className="btn-ghost">
            Voir tous les métiers
          </Link>
        </div>
      </PageHero>

      <Section>
        <SectionHeading
          eyebrow="Votre situation"
          title="Ce que vous vivez aujourd'hui"
          body={secteur.situation}
        />
      </Section>

      <Section className="pt-0">
        <h2 className="text-2xl font-semibold sm:text-3xl">Ce qui vous coûte le plus</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {secteur.problematiques.map((p, i) => (
            <Reveal key={p.titre} delay={(i % 2) * 0.06}>
              <div className="card h-full p-6">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-ink">
                  <CircleAlert className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <h3 className="mt-5 text-base font-semibold">{p.titre}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{p.detail}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="pt-0">
        <h2 className="text-2xl font-semibold sm:text-3xl">Ce que Jotoliko change</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {secteur.benefices.map((b, i) => (
            <Reveal key={b.titre} delay={(i % 2) * 0.06}>
              <div className="card h-full p-6">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-success-soft text-success">
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                </span>
                <h3 className="mt-5 text-base font-semibold">{b.titre}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{b.detail}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="pt-0">
        <h2 className="text-2xl font-semibold sm:text-3xl">Trois moments de votre journée</h2>
        <ol className="mt-10 grid gap-4 lg:grid-cols-3">
          {secteur.casUsage.map((c, i) => (
            <Reveal key={c.titre} delay={i * 0.06}>
              <li className="card flex h-full items-start gap-4 p-6">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-sm font-semibold text-brand">
                  {i + 1}
                </span>
                <span>
                  <h3 className="text-base font-semibold">{c.titre}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{c.detail}</p>
                </span>
              </li>
            </Reveal>
          ))}
        </ol>
      </Section>

      <Section className="pt-0">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-2xl font-semibold sm:text-3xl">Les fonctions que vous utiliserez</h2>
            <ul className="mt-8 space-y-4">
              {fonctionnalites.map((f, i) => (
                <Reveal key={f.slug} delay={i * 0.05}>
                  <li>
                    <Link href={`/fonctionnalites/${f.slug}`} className="group flex items-start gap-3">
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                        <Icon name={f.icon} className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="text-base font-semibold text-ink group-hover:text-brand">
                          {f.title}
                        </span>
                        <span className="block text-sm leading-relaxed text-ink-500">
                          {f.tagline}
                        </span>
                      </span>
                    </Link>
                  </li>
                </Reveal>
              ))}
            </ul>
          </div>

          <Reveal delay={0.1}>
            <div className="card overflow-hidden">
              <div className="border-b border-slate-200 bg-surface px-5 py-3 text-xs font-medium text-ink-500">
                Aperçu — configuration de démonstration
              </div>
              <div className="grid place-items-center bg-white p-10 text-center">
                <span className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-soft text-brand">
                  <Icon name={secteur.icon} className="h-8 w-8" />
                </span>
                <p className="mt-6 max-w-xs text-sm leading-relaxed text-ink-500">
                  Aperçu produit. Une démonstration configurée avec vos propres données est fournie
                  lors de l&apos;appel.
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
        <div className="card p-8">
          <h2 className="text-lg font-semibold">
            Ce que nous ne publierons pas tant que ce n&apos;est pas vrai
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-500">
            Vous ne trouverez ici ni témoignage, ni logo client, ni pourcentage de gain. Jotoliko
            n&apos;a pas encore de clients publiés : ces pages décrivent des cas d&apos;usage et des
            problèmes observés sur le terrain, pas des résultats mesurés. Nous publierons des
            chiffres le jour où nous les aurons relevés sur des opérations réelles, avec
            l&apos;accord des entreprises concernées.
          </p>
        </div>
      </Section>

      <Section className="pt-0">
        <h2 className="text-2xl font-semibold">Autres métiers</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {autres.map((s) => (
            <Link
              key={s.slug}
              href={`/secteurs/${s.slug}`}
              className="card group p-6 transition hover:-translate-y-1 hover:shadow-lift"
            >
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-ink">
                <Icon name={s.icon} className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold">{s.nomCourt}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">{s.accroche}</p>
            </Link>
          ))}
        </div>
      </Section>

      <Section className="pt-0">
        <Link href="/secteurs" className="inline-flex items-center gap-2 text-sm font-semibold text-brand">
          <ArrowLeft className="h-4 w-4" /> Tous les métiers
        </Link>
      </Section>

      <CTA
        title="Montrez-nous votre journée type."
        body="En 30 minutes, nous identifions les étapes de votre métier que Jotoliko peut simplifier dès la première semaine."
      />
    </>
  );
}
