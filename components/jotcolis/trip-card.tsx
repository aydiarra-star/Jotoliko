"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, Calendar, Weight, MessageCircle, CheckCircle2 } from "lucide-react";
import type { Trip } from "@/lib/jotcolis-data";

export function TripCard({ trip }: { trip: Trip }) {
  const [confirmedLegal, setConfirmedLegal] = useState(false);
  const [contacted, setContacted] = useState(false);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-700">
            {trip.gpInitials}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-base font-semibold text-slate-900">
                {trip.gpName}
              </h3>
              {trip.verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  GP vérifié
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-slate-700">
              {trip.from} → {trip.to}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-lg font-bold text-orange-600">
            {trip.pricePerKg} {trip.currency}
            <span className="text-xs font-normal text-slate-500">/kg</span>
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1">
          <Calendar className="h-3.5 w-3.5 text-orange-500" />
          Départ : {trip.dateLabel}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1">
          <Weight className="h-3.5 w-3.5 text-orange-500" />
          {trip.availableKg} kg disponibles
        </span>
      </div>

      {trip.note && (
        <p className="mt-2.5 text-xs leading-relaxed text-slate-600">
          {trip.note}
        </p>
      )}

      <div className="mt-4 rounded-xl bg-orange-50/70 p-3">
        <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-snug text-slate-700">
          <input
            type="checkbox"
            checked={confirmedLegal}
            onChange={(e) => setConfirmedLegal(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
          />
          <span>
            Je confirme que mon colis ne contient aucun objet interdit ou illégal.{" "}
            <Link
              href="/objets-interdits"
              className="font-medium text-orange-700 underline underline-offset-2"
            >
              Voir la liste des objets interdits
            </Link>
          </span>
        </label>
      </div>

      <div className="mt-3">
        {contacted ? (
          <div className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Demande envoyée à {trip.gpName}. Il vous répondra rapidement.
          </div>
        ) : (
          <button
            type="button"
            disabled={!confirmedLegal}
            onClick={() => setContacted(true)}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            <MessageCircle className="h-4 w-4" />
            Contacter le GP
          </button>
        )}
      </div>

      <p className="mt-3 border-t border-slate-100 pt-2.5 text-[11px] leading-relaxed text-slate-500">
        JotColis met en relation clients et GP. Le GP vérifie le contenu du colis
        et en est responsable pendant le transport.
      </p>
    </article>
  );
}
