"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Clock3, LoaderCircle, ShieldCheck } from "lucide-react";

const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\\/+$/, "");

type ResumeResult = {
  signupAttemptId: string;
  status: string;
  expiresAt: string;
  companyName: string;
  ownerEmail: string;
  nextStep: string;
  pricing: {
    planCode: string;
    planVersion: number;
    currency: string;
    unitPriceXof: number;
    seatCount: number;
    monthlyAmountXof: number;
  };
};

function formatXof(amount: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount) + " FCFA";
}

export default function ResumeSignupPage() {
  const [attemptId, setAttemptId] = useState("");
  const [resumeToken, setResumeToken] = useState("");
  const [result, setResult] = useState<ResumeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [error, setError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");

  async function resume(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCheckoutError("");
    setResult(null);
    if (!apiBase) {
      setError("Le service d'inscription n'est pas encore relié à l'API. Réessayez plus tard.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${apiBase}/auth/signup/${encodeURIComponent(attemptId.trim())}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ resumeToken: resumeToken.trim() }),
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = Array.isArray(data?.message) ? data.message.join(" ") : data?.message;
        throw new Error(typeof message === "string" ? message : "Impossible de retrouver cette inscription.");
      }
      setResult(data as ResumeResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function continuePayment() {
    if (!result || !apiBase) return;
    setCheckoutBusy(true);
    setCheckoutError("");
    try {
      const response = await fetch(`${apiBase}/billing/signup/${encodeURIComponent(result.signupAttemptId)}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ resumeToken: resumeToken.trim() }),
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({})) as { checkoutUrl?: string; message?: string | string[] };
      if (!response.ok || typeof data.checkoutUrl !== "string") {
        const message = Array.isArray(data.message) ? data.message.join(" ") : data.message;
        throw new Error(message || "Le paiement n'est pas disponible. Votre demande reste enregistrée.");
      }
      const url = new URL(data.checkoutUrl);
      if (url.protocol !== "https:" || url.hostname !== "app.paydunya.com") {
        throw new Error("L'adresse de paiement reçue n'est pas reconnue. Aucun paiement n'a été ouvert.");
      }
      window.location.assign(url.toString());
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : "Erreur réseau. Réessayez.");
    } finally {
      setCheckoutBusy(false);
    }
  }

  return (
    <main className="shell py-12 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <Link href="/inscription/" className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 transition hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Nouvelle inscription
        </Link>
        <div className="mt-8">
          <span className="eyebrow"><ShieldCheck className="h-3.5 w-3.5" /> Espace professionnel</span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Reprendre une inscription</h1>
          <p className="mt-4 leading-relaxed text-ink-500">
            Saisissez la référence et le jeton secret affichés lors de votre inscription. L'identifiant seul ne permet pas d'accéder aux informations.
          </p>
        </div>

        {!result ? (
          <form onSubmit={resume} className="card mt-8 space-y-5 p-6 sm:p-8">
            <label className="block">
              <span className="text-sm font-medium text-ink-700">Référence de l'inscription</span>
              <input value={attemptId} onChange={(event) => setAttemptId(event.target.value)} required maxLength={128} autoComplete="off" spellCheck={false} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-ring" placeholder="Identifiant de la demande" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink-700">Jeton secret de reprise</span>
              <textarea value={resumeToken} onChange={(event) => setResumeToken(event.target.value.trim())} required minLength={64} maxLength={128} rows={3} autoComplete="off" spellCheck={false} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs outline-none focus:border-brand focus:ring-2 focus:ring-brand-ring" placeholder="Collez ici le jeton secret de 64 caractères" />
            </label>
            {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
            <button type="submit" disabled={busy || !apiBase} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {busy ? "Recherche de l'inscription…" : "Retrouver mon inscription"}
            </button>
            <p className="text-xs leading-relaxed text-ink-500">Ne partagez jamais ce jeton. Il protège l'accès à votre demande, mais ne remplace pas vos futurs identifiants de connexion.</p>
          </form>
        ) : (
          <section className="card mt-8 p-6 sm:p-8">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-ink"><Clock3 className="h-6 w-6" /></span>
            <h2 className="mt-5 text-xl font-semibold">Inscription retrouvée</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">Vérifiez les informations ci-dessous avant de reprendre le paiement.</p>
            <dl className="mt-6 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-ink-500">Entreprise</dt><dd className="text-right font-medium">{result.companyName}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-500">E-mail</dt><dd className="text-right font-medium">{result.ownerEmail}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-500">Offre</dt><dd className="font-medium">{result.pricing.planCode} · {result.pricing.seatCount} place(s)</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-500">Montant mensuel</dt><dd className="font-semibold">{formatXof(result.pricing.monthlyAmountXof)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-500">État</dt><dd className="font-medium">{result.status}</dd></div>
            </dl>
            {result.status === "PENDING_PAYMENT" ? (
              <>
                {checkoutError ? <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{checkoutError}</p> : null}
                <button type="button" onClick={() => void continuePayment()} disabled={checkoutBusy || !apiBase} className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50">
                  {checkoutBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {checkoutBusy ? "Préparation du paiement…" : "Reprendre le paiement sécurisé"}
                </button>
              </>
            ) : result.status === "ACTIVE" ? (
              <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">Cette inscription est déjà activée. Aucun nouveau paiement ne sera lancé depuis cette page.</p>
            ) : (
              <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Cette inscription ne peut plus être payée depuis cette page. Créez une nouvelle inscription ou contactez le support si un paiement a déjà été débité.</p>
            )}
            <button type="button" onClick={() => { setResult(null); setError(""); setCheckoutError(""); }} className="btn-ghost mt-3 w-full">Rechercher une autre inscription</button>
          </section>
        )}
      </div>
    </main>
  );
}
