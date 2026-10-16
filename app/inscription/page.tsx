"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, LoaderCircle, ShieldCheck } from "lucide-react";

type Price = {
  id: string;
  code: string;
  version: number;
  currency: string;
  unitPriceXof: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
};

type SignupResult = {
  signupAttemptId: string;
  resumeToken: string;
  status: string;
  expiresAt: string;
  pricing: {
    planCode: string;
    planVersion: number;
    currency: string;
    unitPriceXof: number;
    seatCount: number;
    monthlyAmountXof: number;
  };
  nextStep: string;
  message: string;
};

type CheckoutResult = { checkoutUrl: string; status: string; amountXof: number; currency: string; provider: string; message: string };

const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

function formatXof(amount: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount) + " FCFA";
}

export default function SignupPage() {
  const [prices, setPrices] = useState<Price[]>([]);
  const [pricesLoading, setPricesLoading] = useState(true);
  const [priceError, setPriceError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SignupResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [seatCount, setSeatCount] = useState(1);
  const [planCode, setPlanCode] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadPrices() {
      if (!apiBase) {
        setPriceError("Le service de création de compte n'est pas encore relié à l'API. Aucun tarif ni paiement n'est simulé.");
        setPricesLoading(false);
        return;
      }
      try {
        const response = await fetch(`${apiBase}/billing/pricing`, { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("Les tarifs ne sont pas accessibles pour le moment.");
        const data = await response.json() as { configured?: boolean; prices?: Price[] };
        const latest = new Map<string, Price>();
        for (const price of data.prices ?? []) {
          const current = latest.get(price.code);
          if (!current || price.version > current.version) latest.set(price.code, price);
        }
        const available = [...latest.values()].filter((price) => price.currency === "XOF");
        if (!cancelled) {
          setPrices(available);
          setPlanCode(available[0]?.code ?? "");
          if (!data.configured || available.length === 0) {
            setPriceError("Les tarifs doivent être configurés côté serveur avant toute inscription payante.");
          }
        }
      } catch {
        if (!cancelled) setPriceError("Impossible de charger les tarifs depuis le serveur. Réessayez plus tard.");
      } finally {
        if (!cancelled) setPricesLoading(false);
      }
    }
    void loadPrices();
    return () => { cancelled = true; };
  }, []);

  const selectedPrice = useMemo(
    () => prices.find((price) => price.code === planCode),
    [prices, planCode],
  );
  const estimatedTotal = selectedPrice ? selectedPrice.unitPriceXof * seatCount : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    if (!apiBase || !selectedPrice) {
      setError("Le service d'inscription ou le tarif n'est pas configuré. Aucun compte n'a été créé.");
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      companyName: String(form.get("companyName") ?? "").trim(),
      ownerFirstName: String(form.get("ownerFirstName") ?? "").trim(),
      ownerLastName: String(form.get("ownerLastName") ?? "").trim(),
      ownerEmail: String(form.get("ownerEmail") ?? "").trim(),
      password: String(form.get("password") ?? ""),
      planCode,
      seatCount,
    };
    setSubmitting(true);
    try {
      const response = await fetch(`${apiBase}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof data?.message === "string" ? data.message : "L'inscription n'a pas pu être enregistrée.";
        throw new Error(Array.isArray(data?.message) ? data.message.join(" ") : message);
      }
      setResult(data as SignupResult);
      formElement.reset();
      setSeatCount(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  async function startCheckout() {
    if (!result || !apiBase) return;
    setCheckoutBusy(true);
    setCheckoutError("");
    try {
      const response = await fetch(`${apiBase}/billing/signup/${encodeURIComponent(result.signupAttemptId)}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ resumeToken: result.resumeToken }),
      });
      const data = await response.json().catch(() => ({})) as Partial<CheckoutResult> & { message?: string | string[] };
      if (!response.ok || typeof data.checkoutUrl !== "string") {
        const message = Array.isArray(data.message) ? data.message.join(" ") : data.message;
        throw new Error(message || "Le paiement n'est pas disponible pour le moment. Votre demande reste enregistrée.");
      }
      const url = new URL(data.checkoutUrl);
      if (url.protocol !== "https:" || url.hostname !== "app.paydunya.com") {
        throw new Error("L'adresse de paiement reçue n'est pas reconnue. Aucun paiement n'a été ouvert.");
      }
      try {
        sessionStorage.setItem("jotoliko_signup_attempt_id", result.signupAttemptId);
        sessionStorage.setItem("jotoliko_signup_resume_token", result.resumeToken);
      } catch {
        // The server callback remains authoritative even if browser storage is disabled.
      }
      window.location.assign(url.toString());
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : "Erreur réseau. Réessayez.");
    } finally {
      setCheckoutBusy(false);
    }
  }
  async function copyResumeToken() {
    if (!result?.resumeToken) return;
    try {
      await navigator.clipboard.writeText(result.resumeToken);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="shell py-12 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <Link href="/tarifs" className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 transition hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Retour aux tarifs
        </Link>

        <div className="mt-8">
          <span className="eyebrow"><ShieldCheck className="h-3.5 w-3.5" /> Espace professionnel</span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Créez votre compte professionnel</h1>
          <p className="mt-4 leading-relaxed text-ink-500">
            Configurez votre entreprise et le nombre de livreurs. Le montant est recalculé par le serveur. Votre espace opérationnel ne sera activé qu'après confirmation vérifiée du paiement.
          </p>
          <p className="mt-3 text-sm text-ink-500">
            Vous avez déjà commencé une inscription ? <Link href="/inscription/reprendre/" className="font-semibold text-brand underline underline-offset-4">Reprendre mon inscription</Link>.
          </p>
        </div>

        {result ? (
          <div className="card mt-8 p-6 sm:p-8">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success"><CheckCircle2 className="h-6 w-6" /></span>
            <h2 className="mt-5 text-xl font-semibold">Demande professionnelle enregistrée</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">{result.message}</p>
            <dl className="mt-6 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-ink-500">Référence</dt><dd className="font-mono font-medium">{result.signupAttemptId}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-500">Places demandées</dt><dd className="font-medium">{result.pricing.seatCount}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-500">Montant mensuel indicatif</dt><dd className="font-semibold">{formatXof(result.pricing.monthlyAmountXof)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-500">Expiration de la demande</dt><dd className="font-medium">{new Date(result.expiresAt).toLocaleString("fr-FR")}</dd></div>
            </dl>
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-950">Conservez votre jeton de reprise</p>
              <p className="mt-1 text-sm text-amber-900">Il permet de reprendre cette demande. Il ne donne pas accès à l'espace opérationnel.</p>
              <code className="mt-3 block break-all rounded-lg bg-white p-3 text-xs">{result.resumeToken}</code>
              <button type="button" onClick={() => void copyResumeToken()} className="btn-ghost mt-3 w-full">
                <Copy className="h-4 w-4" /> {copied ? "Jeton copié" : "Copier le jeton"}
              </button>
            </div>
            {checkoutError ? <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{checkoutError}</p> : null}
            <button type="button" onClick={() => void startCheckout()} disabled={checkoutBusy || !apiBase} className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50">
              {checkoutBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {checkoutBusy ? "Préparation du paiement…" : "Continuer vers le paiement sécurisé"}
            </button>
            <p className="mt-3 text-sm text-ink-500">
              Si PayDunya n'est pas configuré sur le serveur, le parcours s'arrête sans débiter ni activer de compte. Le paiement mensuel ne signifie pas encore un prélèvement automatique de renouvellement.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card mt-8 space-y-5 p-6 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="companyName" label="Nom de l'entreprise" autoComplete="organization" required />
              <Field name="ownerFirstName" label="Prénom du responsable" autoComplete="given-name" required />
              <Field name="ownerLastName" label="Nom du responsable" autoComplete="family-name" required />
              <Field name="ownerEmail" label="E-mail professionnel" type="email" autoComplete="email" required />
            </div>
            <Field name="password" label="Mot de passe" type="password" autoComplete="new-password" minLength={12} required />
            <p className="-mt-3 text-xs text-ink-500">12 caractères minimum. Choisissez un mot de passe unique.</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-ink-700">Offre</span>
                <select name="planCode" value={planCode} onChange={(event) => setPlanCode(event.target.value)} disabled={pricesLoading || prices.length === 0} required className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-ring">
                  {prices.length === 0 ? <option value="">Aucune offre configurée</option> : null}
                  {prices.map((price) => <option key={price.id} value={price.code}>{price.code}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink-700">Nombre de livreurs</span>
                <input name="seatCount" type="number" min={1} max={500} step={1} value={seatCount} onChange={(event) => setSeatCount(Math.max(1, Math.min(500, Number(event.target.value) || 1)))} required className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-ring" />
              </label>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-ink-500">Tarif mensuel par place</span>
                <strong>{selectedPrice ? formatXof(selectedPrice.unitPriceXof) : "Non configuré"}</strong>
              </div>
              <div className="mt-3 flex items-center justify-between gap-4 border-t border-slate-200 pt-3">
                <span className="text-sm font-medium">Total mensuel estimé</span>
                <strong className="text-xl">{estimatedTotal === null ? "—" : formatXof(estimatedTotal)}</strong>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-500">Le serveur recalcule le total à l'inscription. Aucun prix n'est fixé par le navigateur.</p>
            </div>

            {priceError ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{priceError}</p> : null}
            {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}

            <button type="submit" disabled={submitting || pricesLoading || prices.length === 0 || !apiBase} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              {submitting ? "Enregistrement…" : "Créer mon compte professionnel"}
              {!submitting ? <ArrowRight className="h-4 w-4" /> : null}
            </button>
            <p className="text-center text-xs leading-relaxed text-ink-500">
              Créer la demande ne déclenche aucun paiement et n'active pas l'espace. Les moyens de paiement et leurs logos officiels apparaîtront dans le parcours de paiement une fois le fournisseur configuré.
            </p>
          </form>
        )}
      </div>
    </section>
  );
}

function Field({
  name, label, type = "text", autoComplete, minLength, required,
}: {
  name: string; label: string; type?: string; autoComplete?: string; minLength?: number; required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink-700">{label}</span>
      <input name={name} type={type} autoComplete={autoComplete} minLength={minLength} required={required} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-ring" />
    </label>
  );
}
