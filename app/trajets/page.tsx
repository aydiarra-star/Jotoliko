"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Calendar, Plane, PlusCircle, CheckCircle2 } from "lucide-react";
import { BottomNav } from "@/components/jotcolis/bottom-nav";
import { TripCard } from "@/components/jotcolis/trip-card";
import { EmptyTripsAlert } from "@/components/jotcolis/empty-trips-alert";
import { DEMO_TRIPS, type Trip } from "@/lib/jotcolis-data";

function TrajetsContent() {
  const searchParams = useSearchParams();
  const initialFrom = searchParams.get("from") ?? "";
  const initialTo = searchParams.get("to") ?? "";
  const initialDate = searchParams.get("date") ?? "";
  const initialPublish = searchParams.get("publier") === "1";

  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [date, setDate] = useState(initialDate);
  const [showPublish, setShowPublish] = useState(initialPublish);
  const [trips, setTrips] = useState<Trip[]>(DEMO_TRIPS);

  // Publish form state
  const [gpName, setGpName] = useState("");
  const [pubFrom, setPubFrom] = useState("Paris");
  const [pubTo, setPubTo] = useState("Dakar");
  const [pubDate, setPubDate] = useState("");
  const [pubPrice, setPubPrice] = useState("10");
  const [pubKg, setPubKg] = useState("10");
  const [published, setPublished] = useState(false);

  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      const matchFrom =
        !from.trim() ||
        t.from.toLowerCase().includes(from.trim().toLowerCase());
      const matchTo =
        !to.trim() || t.to.toLowerCase().includes(to.trim().toLowerCase());
      const matchDate =
        !date.trim() ||
        t.dateLabel.includes(date.trim()) ||
        t.date.includes(date.trim());
      return matchFrom && matchTo && matchDate;
    });
  }, [trips, from, to, date]);

  const handlePublish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gpName.trim() || !pubDate.trim()) return;
    const initials = gpName
      .trim()
      .split(/\s+/)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2);

    const newTrip: Trip = {
      id: `gp-${Date.now()}`,
      gpName: gpName.trim(),
      gpInitials: initials || "GP",
      verified: true,
      from: pubFrom.trim() || "Paris",
      to: pubTo.trim() || "Dakar",
      date: pubDate.trim(),
      dateLabel: pubDate.trim(),
      pricePerKg: Number(pubPrice) || 10,
      currency: "€",
      availableKg: Number(pubKg) || 10,
      note: "Trajet publié à l'instant. Contactez le GP pour convenir de la remise.",
    };

    setTrips((prev) => [newTrip, ...prev]);
    setPublished(true);
    setShowPublish(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-slate-900">Trajets GP</h1>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
            Données de démonstration
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 pt-4">
        {/* Publish toggle */}
        <button
          type="button"
          onClick={() => {
            setShowPublish((v) => !v);
            setPublished(false);
          }}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-100"
        >
          <PlusCircle className="h-4 w-4" />
          {showPublish ? "Fermer le formulaire" : "Je voyage, je publie mon trajet"}
        </button>

        {published && (
          <div className="flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Votre trajet est maintenant visible par les clients.
          </div>
        )}

        {showPublish && (
          <form
            onSubmit={handlePublish}
            className="space-y-3 rounded-2xl border border-orange-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Plane className="h-4 w-4 text-orange-500" />
              Publier un trajet GP
            </div>
            <input
              type="text"
              required
              value={gpName}
              onChange={(e) => setGpName(e.target.value)}
              placeholder="Votre prénom et initiale (ex : Moussa K.)"
              className="box-border min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="text"
                value={pubFrom}
                onChange={(e) => setPubFrom(e.target.value)}
                placeholder="Départ"
                className="box-border min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
              />
              <input
                type="text"
                value={pubTo}
                onChange={(e) => setPubTo(e.target.value)}
                placeholder="Arrivée"
                className="box-border min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
              />
            </div>
            <div className="relative w-full">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                required
                inputMode="numeric"
                value={pubDate}
                onChange={(e) => setPubDate(e.target.value)}
                placeholder="jj/mm/aaaa"
                className="box-border min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="number"
                min="1"
                value={pubPrice}
                onChange={(e) => setPubPrice(e.target.value)}
                placeholder="Prix €/kg"
                className="box-border min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
              />
              <input
                type="number"
                min="1"
                value={pubKg}
                onChange={(e) => setPubKg(e.target.value)}
                placeholder="Kilos dispos"
                className="box-border min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
            >
              Publier mon trajet
            </button>
          </form>
        )}

        {/* Filter bar */}
        <section className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-2.5">
            <input
              type="text"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="Départ (ex : Paris)"
              aria-label="Ville de départ"
              className="box-border min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
            />
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="Arrivée (ex : Dakar)"
              aria-label="Ville d'arrivée"
              className="box-border min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
            />
          </div>
          <div className="relative w-full">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              inputMode="numeric"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              placeholder="jj/mm/aaaa"
              aria-label="Date souhaitée"
              className="box-border min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
            />
          </div>
        </section>

        {/* Results */}
        <section className="space-y-3">
          {filteredTrips.length > 0 ? (
            filteredTrips.map((trip) => <TripCard key={trip.id} trip={trip} />)
          ) : (
            <EmptyTripsAlert
              from={from.trim() || "Paris"}
              to={to.trim() || "Dakar"}
            />
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}

export default function TrajetsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 p-4 text-center text-sm text-slate-500">
          Chargement des trajets…
        </div>
      }
    >
      <TrajetsContent />
    </Suspense>
  );
}
