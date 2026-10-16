"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, ArrowRight, LogOut, RefreshCw, ShieldCheck } from "lucide-react";

type User = { id: string; name: string; email: string; role: string; companyId: string };
type Money = { expected: number; collected: number; remitted: number; difference: number };
type Mission = {
  id: string;
  reference: string;
  clientName: string;
  phone: string | null;
  status: string;
  assignedUserId: string | null;
  proofId: string | null;
  proofRequired: boolean;
  money: Money;
  gps: { truth: string; at: string | null; latitude: number | null; longitude: number | null };
  updatedAt: string;
};
type LoginResult = { accessToken: string; user: User };
type MissionList = { items: Mission[]; nextCursor: string | null };

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").trim().replace(/\/$/, "");
const TOKEN_KEY = "jotoliko.session.token";
const USER_KEY = "jotoliko.session.user";

const statusLabels: Record<string, string> = {
  A_AFFECTER: "À affecter",
  AFFECTEE: "Affectée",
  EN_ROUTE: "En route",
  ARRIVE: "Arrivée",
  LIVREE: "Livrée",
  ECHEC: "Échec",
  ANNULEE: "Annulée",
  RETOUR: "Retour",
};
const gpsLabels: Record<string, string> = {
  REEL: "Position réelle récente",
  DERNIERE_POSITION_CONNUE: "Dernière position connue",
  INDISPONIBLE: "Position indisponible",
  INCONNU: "Aucune position reçue",
};

function money(value: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value) + " FCFA";
}

async function api<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (response.status === 401) throw new Error("SESSION_EXPIREE");
  if (!response.ok) {
    if (response.status >= 500) throw new Error("Le serveur rencontre un problème. Réessaie dans un instant.");
    if (response.status === 403) throw new Error("Ton compte n’a pas accès à ces missions.");
    if (response.status === 429) throw new Error("Trop de tentatives. Attends une minute avant de réessayer.");
    throw new Error("Connexion refusée. Vérifie les informations et la configuration du service.");
  }
  return (await response.json()) as T;
}

