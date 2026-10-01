"use client";

import { useEffect, useState } from "react";

/**
 * Lit un paramètre de l'URL (`?id=…`).
 *
 * L'application est exportée en statique : les identifiants créés pendant la
 * session ne peuvent pas être pré-rendus en tant que segments d'URL. Ils
 * passent donc par la chaîne de requête, que le serveur ne peut pas connaître
 * non plus — d'où la lecture après montage, qui évite tout écart d'hydratation.
 */
export function useParametreId(): { id: string | null; pret: boolean } {
  const [id, setId] = useState<string | null>(null);
  const [pret, setPret] = useState(false);

  useEffect(() => {
    const lire = () => {
      const valeur = new URLSearchParams(window.location.search).get("id");
      setId(valeur);
      setPret(true);
    };
    lire();
    // La navigation interne réutilise le même composant : on écoute les
    // changements d'historique pour que le contenu suive l'URL.
    window.addEventListener("popstate", lire);
    return () => window.removeEventListener("popstate", lire);
  }, []);

  return { id, pret };
}

/** Construit un lien de détail vers une entité identifiée par son id. */
export function lienDetail(base: string, id: string): string {
  return `${base}?id=${encodeURIComponent(id)}`;
}
