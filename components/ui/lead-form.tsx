"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { site } from "@/lib/content";

type LeadFormProps = {
  variant?: "contact" | "demo";
  className?: string;
};

const sizes = ["1 à 5 livreurs", "6 à 15 livreurs", "16 à 50 livreurs", "Plus de 50 livreurs"];

export function LeadForm({ variant = "demo", className }: LeadFormProps) {
  const [sent, setSent] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const get = (k: string) => String(data.get(k) ?? "").trim();

    const lines = [
      variant === "demo" ? "Demande de démo Jotoliko" : "Message via le site Jotoliko",
      "",
      `Nom : ${get("name")}`,
      `Entreprise : ${get("company")}`,
      `Téléphone : ${get("phone")}`,
      `Email : ${get("email")}`,
      get("size") ? `Taille de l'équipe : ${get("size")}` : "",
      "",
      `Besoin : ${get("message")}`,
    ].filter(Boolean);

    const subject = encodeURIComponent(
      variant === "demo" ? `Demande de démo — ${get("company") || get("name")}` : `Contact — ${get("name")}`,
    );
    const body = encodeURIComponent(lines.join("\n"));
    window.location.href = `mailto:${site.contactEmail}?subject=${subject}&body=${body}`;
    setSent(true);
  }

  if (sent) {
    return (
      <div className={`card grid place-items-center p-10 text-center ${className ?? ""}`}>
        <span className="grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <h3 className="mt-5 text-lg font-semibold">Votre message est prêt à partir</h3>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-500">
          Votre client mail s&apos;est ouvert avec le récapitulatif. Envoyez-le et notre équipe vous
          répond sous 24 heures. Vous préférez discuter tout de suite ?{" "}
          <a
            href={`https://wa.me/${site.whatsapp.replace(/\D/g, "")}`}
            className="font-semibold text-brand"
          >
            Écrivez-nous sur WhatsApp
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`card p-7 sm:p-8 ${className ?? ""}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Nom complet" required />
        <Field name="company" label="Entreprise" required />
        <Field name="phone" label="Téléphone / WhatsApp" type="tel" required />
        <Field name="email" label="Email professionnel" type="email" required />
      </div>

      {variant === "demo" ? (
        <label className="mt-4 block">
          <span className="text-sm font-medium text-ink-700">Taille de votre équipe terrain</span>
          <select
            name="size"
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-ring"
            defaultValue={sizes[1]}
          >
            {sizes.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="mt-4 block">
        <span className="text-sm font-medium text-ink-700">
          {variant === "demo" ? "Décrivez vos opérations" : "Votre message"}
        </span>
        <textarea
          name="message"
          rows={5}
          required
          placeholder={
            variant === "demo"
              ? "Ex : 12 livreurs à Dakar, livraisons à domicile, paiement à la livraison en espèces."
              : "Comment pouvons-nous vous aider ?"
          }
          className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-ring"
        />
      </label>

      <button type="submit" className="btn-primary mt-6 w-full">
        {variant === "demo" ? "Demander ma démo" : "Envoyer le message"}
        <ArrowRight className="h-4 w-4" />
      </button>

      <p className="mt-4 text-center text-xs leading-relaxed text-ink-500">
        En envoyant ce formulaire, vous acceptez que Jotoliko vous contacte au sujet de votre
        demande. Vos données ne sont jamais revendues.
      </p>
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink-700">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-ring"
      />
    </label>
  );
}
