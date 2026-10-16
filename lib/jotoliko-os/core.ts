// Invariants métier Jotoliko OS.
//
// Ce module est la **source de vérité unique** des règles métier. Il est
// volontairement :
//   - sans dépendance à Prisma, à NestJS, à React ou au DOM ;
//   - sans effet de bord, sans horloge implicite, sans I/O.
//
// Conséquence : chaque règle ci-dessous est testable en isolation, et l'API
// comme l'interface consomment exactement les mêmes règles. Une règle ne doit
// jamais être réimplémentée ailleurs — sinon les deux copies divergent.

// ---------------------------------------------------------------------------
// Statuts
// ---------------------------------------------------------------------------

export const MISSION_STATUSES = [
  "A_AFFECTER",
  "AFFECTEE",
  "EN_ROUTE",
  "ARRIVE",
  "LIVREE",
  "ECHEC",
  "REPROGRAMMEE",
  "RETOUR",
] as const;

export type MissionStatus = (typeof MISSION_STATUSES)[number];

export const TRUTH_STATUSES = [
  "REEL",
  "ESTIME",
  "DERNIERE_POSITION_CONNUE",
  "INDISPONIBLE",
  "A_VERIFIER",
  "CONFIRME",
] as const;

export type TruthStatus = (typeof TRUTH_STATUSES)[number];

export const SYNC_STATUSES = ["SYNCHRONISE", "EN_ATTENTE", "SYNCHRONISATION", "ECHEC"] as const;

export type SyncStatus = (typeof SYNC_STATUSES)[number];

export function isMissionStatus(value: unknown): value is MissionStatus {
  return typeof value === "string" && (MISSION_STATUSES as readonly string[]).includes(value);
}

