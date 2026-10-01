import Link from "next/link";
import type { Metadata } from "next";
import { Check } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { CTA, Section } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { faqs, pricing } from "@/lib/content";

export const metadata: Metadata = {
  title: "Tarifs",
  description:
    "Des tarifs simples en FCFA, adaptés aux PME africaines. Starter, Business et Entreprise : choisissez la formule qui suit votre croissance.",
  alternates: { canonical: "/tarifs" },
};

export default function PricingPage() {
  return (
    <>
      <PageHero
        eyebrow="Tarifs"
        title="Des prix clairs, en FCFA, sans surprise."
        body="Payez pour ce que vous utilisez réellement. Tous les plans incluent les commandes illimitées et l'application livreur."
      />

      <Section>
        <div className="grid gap-5 lg:grid-cols-3">
          {pricing.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 0.07}>
              <div
                className={
                  plan.highlight
                    ? "relative h-full rounded-2xl border-2 border-brand bg-white p-8 shadow-lift"
                    : "card h-full p-8"
                }
              >
                {plan.highlight ? (
                  <span className="absolute -top-3 left-8 rounded-full bg-brand px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
                    Le plus choisi
                  </span>
                ) : null}
                <h2 className="text-lg font-semibold">{plan.name}</h2>
                <p className="mt-2 text-sm text-ink-500">{plan.tagline}</p>
                <div className="mt-6 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tight">{plan.price}</span>
                  <span className="text-sm text-ink-500">{plan.unit}</span>
                </div>
                <ul className="mt-7 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-ink-700">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success-soft text-success">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.highlight ? "/demo" : "/contact"}
                  className={plan.highlight ? "btn-primary mt-8 w-full" : "btn-ghost mt-8 w-full"}
                >
                  {plan.cta}
                </Link>
              </div>
            </Reveal>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-ink-500">
          Tous les prix sont hors taxes. Réduction de 20% sur les engagements annuels.{" "}
          <Link href="/contact" className="font-semibold text-brand">
            Un besoin particulier ?
          </Link>
        </p>
      </Section>

      <Section className="pt-0">
        <h2 className="text-2xl font-semibold">Questions fréquentes sur les tarifs</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {faqs.slice(0, 4).map((f, i) => (
            <Reveal key={f.q} delay={(i % 2) * 0.05}>
              <div className="card h-full p-6">
                <h3 className="text-base font-semibold">{f.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{f.a}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <CTA
        title="Démarrez accompagné, montez en puissance ensuite."
        body="Nous configurons votre espace avec vos clients et vos premières commandes, puis nous formons votre équipe. Les entreprises pilotes bénéficient d'un accompagnement renforcé."
        primary={{ href: "/contact", label: "Demander un accès pilote" }}
        secondary={{ href: "/demo", label: "Demander une démo" }}
      />
    </>
  );
}
