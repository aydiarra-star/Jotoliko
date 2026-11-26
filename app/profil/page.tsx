"use client";

import { useState } from "react";
import { User, CheckCircle2 } from "lucide-react";
import { BottomNav } from "@/components/jotcolis/bottom-nav";

export default function ProfilPage() {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact.trim()) return;
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-slate-900">Profil</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pt-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-100 text-orange-600">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {mode === "signup"
                  ? "Créez votre compte JotColis"
                  : "Se connecter à JotColis"}
              </h2>
              <p className="text-xs text-slate-500">
                Pour contacter un GP ou publier vos trajets.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setSubmitted(false);
              }}
              className={`min-h-[44px] rounded-lg text-xs font-semibold transition-colors ${
                mode === "signup"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600"
              }`}
            >
              Créer un compte
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setSubmitted(false);
              }}
              className={`min-h-[44px] rounded-lg text-xs font-semibold transition-colors ${
                mode === "login"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600"
              }`}
            >
              Se connecter
            </button>
          </div>

          {submitted ? (
            <div className="mt-4 flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {mode === "signup"
                ? "Compte créé. Vous pouvez maintenant contacter un GP."
                : "Connexion réussie."}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              {mode === "signup" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Prénom et nom
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex : Fatou Diop"
                    className="box-border min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  E-mail ou téléphone
                </label>
                <input
                  type="text"
                  required
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Ex : fatou@exemple.fr ou +33 6..."
                  className="box-border min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
              >
                {mode === "signup" ? "Créer mon compte" : "Se connecter"}
              </button>
            </form>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
