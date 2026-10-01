import Link from "next/link";
import type { Metadata } from "next";
import { BellRing, MessageCircle, PhoneCall, RefreshCw, Send, Smartphone } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { CTA, Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = {
  title: "Communication & notifications",
  description:
    "Confirmation de commande, départ du livreur, livraison effectuée, relance client : le module de communication Jotoliko, prévu en V2, sur WhatsApp et SMS.",
  alternates: { canonical: "/communication" },
};

const etapes = [
  {
    icon: MessageCircle,
    moment: "À la création de la commande",
    titre: "Confirmation client",
    detail:
      "Le client reçoit le récapitulatif de sa commande et la référence à conserver. Le bureau n'a plus à confirmer par appel.",
  },
  {
    icon: Send,
    moment: "Au départ du livreur",
    titre: "Notification de départ",
    detail:
      "Le client sait que sa commande est en route, et peut se rendre disponible avant l'arrivée du livreur.",
  },
  {
    icon: BellRing,
    moment: "À la livraison",
    titre: "Livraison effectuée",
    detail:
      "La confirmation part automatiquement dès que la preuve est enregistrée, avec l'heure de remise.",
  },
  {
    icon: RefreshCw,
    moment: "En cas d'échec",
    titre: "Relance et replanification",
    detail:
      "Client injoignable ou adresse introuvable : le motif est enregistré, et la relance peut être déclenchée sans ressaisie.",
  },
];

const canaux = [
  {
    icon: MessageCircle,
    nom: "WhatsApp",
    detail:
      "Le canal que vos clients utilisent déjà. Confirmation, départ et livraison passent là où ils lisent réellement leurs messages.",
    statut: "V2",
  },
  {
    icon: Smartphone,
    nom: "SMS",
    detail:
      "Pour les clients sans smartphone ou hors forfait data. Un message court suffit pour confirmer une commande ou annoncer un passage.",
    statut: "V2",
  },
  {
    icon: PhoneCall,
    nom: "Appel direct",
    detail:
      "Déjà disponible : le livreur appelle le client en un tap depuis sa mission, sans ressaisir le numéro.",
    statut: "Disponible",
  },
];

export default function CommunicationPage() {
  return (
    <>
      <PageHero
        eyebrow="Module prévu en V2"
        title="Arrêtez de confirmer vos commandes une par une."
        body="Confirmation, départ du livreur, livraison effectuée, relance : ces messages partent aujourd'hui à la main, quand ils partent. Jotoliko les enverra automatiquement sur WhatsApp et SMS."
      >
        <div className="flex flex-wrap gap-3">
          <Link href="/demo" className="btn-primary">
            Être prévenu du lancement
          </Link>
          <Link href="/fonctionnalites" className="btn-ghost">
            Voir les fonctions disponibles
          </Link>
        </div>
      </PageHero>

      <Section>
        <div className="card p-8">
          <h2 className="text-lg font-semibold">Ce module n&apos;est pas encore disponible</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-500">
            Cette page décrit un module prévu après le MVP. Elle ne présente aucune fonction déjà
            livrée. Aujourd&apos;hui, Jotoliko enregistre les statuts et permet au livreur
            d&apos;appeler le client en un tap ; l&apos;envoi automatique de messages sur WhatsApp et
            SMS arrive en V2. Nous préférons vous le dire clairement plutôt que de vous laisser
            croire que c&apos;est déjà là.
          </p>
        </div>
      </Section>

      <Section className="pt-0">
        <SectionHeading
          eyebrow="Les quatre moments"
          title="Quatre messages qui suppriment quatre appels."
          body="Chaque étape de la commande déclenche un message au client. Le bureau cesse de servir de standard téléphonique."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {etapes.map((e, i) => (
            <Reveal key={e.titre} delay={(i % 2) * 0.06}>
              <div className="card h-full p-7">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand">
                  <e.icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <p className="mt-5 text-xs font-medium uppercase tracking-wide text-ink-500">
                  {e.moment}
                </p>
                <h3 className="mt-1 text-base font-semibold">{e.titre}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{e.detail}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="pt-0">
        <SectionHeading
          eyebrow="Canaux"
          title="Là où vos clients lisent vraiment."
          body="Nous partons des canaux réellement utilisés au Sénégal et en Afrique de l'Ouest, pas de l'email."
        />
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {canaux.map((c, i) => (
            <Reveal key={c.nom} delay={i * 0.06}>
              <div className="card h-full p-7">
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-ink">
                    <c.icon className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <span
                    className={
                      c.statut === "Disponible"
                        ? "rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-semibold text-success"
                        : "rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-ink-500"
                    }
                  >
                    {c.statut}
                  </span>
                </div>
                <h3 className="mt-5 text-base font-semibold">{c.nom}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{c.detail}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="pt-0">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-2xl font-semibold sm:text-3xl">Ce que cela change au quotidien</h2>
            <ul className="mt-8 space-y-5">
              {[
                "Le bureau ne confirme plus chaque commande au téléphone.",
                "Le client sait quand le livreur part, donc il est joignable.",
                "Une livraison réussie se confirme toute seule.",
                "Une relance ne se ressaisit pas : elle repart de la commande existante.",
              ].map((x, i) => (
                <Reveal key={x} delay={i * 0.05}>
                  <li className="flex items-start gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    <span className="text-base leading-relaxed text-ink-700">{x}</span>
                  </li>
                </Reveal>
              ))}
            </ul>
          </div>
          <Reveal delay={0.1}>
            <div className="card p-8">
              <h3 className="text-lg font-semibold">Et en attendant la V2 ?</h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-500">
                Vous n&apos;êtes pas bloqué. Aujourd&apos;hui, le livreur appelle le client en un tap
                depuis sa mission, l&apos;état d&apos;une livraison est consultable sans téléphoner,
                et le suivi client est partageable par lien. Le module de communication ajoutera
                l&apos;automatique — il ne débloque pas ce qui ne fonctionne pas déjà.
              </p>
              <Link href="/fonctionnalites/application-livreur" className="btn-primary mt-6">
                Voir l&apos;application livreur
              </Link>
            </div>
          </Reveal>
        </div>
      </Section>

      <CTA
        title="Vous voulez ce module en priorité ?"
        body="Dites-nous comment vos clients préfèrent être prévenus. Les retours du terrain décident de l'ordre de la roadmap."
      />
    </>
  );
}
