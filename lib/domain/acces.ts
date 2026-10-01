// Isolation multi-entreprises et permissions.
//
// Règle centrale : une entreprise ne voit jamais les données d'une autre, et un
// livreur ne voit que ses propres livraisons. Ces règles sont appliquées ici,
// dans le domaine, et non seulement dans l'interface : l'interface peut être
// contournée, le domaine non.

import type { Role, Utilisateur } from "./types";
import { echec, ok, type Resultat } from "./types";

/** Ce qu'un rôle a le droit de faire. */
const PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: [
    "VOIR_TOUT", "GERER_COMMANDES", "GERER_CLIENTS", "GERER_LIVREURS",
    "AFFECTER", "SUIVRE", "ENCAISSER", "REMISER", "VOIR_RAPPORTS", "GERER_EQUIPE",
  ],
  MANAGER: [
    "VOIR_TOUT", "GERER_COMMANDES", "GERER_CLIENTS", "GERER_LIVREURS",
    "AFFECTER", "SUIVRE", "ENCAISSER", "REMISER", "VOIR_RAPPORTS",
  ],
  DISPATCHER: [
    "VOIR_TOUT", "GERER_COMMANDES", "AFFECTER", "SUIVRE",
  ],
  DRIVER: [
    "VOIR_SES_LIVRAISONS", "DEMARRER", "ARRIVER", "TERMINER", "ENCAISSER",
  ],
};

export type Permission =
  | "VOIR_TOUT"
  | "GERER_COMMANDES"
  | "GERER_CLIENTS"
  | "GERER_LIVREURS"
  | "AFFECTER"
  | "SUIVRE"
  | "ENCAISSER"
  | "REMISER"
  | "VOIR_RAPPORTS"
  | "GERER_EQUIPE"
  | "VOIR_SES_LIVRAISONS"
  | "DEMARRER"
  | "ARRIVER"
  | "TERMINER";

export function aLaPermission(u: Utilisateur, p: Permission): boolean {
  if (!u.actif) return false;
  return PERMISSIONS[u.role].includes(p);
}

export function permissionsDe(role: Role): Permission[] {
  return PERMISSIONS[role];
}

// ---------------------------------------------------------------------------
// Contrôle d'accès aux données
// ---------------------------------------------------------------------------

/**
 * Vérifie qu'un utilisateur peut accéder à une donnée appartenant à une
 * entreprise. C'est le point unique de contrôle du multi-tenant.
 */
export function verifierAccesEntreprise(
  u: Utilisateur,
  companyId: string,
): Resultat<true> {
  if (!u.actif) return echec("Compte désactivé.");
  if (u.companyId !== companyId) {
    return echec("Accès refusé : cette donnée appartient à une autre entreprise.");
  }
  return ok(true);
}

/**
 * Vérifie qu'un utilisateur peut accéder à une livraison donnée.
 * Un livreur est en plus restreint à ses propres livraisons.
 */
export function verifierAccesLivraison(
  u: Utilisateur,
  livraison: { companyId: string; livreurId?: string },
): Resultat<true> {
  const entreprise = verifierAccesEntreprise(u, livraison.companyId);
  if (!entreprise.ok) return entreprise;

  if (u.role === "DRIVER") {
    if (!u.driverId || livraison.livreurId !== u.driverId) {
      return echec("Accès refusé : cette livraison est confiée à un autre livreur.");
    }
  }
  return ok(true);
}

/** Filtre une collection sur le périmètre autorisé de l'utilisateur. */
export function filtrerPerimetre<T extends { companyId: string; livreurId?: string }>(
  u: Utilisateur,
  elements: T[],
): T[] {
  return elements.filter((e) => verifierAccesLivraison(u, e).ok);
}

/** Un livreur ne peut agir que sur une livraison qui lui est affectée et ouverte. */
export function verifierActionLivreur(
  u: Utilisateur,
  livraison: { companyId: string; livreurId?: string },
  permission: Permission,
): Resultat<true> {
  const acces = verifierAccesLivraison(u, livraison);
  if (!acces.ok) return acces;
  if (!aLaPermission(u, permission)) {
    return echec(`Action non autorisée pour le rôle « ${u.role} ».`);
  }
  return ok(true);
}

// ---------------------------------------------------------------------------
// Portées de requête (à réutiliser côté API)
// ---------------------------------------------------------------------------

/**
 * Clause de filtrage à appliquer à toute requête sur une entité métier.
 * Toute lecture en base doit passer par ici : c'est ce qui garantit qu'aucune
 * requête oubliée ne peut franchir la frontière entre entreprises.
 */
export function porteeRequete(u: Utilisateur): {
  companyId: string;
  driverId?: string;
} {
  if (u.role === "DRIVER") {
    if (!u.driverId) {
      // Un livreur sans identifiant de livreur ne doit rien voir du tout.
      return { companyId: u.companyId, driverId: "__aucun__" };
    }
    return { companyId: u.companyId, driverId: u.driverId };
  }
  return { companyId: u.companyId };
}