export function isTruthStatus(value: unknown): value is TruthStatus {
  return typeof value === "string" && (TRUTH_STATUSES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Rôles et permissions
// ---------------------------------------------------------------------------

export const APP_ROLES = ["OWNER", "ADMIN", "MANAGER", "DRIVER", "SELLER", "VIEWER"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (APP_ROLES as readonly string[]).includes(value);
}

/**
 * Matrice de permissions. Toute décision d'autorisation serveur doit passer par
 * ici : masquer un bouton dans l'interface ne protège rien.
 */
export const PERMISSIONS = {
  /** Encaisse un règlement client à la livraison. */
  collectPayment: ["OWNER", "ADMIN", "MANAGER", "DRIVER"],
  /** Remet la caisse collectée à l'entreprise. Jamais un livreur. */
  remitCash: ["OWNER", "ADMIN", "MANAGER"],
  /** Fait évoluer le statut d'une mission. */
  transitionMission: ["OWNER", "ADMIN", "MANAGER", "DRIVER"],
  /** Déclare une position GPS. */
  recordGps: ["OWNER", "ADMIN", "MANAGER", "DRIVER"],
  /** Consulte le journal d'audit. */
  readAudit: ["OWNER", "ADMIN", "MANAGER"],
  /** Crée ou modifie une commande. */
  writeOrder: ["OWNER", "ADMIN", "MANAGER", "SELLER"],
  /**
   * Crée une mission dans le centre des opérations. Réservé au bureau : un
   * livreur ne se crée pas de travail, il exécute celui qui lui est affecté.
   */
  createMission: ["OWNER", "ADMIN", "MANAGER", "SELLER"],
  /** Affecte ou réaffecte une mission à un livreur de l'entreprise. */
  assignMission: ["OWNER", "ADMIN", "MANAGER"],
  /**
   * Dépose une preuve de livraison. Le livreur dépose sur ses propres missions,
   * le bureau sur celles de l'entreprise (contrôle de périmètre dans le service).
   */
  uploadProof: ["OWNER", "ADMIN", "MANAGER", "DRIVER"],
  /** Consulte les preuves de livraison. */
  readProof: ["OWNER", "ADMIN", "MANAGER", "DRIVER", "VIEWER"],
  /**
   * Supprime (logiquement) une preuve. Le bureau uniquement : un livreur ne
   * peut pas effacer la preuve qui justifie sa livraison.
   */
  deleteProof: ["OWNER", "ADMIN", "MANAGER"],
} as const satisfies Record<string, readonly AppRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function isAllowed(role: AppRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly AppRole[]).includes(role);
}

export function assertAllowed(role: AppRole, permission: Permission): void {
  if (!isAllowed(role, permission)) {
    throw new Error(`Rôle ${role} non autorisé pour ${permission}`);
  }
}

/**
 * Un livreur n'agit que sur les missions qui lui sont affectées. Un rôle de
 * bureau (OWNER/ADMIN/MANAGER) agit sur toute l'entreprise.
 *
 * `assignedUserId === undefined` signifie « mission non affectée » : un livreur
 * ne peut donc pas s'en emparer implicitement.
 */
export function canActOnMission(
  role: AppRole,
  userId: string,
  assignedUserId: string | undefined | null
): boolean {
  if (role === "DRIVER") {
    return typeof assignedUserId === "string" && assignedUserId.length > 0 && assignedUserId === userId;
  }
  return isAllowed(role, "transitionMission");
}

export function assertCanActOnMission(
  role: AppRole,
  userId: string,
  assignedUserId: string | undefined | null
): void {
  if (!canActOnMission(role, userId, assignedUserId)) {
    throw new Error("Mission hors du périmètre de cet utilisateur");
  }
}

// ---------------------------------------------------------------------------
// Adresse & argent
// ---------------------------------------------------------------------------

export type Address = {
  country?: string;
  city?: string;
  quartier?: string;
  zone?: string;
  writtenAddress?: string;
  landmark?: string;
  accessInstructions?: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  locationPhotoId?: string;
};

export type MoneyState = {
  expected: number;
  collected: number;
  remitted: number;
  difference: number;
};

/** Détail de caisse. Complète `MoneyState` sans en changer le contrat. */
export type CashBreakdown = {
  /** Ce qui était attendu chez le client. */
  expected: number;
  /** Ce que le livreur déclare avoir encaissé. */
  collected: number;
  /** Ce que le livreur a effectivement remis à l'entreprise. */
  remitted: number;
  /** Manque à encaisser côté client : expected - collected. */
  collectionGap: number;
  /** Espèces encore entre les mains du livreur : collected - remitted. */
  cashInHand: number;
  /** Reste dû global, tel qu'affiché par `MoneyState.difference`. */
  difference: number;
  /** Écart constaté entre ce qui est attendu et ce qui a été honoré. */
  variance: number;
};

export type Mission = {
  id: string;
  orderId: string;
  driverId?: string;
  clientName: string;
  phone?: string;
  address: Address;
  status: MissionStatus;
  proofRequired: boolean;
  proofId?: string;
  money: MoneyState;
  gpsTruth: TruthStatus;
  gpsAt?: string;
  syncStatus: SyncStatus;
};

// ---------------------------------------------------------------------------
// Transitions de statut
// ---------------------------------------------------------------------------

/**
 * Graphe des transitions autorisées. `ARRIVE` est le pivot de la livraison :
 * on ne peut pas être LIVREE sans être passé par ARRIVE, ce qui empêche de
 * clôturer une mission depuis EN_ROUTE.
 */
export const TRANSITIONS: Record<MissionStatus, readonly MissionStatus[]> = {
  A_AFFECTER: ["AFFECTEE"],
  AFFECTEE: ["EN_ROUTE"],
  EN_ROUTE: ["ARRIVE", "ECHEC"],
  ARRIVE: ["LIVREE", "ECHEC"],
  LIVREE: ["REPROGRAMMEE", "RETOUR"],
  ECHEC: ["REPROGRAMMEE", "RETOUR"],
  REPROGRAMMEE: ["AFFECTEE"],
  RETOUR: [],
};

/** Statuts terminaux : plus aucune transition sortante. */
export const TERMINAL_STATUSES: readonly MissionStatus[] = ["RETOUR"];

export function canTransition(from: MissionStatus, to: MissionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: MissionStatus, to: MissionStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Transition interdite: ${from} → ${to}`);
  }
}

// ---------------------------------------------------------------------------
// Règles financières
// ---------------------------------------------------------------------------

export function canCollectPayment(mission: Mission): boolean {
  return mission.status === "LIVREE";
}

export function assertPaymentAllowed(mission: Mission): void {
  if (!canCollectPayment(mission)) {
    throw new Error("Encaissement interdit avant LIVREE");
  }
}

export function assertDeliveryClosable(mission: Mission): void {
  if (mission.proofRequired && !mission.proofId) {
    throw new Error("Preuve requise avant clôture");
  }
}

/**
 * Un encaissement ne peut pas dépasser ce qui reste dû. Empêche un livreur
 * (ou un bug client) de gonfler `collectedAmount` au-delà de la commande.
 */
export function maxCollectable(mission: Mission): number {
  return Math.max(0, mission.money.expected - mission.money.collected);
}

export function assertCollectAmount(mission: Mission, amount: number): void {
  assertIntegerAmount(amount, "Montant encaissé");
  if (amount <= 0) {
    throw new Error("Le montant encaissé doit être strictement positif");
  }
  const remaining = maxCollectable(mission);
  if (amount > remaining) {
    throw new Error(`Encaissement supérieur au reste dû (${remaining})`);
  }
}

/** Espèces encore détenues par le livreur pour cette mission. */
export function availableForRemittance(mission: Mission): number {
  return Math.max(0, mission.money.collected - mission.money.remitted);
}

export function assertRemittanceAmount(mission: Mission, amount: number): void {
  assertIntegerAmount(amount, "Montant de remise");
  if (amount <= 0) {
    throw new Error("Le montant de remise doit être strictement positif");
  }
  const available = availableForRemittance(mission);
  if (amount > available) {
    throw new Error("Remise supérieure au montant encaissé disponible");
  }
}

/**
 * Les montants sont des entiers (FCFA sans subdivision). Les flottants sont
 * rejetés : 1.5 FCFA n'existe pas et un arrondi silencieux déséquilibre la caisse.
 */
export function assertIntegerAmount(amount: unknown, label = "Montant"): asserts amount is number {
  if (typeof amount !== "number" || !Number.isFinite(amount) || !Number.isInteger(amount)) {
    throw new Error(`${label} invalide : entier attendu`);
  }
  if (!Number.isSafeInteger(amount)) {
    throw new Error(`${label} hors limites`);
  }
}

export function calculateDifference(expected: number, collected: number, remitted: number): number {
  return expected - remitted;
}

export function normalizeMoneyState(expected: number, collected: number, remitted: number): MoneyState {
  return {
    expected,
    collected,
    remitted,
    difference: calculateDifference(expected, collected, remitted),
  };
}

/**
 * Vue caisse complète. `collected` est conservé même quand il dépasse
 * `expected` : on n'écrase jamais un encaissement constaté, on l'expose.
 */
export function cashBreakdown(expected: number, collected: number, remitted: number): CashBreakdown {
  return {
    expected,
    collected,
    remitted,
    collectionGap: expected - collected,
    cashInHand: collected - remitted,
    difference: calculateDifference(expected, collected, remitted),
    variance: collected - expected,
  };
}

// ---------------------------------------------------------------------------
// GPS : vérité datée, jamais inventée
// ---------------------------------------------------------------------------

export const GPS_FRESH_MS = 60_000;
export const GPS_MAX_AGE_MS = 15 * 60_000;

/**
 * Classe une position selon son âge. Aucune vitesse ni position n'est inventée :
 * au-delà de `GPS_MAX_AGE_MS`, la position est `INDISPONIBLE` et ne doit pas
 * être présentée comme actuelle.
 */
export function gpsTruthFromAge(ageSeconds: number | null): TruthStatus {
  if (ageSeconds === null || !Number.isFinite(ageSeconds) || ageSeconds < 0) return "INDISPONIBLE";
  if (ageSeconds <= 60) return "REEL";
  if (ageSeconds <= 900) return "DERNIERE_POSITION_CONNUE";
  return "INDISPONIBLE";
}

export function isUsableCoordinates(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * Une position datée par l'appareil peut être dans le futur (horloge du
 * téléphone déréglée) ou arbitrairement ancienne. On la refuse plutôt que de
 * l'enregistrer comme valide.
 */
export function assertAcceptableGpsTimestamp(recordedAt: Date, now: Date, toleranceMs = 5 * 60_000): void {
  const ts = recordedAt.getTime();
  if (!Number.isFinite(ts)) throw new Error("Horodatage GPS invalide");
  if (ts > now.getTime() + toleranceMs) throw new Error("Horodatage GPS dans le futur");
  if (now.getTime() - ts > GPS_MAX_AGE_MS) throw new Error("Position GPS trop ancienne");
}

// ---------------------------------------------------------------------------
// Idempotence
// ---------------------------------------------------------------------------

export const MIN_IDEMPOTENCY_KEY_LENGTH = 8;

export function assertIdempotencyKey(key: unknown): asserts key is string {
  if (typeof key !== "string" || key.trim().length < MIN_IDEMPOTENCY_KEY_LENGTH) {
    throw new Error(`Idempotency-Key requis (>= ${MIN_IDEMPOTENCY_KEY_LENGTH} caractères)`);
  }
}

/** Espace de nommage : l'unicité d'une clé est locale à (entreprise, opération). */
export function operationScope(operation: string, missionId: string): string {
  return `${operation}:${missionId}`;
}
