import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { CTA, Section } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { posts } from "@/lib/posts";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Réflexions sur la logistique, les encaissements et la digitalisation des opérations terrain en Afrique de l'Ouest.",
  alternates: { canonical: "/blog" },
};

export default function BlogPage() {
  const [featured, ...rest] = posts;

  return (
    <>
      <PageHero
        eyebrow="Blog"
        title="Le terrain, la caisse, et ce qui marche vraiment."
        body="Nous écrivons sur ce que nous observons chez les entreprises qui livrent en Afrique de l'Ouest — sans jargon et sans recettes importées."
      />

      <Section>
        <Reveal>
          <Link
            href={`/blog/${featured.slug}`}
            className="card group block p-8 transition hover:-translate-y-1 hover:shadow-lift lg:p-10"
          >
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="rounded-full bg-brand-soft px-3 py-1 font-semibold text-brand">
                {featured.category}
              </span>
              <span className="text-ink-500">{formatDate(featured.date)}</span>
              <span className="text-ink-500">· {featured.readingTime} de lecture</span>
            </div>
            <h2 className="mt-5 text-2xl font-semibold sm:text-3xl">{featured.title}</h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-ink-500">{featured.excerpt}</p>
            <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand">
              Lire l&apos;article
              <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        </Reveal>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((p, i) => (
            <Reveal key={p.slug} delay={(i % 3) * 0.06}>
              <Link href={`/blog/${p.slug}`} className="card group flex h-full flex-col p-7 transition hover:-translate-y-1 hover:shadow-lift">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-ink-500">
                    {p.category}
                  </span>
                  <span className="text-ink-500">{p.readingTime}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold leading-snug">{p.title}</h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-500">{p.excerpt}</p>
                <span className="mt-5 text-xs text-ink-500">{formatDate(p.date)}</span>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      <CTA
        title="Vous voulez qu'on parle de votre cas ?"
        body="Chaque opération a ses particularités. Discutons de la vôtre plutôt que de théorie."
      />
    </>
  );
}
