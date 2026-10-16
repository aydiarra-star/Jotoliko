import { SetMetadata } from "@nestjs/common";
import type { AppRole } from "../../../../lib/jotoliko-os/core";

export const ROLES_KEY = "jotoliko:roles";

/**
 * Restreint un endpoint à certains rôles.
 *
 * Attention : ce décorateur ne remplace pas le contrôle de périmètre. Un rôle
 * autorisé ici peut toujours être refusé plus loin s'il ne possède pas la
 * ressource (voir `assertCanActOnMission`).
 */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
