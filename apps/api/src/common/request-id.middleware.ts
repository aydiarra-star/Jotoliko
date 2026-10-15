import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare module "express" {
  interface Request {
    requestId?: string;
  }
}

/**
 * Attribue un identifiant de corrélation à chaque requête.
 *
 * Cet identifiant est repris dans les journaux d'audit (colonne `requestId`) :
 * sans lui, impossible de relier une mutation observée en base à la requête HTTP
 * qui l'a produite.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-request-id"];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  // On n'accepte un identifiant fourni par le client que s'il est sobre.
  const id = typeof candidate === "string" && /^[\w.:-]{8,128}$/.test(candidate) ? candidate : randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}
