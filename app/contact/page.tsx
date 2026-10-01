import type { Metadata } from "next";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { LeadForm } from "@/components/ui/lead-form";
import { site } from "@/lib/content";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contactez l'équipe Jotoliko : démo, partenariat, support ou question technique. Nous répondons sous 24 heures.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const channels = [
    { icon: Mail, label: "Email", value: site.contactEmail, href: `mailto:${site.contactEmail}` },
    { icon: Phone, label: "Téléphone", value: site.contactPhone, href: `tel:${site.contactPhone.replace(/\s/g, "")}` },
    {
      icon: MessageCircle,
      label: "WhatsApp",
      value: "Discuter maintenant",
      href: `https://wa.me/${site.whatsapp.replace(/\D/g, "")}`,
    },
    { icon: MapPin, label: "Bureau", value: "Dakar, Sénégal", href: undefined },
  ];

  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Parlons de vos opérations."
        body="Une question, un projet, un partenariat ? Notre équipe vous répond sous 24 heures ouvrées."
      />

      <Section>
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-14">
          <div>
            <h2 className="text-2xl font-semibold">Nous joindre</h2>
            <ul className="mt-8 space-y-5">
              {channels.map((c) => (
                <li key={c.label} className="flex items-start gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                    <c.icon className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink-500">{c.label}</p>
                    {c.href ? (
                      <a href={c.href} className="text-base font-semibold text-ink hover:text-brand">
                        {c.value}
                      </a>
                    ) : (
                      <p className="text-base font-semibold text-ink">{c.value}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <LeadForm variant="contact" />
        </div>
      </Section>
    </>
  );
}
