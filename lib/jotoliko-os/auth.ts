// Authentification par jeton signé — logique pure, sans NestJS ni Prisma.
//
// Isolée ici pour une raison précise : la vérification d'un jeton est une
// décision de sécurité. Elle doit être exécutable et testable sans base de
// données ni serveur HTTP, sinon elle n'est jamais réellement testée.
//
// Format : v1.<base64url(payload)>.<issuedAtMs>.<hmacSha256Hex>
// La signature couvre la version, la charge utile et l'horodatage d'émission :
// modifier l'un des trois invalide le jeton.

import { createHmac, timingSafeEqual } from "node:crypto";

export const TOKEN_VERSION = "v1";

/** Durée de vie maximale d'un jeton d'accès. */
export const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

/** Tolérance d'avance d'horloge lors de la vérification. */
export const CLOCK_SKEW_MS = 60_000;

export type TokenClaims = {
  /** Identifiant utilisateur. */
  sub: string;
  /** Entreprise de rattachement. Le jeton est lié à un seul tenant. */
  cid: string;
  role: string;
  /**
   * Version de jeton de l'utilisateur. Incrémenter cette valeur en base
   * invalide instantanément tous les jetons déjà émis (déconnexion, compromission).
   */
  tv: number;
};

export type TokenVerification =
  | { ok: true; claims: TokenClaims; issuedAtMs: number }
  | { ok: false; reason: TokenExpired | TokenRejected };

export type TokenExpired = "TOKEN_EXPIRE";
export type TokenRejected =
  | "MALFORME"
  | "SIGNATURE_INVALIDE"
  | "HORODATAGE_INVALIDE"
  | "JETON_DANS_LE_FUTUR"
  | "CHARGE_INVALIDE"
  | "VERSION_INCONNUE";

function signatureFor(secret: string, version: string, body: string, issuedAt: string): string {
  return createHmac("sha256", secret).update(`${version}.${body}.${issuedAt}`).digest("hex");
}

export function encodeToken(secret: string, claims: TokenClaims, issuedAtMs: number): string {
  const body = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const issuedAt = String(issuedAtMs);
  const signature = signatureFor(secret, TOKEN_VERSION, body, issuedAt);
  return `${TOKEN_VERSION}.${body}.${issuedAt}.${signature}`;
}

/** Compare deux chaînes hexadécimales en temps constant. */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function isClaims(value: unknown): value is TokenClaims {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.sub === "string" &&
    c.sub.length > 0 &&
    typeof c.cid === "string" &&
    c.cid.length > 0 &&
    typeof c.role === "string" &&
    c.role.length > 0 &&
    typeof c.tv === "number" &&
    Number.isInteger(c.tv) &&
    c.tv >= 0
  );
}

/**
 * Vérifie un jeton. Ne lève jamais : retourne une raison explicite, ce qui
 * permet de distinguer « expiré » (l'utilisateur se reconnecte) d'« invalide »
 * (tentative suspecte, à journaliser).
 */
export function verifyToken(
  token: unknown,
  secret: string,
  nowMs: number,
  options: { ttlMs?: number; maxTokenVersion?: number } = {}
): TokenVerification {
  if (typeof token !== "string" || token.length === 0) return { ok: false, reason: "MALFORME" };
  if (!secret) return { ok: false, reason: "SIGNATURE_INVALIDE" };

  const parts = token.split(".");
  if (parts.length !== 4) return { ok: false, reason: "MALFORME" };
  const [version, body, issued, signature] = parts as [string, string, string, string];
  if (version !== TOKEN_VERSION) return { ok: false, reason: "VERSION_INCONNUE" };

  const expected = signatureFor(secret, version, body, issued);
  if (!safeEqualHex(expected, signature)) return { ok: false, reason: "SIGNATURE_INVALIDE" };

  const issuedAtMs = Number(issued);
  if (!Number.isFinite(issuedAtMs) || !Number.isInteger(issuedAtMs)) {
    return { ok: false, reason: "HORODATAGE_INVALIDE" };
  }

  if (issuedAtMs > nowMs + CLOCK_SKEW_MS) return { ok: false, reason: "JETON_DANS_LE_FUTUR" };

  const ttl = options.ttlMs ?? TOKEN_TTL_MS;
  if (nowMs - issuedAtMs > ttl) return { ok: false, reason: "TOKEN_EXPIRE" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "CHARGE_INVALIDE" };
  }
  if (!isClaims(parsed)) return { ok: false, reason: "CHARGE_INVALIDE" };

  if (options.maxTokenVersion !== undefined && parsed.tv < options.maxTokenVersion) {
    return { ok: false, reason: "SIGNATURE_INVALIDE" };
  }

  return { ok: true, claims: parsed, issuedAtMs };
}
