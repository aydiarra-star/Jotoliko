"use client";

import { useState } from "react";
import { Bell, CheckCircle2 } from "lucide-react";

export function EmptyTripsAlert({
  from = "Paris",
  to = "Dakar",
}: {
  from?: string;
  to?: string;
}) {
  const [contact, setContact] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact.trim()) return;
    setSaved(true);
  };

  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50/70 p-5 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-orange-100 text-orange-600">
        <Bell className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-medium leading-relaxed text-slate-800">
        Aucun GP pour cette date. Soyez alerté dès qu&apos;un GP publie un trajet{" "}
        {from} → {to}.
      </p>

      {saved ? (
        <div className="mt-4 flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Alerte enregistrée ! Nous vous préviendrons dès qu&apos;un trajet sera
          publié.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-2.5">
          <input
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Votre e-mail ou numéro WhatsApp"
            required
            className="box-border min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
          />
          <button
            type="submit"
            className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
          >
            Me prévenir
          </button>
        </form>
      )}
    </div>
  );
}
