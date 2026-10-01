import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DeliveryDetail } from "@/components/tracking/delivery-detail";
import { DemoBanner } from "@/components/tracking/demo-banner";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { LIVRAISONS_DEMO, trouverLivraisonDemo } from "@/lib/demo";

export function generateStaticParams() {
  return LIVRAISONS_DEMO.map((l) => ({ reference: l.reference }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ reference: string }>;
}): Promise<Metadata> {
  const { reference } = await params;
  return {
    title: `Suivi de la livraison #${reference}`,
    description:
      "Position du livreur, trajet enregistré, destination du client, progression et encaissement d'une livraison Jotoliko.",
    alternates: { canonical: `/suivi/${reference}` },
    robots: { index: false, follow: true },
  };
}

export default async function SuiviPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const livraison = trouverLivraisonDemo(reference);
  if (!livraison) notFound();

  return (
    <>
      <PageHero
        eyebrow={`Livraison #${livraison.reference}`}
        title="Suivi de la livraison"
        body="Où se trouve le livreur, où est le client, où en est la livraison et combien a été encaissé."
      >
        <Link
          href="/fonctionnalites/suivi-gps"
          className="inline-flex items-center gap-2 text-sm font-semibold text-brand"
        >
          <ArrowLeft className="h-4 w-4" /> La fonctionnalité suivi GPS
        </Link>
      </PageHero>

      <Section>
        <div className="space-y-6">
          <DemoBanner
            precision={
              livraison.trace.length === 0
                ? "Cette livraison de démonstration n'a reçu aucune position : l'interface montre volontairement le cas « position indisponible »."
                : "Cette livraison est un scénario fictif. Les positions sont datées au moment où vous ouvrez la page, puis vieillissent réellement : vous verrez l'interface basculer d'une position à jour vers « dernière position connue »."
            }
          />
          <DeliveryDetail livraison={livraison} />
        </div>
      </Section>
    </>
  );
}
