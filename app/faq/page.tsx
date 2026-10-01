import Link from "next/link";
import type { Metadata } from "next";
import { PageHero } from "@/components/ui/page-hero";
import { CTA, Section } from "@/components/ui/section";
import { Accordion } from "@/components/ui/accordion";
import { faqs } from "@/lib/content";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Hors ligne, mobile money, adoption par les livreurs, sécurité des données : les réponses aux questions que se posent les entreprises africaines.",
  alternates: { canonical: "/faq" },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function FaqPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <PageHero
        eyebrow="FAQ"
        title="Vos questions, nos réponses."
        body="Si vous ne trouvez pas ce que vous cherchez, notre équipe répond en moins de 24 heures."
      >
        <Link href="/contact" className="btn-primary">
          Poser une question
        </Link>
      </PageHero>

      <Section>
        <div className="mx-auto max-w-3xl">
          <Accordion items={faqs} />
        </div>
      </Section>

      <CTA
        title="Encore une hésitation ?"
        body="Parlons de votre organisation. Nous vous dirons honnêtement si Jotoliko est le bon outil pour vous."
        primary={{ href: "/contact", label: "Nous contacter" }}
        secondary={{ href: "/demo", label: "Demander une démo" }}
      />
    </>
  );
}