export function LiveConsole() {
  const [companyId, setCompanyId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState("");
  const [missions, setMissions] = useState<Mission[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const logout = useCallback((message = "") => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(TOKEN_KEY);
      window.sessionStorage.removeItem(USER_KEY);
    }
    setToken("");
    setUser(null);
    setMissions([]);
    setError(message);
    setNotice("");
    setPassword("");
    setLoaded(false);
  }, []);

  const loadMissions = useCallback(async (accessToken: string) => {
    setBusy(true);
    setError("");
    try {
      const result = await api<MissionList>("/missions?take=50", accessToken);
      setMissions(Array.isArray(result.items) ? result.items : []);
      setLoaded(true);
      setNotice("Données chargées depuis l’API sécurisée. Les missions affichées appartiennent au périmètre autorisé par le serveur.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      if (message === "SESSION_EXPIREE") {
        logout("La session a expiré. Connecte-toi à nouveau.");
      } else {
        setError(message || "Impossible de charger les missions.");
      }
    } finally {
      setBusy(false);
    }
  }, [logout]);

  useEffect(() => {
    if (!API_URL || typeof window === "undefined") return;
    const savedToken = window.sessionStorage.getItem(TOKEN_KEY);
    const savedUser = window.sessionStorage.getItem(USER_KEY);
    if (!savedToken || !savedUser) return;
    try {
      const parsed = JSON.parse(savedUser) as User;
      setToken(savedToken);
      setUser(parsed);
      void loadMissions(savedToken);
    } catch {
      logout("Session locale invalide. Reconnecte-toi.");
    }
  }, [loadMissions, logout]);

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!API_URL) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<LoginResult>("/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify({ companyId: companyId.trim(), email: email.trim(), password }),
      });
      window.sessionStorage.setItem(TOKEN_KEY, result.accessToken);
      window.sessionStorage.setItem(USER_KEY, JSON.stringify(result.user));
      setToken(result.accessToken);
      setUser(result.user);
      setPassword("");
      await loadMissions(result.accessToken);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(message === "SESSION_EXPIREE" ? "Identifiants invalides." : message || "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return missions;
    return missions.filter((mission) =>
      [mission.reference, mission.clientName, mission.status].some((value) => value.toLowerCase().includes(q))
    );
  }, [missions, search]);

  return (
    <div className="space-y-6">
      {!API_URL ? (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div>
              <h2 className="font-semibold">API non configurée</h2>
              <p className="mt-1 text-sm leading-relaxed">
                Aucun appel réseau n’est effectué. Pour activer cet espace, définir NEXT_PUBLIC_API_URL lors de la construction du site,
                par exemple avec l’adresse HTTPS du serveur d’API. Le serveur doit autoriser l’origine exacte du site dans CORS_ORIGIN.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></div>
        </div>
      ) : null}

      {notice && user ? (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</div>
      ) : null}

      {!user ? (
        <form onSubmit={submitLogin} className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6 flex items-start gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><ShieldCheck className="h-5 w-5" /></span>
            <div>
              <h2 className="text-lg font-semibold">Connexion à l’espace opérations</h2>
              <p className="mt-1 text-sm text-slate-600">Accès protégé par l’API. Les droits et le périmètre entreprise sont vérifiés côté serveur.</p>
            </div>
          </div>
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">Identifiant entreprise
              <input required maxLength={64} autoComplete="organization" value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
            </label>
            <label className="block text-sm font-medium text-slate-700">Adresse e-mail
              <input required type="email" autoComplete="username" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
            </label>
            <label className="block text-sm font-medium text-slate-700">Mot de passe
              <input required type="password" autoComplete="current-password" minLength={8} maxLength={200} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
            </label>
            <button disabled={!API_URL || busy} type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? "Connexion…" : "Se connecter"} <ArrowRight className="h-4 w-4" />
            </button>
            <p className="text-xs leading-relaxed text-slate-500">Aucun compte de démonstration n’est créé ici. Utilise uniquement les identifiants d’une entreprise déjà configurée dans l’API.</p>
          </div>
        </form>
      ) : (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Session authentifiée</p>
              <h2 className="mt-1 font-semibold">{user.name}</h2>
              <p className="text-sm text-slate-600">{user.email} · {user.role} · Entreprise {user.companyId}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => void loadMissions(token)} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Actualiser
              </button>
              <button onClick={() => logout()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold">
                <LogOut className="h-4 w-4" /> Déconnexion
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">Missions chargées</p><p className="mt-1 text-2xl font-semibold">{missions.length}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">En cours</p><p className="mt-1 text-2xl font-semibold">{missions.filter((m) => m.status === "EN_ROUTE").length}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">À encaisser (attendu)</p><p className="mt-1 text-xl font-semibold">{money(missions.reduce((sum, m) => sum + m.money.expected, 0))}</p></div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-semibold">Missions de l’entreprise</h2><p className="mt-1 text-sm text-slate-500">Données serveur réelles · au maximum 50 dernières missions · lecture seule.</p></div>
              <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2"><span className="sr-only">Rechercher</span><Activity className="h-4 w-4 text-slate-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Référence, client, statut" className="w-48 max-w-full bg-transparent text-sm outline-none" /></label>
            </div>
            {busy && !loaded ? <p className="py-8 text-center text-sm text-slate-500">Chargement des données sécurisées…</p> : null}
            {!busy && filtered.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">{missions.length ? "Aucun résultat pour cette recherche." : "Aucune mission dans le périmètre de ce compte."}</p> : null}
            {filtered.length > 0 ? (
              <div className="mt-4 space-y-3">
                {filtered.map((mission) => (
                  <article key={mission.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><p className="font-semibold">#{mission.reference} · {mission.clientName}</p><p className="mt-1 text-sm text-slate-500">{mission.phone || "Téléphone non renseigné"} · Mise à jour {new Date(mission.updatedAt).toLocaleString("fr-FR")}</p></div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{statusLabels[mission.status] ?? mission.status}</span>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                      <p><span className="text-slate-500">Attendu :</span> {money(mission.money.expected)}</p>
                      <p><span className="text-slate-500">Encaissé :</span> {money(mission.money.collected)}</p>
                      <p><span className="text-slate-500">Remis :</span> {money(mission.money.remitted)}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                      <span>{gpsLabels[mission.gps.truth] ?? "État GPS non communiqué"}</span>
                      <span>·</span>
                      <span>{mission.proofId ? "Preuve enregistrée" : mission.proofRequired ? "Preuve requise, non reçue" : "Preuve non requise"}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}
