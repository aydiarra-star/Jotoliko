import Link from "next/link";
import type { Metadata } from "next";
import { Building2, Compass, Handshake, Target } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { CTA, Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { markets } from "@/lib/content";

export const metadata: Metadata = {
  title: "À propos",
  description:
    "Jotoliko construit le système d'exploitation des opérations terrain en Afrique de l'Ouest. Notre mission, notre vision, nos valeurs.",
  alternates: { canonical: "/a-propos" },
};

const values = [
  {
    icon: Compass,
    title: "Le terrain d'abord",
    body: "Nous concevons pour un livreur à moto sous 35°C, pas pour un bureau climatisé. Chaque décision produit part de là.",
  },
  {
    icon: Handshake,
    title: "La confiance se gagne",
    body: "Vos opérations engagent votre argent et votre réputation. Nous traitons la fiabilité comme une fonctionnalité.",
  },
  {
    icon: Target,
    title: "La simplicité est difficile",
    body: "Réduire une opération complexe à trois taps demande plus de travail que d'ajouter des options. Nous choisissons l'effort.",
  },
  {
    icon: Building2,
    title: "Construit ici, pour ici",
    body: "Notre équipe vit en Afrique de l'Ouest. Nos contraintes sont vos contraintes, nos clients sont nos voisins.",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="À propos"
        title="Nous construisons l'infrastructure des opérations terrain africaines."
        body="Jotoliko est né d'un constat simple : les entreprises africaines livrent plus que jamais, mais pilotent encore leurs opérations avec des outils qui ne sont pas faits pour elles."
      />

      <Section>
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold sm:text-3xl">Notre mission</h2>
            <p className="mt-5 text-base leading-relaxed text-ink-500">
              Permettre aux entreprises africaines de digitaliser leurs opérations terrain, leurs
              livraisons, leurs tournées, leurs encaissements et leur suivi logistique depuis une
              seule plateforme moderne.
            </p>
            <h2 className="mt-12 text-2xl font-semibold sm:text-3xl">Notre vision</h2>
            <p className="mt-5 text-base leading-relaxed text-ink-500">
              Devenir la plateforme SaaS de référence pour la gestion des opérations logistiques en
              Afrique de l&apos;Ouest, en commençant par le Sénégal et en nous étendant là où nos
              clients grandissent.
            </p>
          </div>

          <Reveal delay={0.08}>
            <div className="card p-8">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-ink-500">
                Notre présence
              </h3>
              <ul className="mt-5 space-y-3">
                {markets.map((m) => (
                  <li key={m} className="flex items-center gap-3 text-base text-ink">
                    <span className="h-2 w-2 rounded-full bg-brand" />
                    {m}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sm leading-relaxed text-ink-500">
                Le Sénégal est notre marché de lancement. Chaque nouveau pays est ouvert avec des
                partenaires locaux et un accompagnement de proximité.
              </p>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section className="pt-0">
        <SectionHeading eyebrow="Valeurs" title="Ce qui guide nos décisions produit." />
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {values.map((v, i) => (
            <Reveal key={v.title} delay={(i % 2) * 0.06}>
              <div className="card h-full p-7">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand">
                  <v.icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <h3 className="mt-5 text-lg font-semibold">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{v.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="pt-0">
        <div className="card flex flex-col items-start justify-between gap-6 p-8 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold">Vous voulez construire avec nous ?</h2>
            <p className="mt-2 text-sm text-ink-500">
              Nous recherchons des entreprises pilotes prêtes à co-construire la plateforme.
            </p>
          </div>
          <Link href="/contact" className="btn-dark shrink-0">
            Devenir partenaire pilote
          </Link>
        </div>
      </Section>

      <CTA
        title="Rejoignez les entreprises qui reprennent le contrôle."
        body="Discutons de vos opérations et voyons si Jotoliko correspond à votre réalité."
      />
    </>
  );
}
