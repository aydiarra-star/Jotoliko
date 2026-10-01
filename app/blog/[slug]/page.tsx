import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { CTA, Section } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { getPost, posts } from "@/lib/posts";
import { formatDate } from "@/lib/utils";
import { site } from "@/lib/content";

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt,
      publishedTime: post.date,
      url: `${site.url}/blog/${post.slug}`,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const more = posts.filter((p) => p.slug !== post.slug).slice(0, 3);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    author: { "@type": "Organization", name: site.name },
    publisher: { "@type": "Organization", name: site.name },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article>
        <header className="border-b border-slate-200 bg-surface">
          <div className="shell max-w-3xl py-14 sm:py-20">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand"
            >
              <ArrowLeft className="h-4 w-4" /> Tous les articles
            </Link>
            <div className="mt-6 flex flex-wrap items-center gap-3 text-xs">
              <span className="rounded-full bg-brand-soft px-3 py-1 font-semibold text-brand">
                {post.category}
              </span>
              <span className="text-ink-500">{formatDate(post.date)}</span>
              <span className="text-ink-500">· {post.readingTime} de lecture</span>
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">{post.title}</h1>
            <p className="mt-5 text-lg leading-relaxed text-ink-500">{post.excerpt}</p>
          </div>
        </header>

        <Section>
          <div className="mx-auto max-w-3xl">
            {post.body.map((paragraph, i) => (
              <Reveal key={i} delay={Math.min(i * 0.04, 0.2)}>
                <p className="mb-6 text-base leading-[1.8] text-ink-700">{paragraph}</p>
              </Reveal>
            ))}

            <div className="mt-12 rounded-2xl bg-ink p-8 text-white">
              <h2 className="text-xl font-semibold">Voir Jotoliko sur vos propres opérations</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                Nous configurons une démonstration avec vos commandes, vos zones et vos livreurs, et
                vous montrons ce que la plateforme change concrètement.
              </p>
              <Link href="/demo" className="btn-primary mt-6">
                Demander une démo
              </Link>
            </div>
          </div>
        </Section>
      </article>

      <Section className="pt-0">
        <h2 className="text-2xl font-semibold">À lire ensuite</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {more.map((p) => (
            <Link
              key={p.slug}
              href={`/blog/${p.slug}`}
              className="card group p-6 transition hover:-translate-y-1 hover:shadow-lift"
            >
              <span className="text-xs font-semibold text-brand">{p.category}</span>
              <h3 className="mt-2 text-base font-semibold leading-snug">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">{p.excerpt}</p>
            </Link>
          ))}
        </div>
      </Section>

      <CTA
        title="Une question sur vos opérations ?"
        body="Notre équipe répond sous 24 heures, en français, sans jargon."
        primary={{ href: "/contact", label: "Nous contacter" }}
        secondary={{ href: "/fonctionnalites", label: "Voir le produit" }}
      />
    </>
  );
}
