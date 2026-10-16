"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, Copy, LoaderCircle, ShieldCheck, XCircle } from "lucide-react";

const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

type PaymentState = "checking" | "active" | "pending" | "failed" | "unavailable";

export default function SignupReturnPage() {
  const [state, setState] = useState<PaymentState>("checking");
  const [companySlug, setCompanySlug] = useState("");
  const [message, setMessage] = useState("Vérification du paiement auprès du serveur sécurisé…");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function verify() {
      const token = new URLSearchParams(window.location.search).get("token");
      if (!apiBase || !token) {
        setState("unavailable");
        setMessage(!apiBase
          ? "L'API n'est pas configurée sur ce site. Le callback serveur reste la source de confirmation."
          : "Le jeton de facture est absent. Vérifiez l'état du paiement un peu plus tard.");
        return;
      }

      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          const response = await fetch(`${apiBase}/billing/paydunya/return`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ token }),
            cache: "no-store",
          });
          const data = await response.json().catch(() => ({})) as {
            status?: string; companySlug?: string; message?: string;
          };
          if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "La confirmation n'est pas encore disponible.");
          if (cancelled) return;
          if (data.status === "ACTIVE") {
            setCompanySlug(data.companySlug ?? "");
            setState("active");
            setMessage("Le paiement a été confirmé par PayDunya et l'espace professionnel est activé.");
            try {
              sessionStorage.removeItem("jotoliko_signup_attempt_id");
              sessionStorage.removeItem("jotoliko_signup_resume_token");
            } catch {}
            return;
          }
          if (data.status === "PAYMENT_NOT_COMPLETED") {
            setState("failed");
            setMessage("PayDunya n'a pas confirmé un paiement réussi. Aucun espace n'a été activé.");
            return;
          }
          setMessage("Paiement en cours de confirmation. Le serveur vérifie l'état directement auprès de PayDunya…");
        } catch (error) {
          if (cancelled) return;
          if (attempt === 5) {
            setState("pending");
            setMessage(error instanceof Error ? error.message : "La vérification est temporairement indisponible.");
            return;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (!cancelled) {
        setState("pending");
        setMessage("Le paiement n'est pas encore confirmé. Ne repayez pas immédiatement : le serveur peut encore recevoir la notification PayDunya. Actualisez cette page dans quelques instants.");
      }
    }
    void verify();
    return () => { cancelled = true; };
  }, []);

  async function copySlug() {
    if (!companySlug) return;
    try {
      await navigator.clipboard.writeText(companySlug);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="shell min-h-[70vh] py-16">
      <div className="card mx-auto max-w-xl p-6 sm:p-9">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-ink">
          {state === "active" ? <CheckCircle2 className="h-6 w-6" /> : state === "failed" ? <XCircle className="h-6 w-6" /> : state === "checking" ? <LoaderCircle className="h-6 w-6 animate-spin" /> : state === "pending" ? <Clock3 className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">
          {state === "active" ? "Votre compte professionnel est activé" : state === "failed" ? "Paiement non confirmé" : "Confirmation du paiement"}
        </h1>
        <p role="status" className="mt-3 text-sm leading-relaxed text-ink-500">{message}</p>
        {companySlug ? (
          <div className="mt-6 rounded-xl bg-slate-50 p-4">
            <p className="text-sm font-medium">Identifiant de l'entreprise</p>
            <code className="mt-2 block break-all text-sm">{companySlug}</code>
            <button type="button" onClick={() => void copySlug()} className="btn-ghost mt-3 w-full">
              <Copy className="h-4 w-4" /> {copied ? "Identifiant copié" : "Copier l'identifiant"}
            </button>
          </div>
        ) : null}
        <p className="mt-5 text-xs leading-relaxed text-ink-500">
          Le retour du navigateur n'est jamais considéré comme une preuve de paiement. Seule la confirmation serveur de PayDunya autorise l'activation.
        </p>
        <Link href="/" className="btn-primary mt-6 w-full">Retour à l'accueil</Link>
      </div>
    </main>
  );
}
