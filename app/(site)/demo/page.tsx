import type { Metadata } from "next";
import { CalendarCheck, Clock, Phone, Sparkles } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { LeadForm } from "@/components/ui/lead-form";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = {
  title: "Demander une démo",
  description:
    "Voyez Jotoliko sur vos propres commandes. Démonstration personnalisée en 30 minutes, configuration avec vos données en 48 heures.",
  alternates: { canonical: "/demo" },
};

const steps = [
  { icon: Phone, title: "1. Un appel de 30 minutes", body: "Nous comprenons vos opérations, vos zones et vos contraintes." },
  { icon: Sparkles, title: "2. Une démo sur vos données", body: "Nous configurons un environnement avec vos commandes et vos livreurs." },
  { icon: CalendarCheck, title: "3. Un plan de démarrage", body: "Import de vos clients, formation des équipes, mise en route accompagnée." },
];

export default function DemoPage() {
  return (
    <>
      <PageHero
        eyebrow="Demander une démo"
        title="Voyez Jotoliko tourner sur vos propres commandes."
        body="Pas de démo générique. Nous partons de votre organisation réelle pour vous montrer exactement ce que la plateforme change."
      >
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-500">
          <span className="inline-flex items-center gap-2">
            <Clock className="h-4 w-4 text-brand" /> 30 minutes
          </span>
          <span className="inline-flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-brand" /> Réponse sous 24h
          </span>
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" /> Sans engagement
          </span>
        </div>
      </PageHero>

      <Section>
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-14">
          <div>
            <h2 className="text-2xl font-semibold">Comment ça se passe</h2>
            <ol className="mt-8 space-y-6">
              {steps.map((s, i) => (
                <Reveal key={s.title} delay={i * 0.07}>
                  <li className="flex gap-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                      <s.icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold">{s.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-ink-500">{s.body}</p>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ol>

            <div className="card mt-10 p-6">
              <p className="text-sm font-semibold text-ink">Vous préférez WhatsApp ?</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                C&apos;est le canal que nous utilisons le plus. Envoyez-nous un message, nous
                répondons directement.
              </p>
            </div>
          </div>

          <Reveal delay={0.1}>
            <LeadForm variant="demo" />
          </Reveal>
        </div>
      </Section>
    </>
  );
}
