import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { CTA, Section } from "@/components/ui/section";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { personas } from "@/lib/content";

export const metadata: Metadata = {
  title: "Solutions",
  description:
    "Sociétés de livraison, restaurants, pharmacies, e-commerce, boutiques Instagram, grossistes et agents terrain : Jotoliko s'adapte à votre métier.",
  alternates: { canonical: "/solutions" },
};

export default function SolutionsPage() {
  return (
    <>
      <PageHero
        eyebrow="Solutions"
        title="Chaque métier a ses contraintes. Jotoliko les comprend."
        body="Nous partons de votre journée réelle — pas d'un organigramme théorique — pour configurer la plateforme autour de vos opérations."
      >
        <Link href="/demo" className="btn-primary">
          Parler à un expert
        </Link>
      </PageHero>

      <Section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {personas.map((p, i) => (
            <Reveal key={p.title} delay={(i % 3) * 0.06}>
              <div className="card h-full p-7">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-brand">
                  <Icon name={p.icon} className="h-6 w-6" />
                </span>
                <h2 className="mt-5 text-lg font-semibold">{p.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="pt-0">
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            {
              title: "Une adoption en une journée",
              body: "L'interface reprend les mots de vos équipes. Pas de jargon, pas de formation de trois semaines.",
            },
            {
              title: "Une réalité terrain assumée",
              body: "Hors ligne, paiement à la livraison, adressage approximatif : le produit est conçu autour de ces contraintes, pas malgré elles.",
            },
            {
              title: "Un accompagnement local",
              body: "Notre équipe parle votre langue, connaît vos villes et se déplace pour la mise en route.",
            },
          ].map((x, i) => (
            <Reveal key={x.title} delay={i * 0.06}>
              <div className="card h-full p-7">
                <h3 className="text-lg font-semibold">{x.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-500">{x.body}</p>
              </div>
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
