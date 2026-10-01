import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { CTA, Section } from "@/components/ui/section";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { secteurs } from "@/lib/secteurs";

export const metadata: Metadata = {
  title: "Jotoliko pour votre métier",
  description:
    "Sociétés de livraison, restaurants, pharmacies, e-commerce, grossistes, distributeurs, maintenance terrain : Jotoliko s'adapte aux opérations de votre métier.",
  alternates: { canonical: "/secteurs" },
};

export default function SecteursPage() {
  return (
    <>
      <PageHero
        eyebrow="Secteurs"
        title="Jotoliko pour votre métier."
        body="Chaque métier a ses contraintes. Choisissez le vôtre pour voir les problèmes que Jotoliko traite, les fonctions que vous utiliserez et trois moments de votre journée qu'il simplifie."
      >
        <Link href="/demo" className="btn-primary">
          Demander une démo
        </Link>
      </PageHero>

      <Section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {secteurs.map((s, i) => (
            <Reveal key={s.slug} delay={(i % 3) * 0.06}>
              <Link
                href={`/secteurs/${s.slug}`}
                className="card group flex h-full flex-col p-7 transition hover:-translate-y-1 hover:shadow-lift"
              >
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-brand">
                  <Icon name={s.icon} className="h-6 w-6" />
                </span>
                <h2 className="mt-5 text-lg font-semibold">{s.nomCourt}</h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-500">{s.accroche}</p>
                <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brand">
                  Voir ce métier
                  <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="pt-0">
        <div className="card flex flex-col items-start justify-between gap-6 p-8 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold">Votre métier n&apos;est pas dans la liste ?</h2>
            <p className="mt-2 text-sm text-ink-500">
              Si vos équipes se déplacent et encaissent sur le terrain, Jotoliko peut vous servir.
            </p>
          </div>
          <Link href="/contact" className="btn-dark shrink-0">
            Décrire mon besoin <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Section>

      <CTA
        title="Configurons Jotoliko pour votre métier."
        body="Un appel de 30 minutes suffit pour identifier vos besoins et vous montrer une configuration adaptée."
      />
    </>
  );
}
