export type MissionStatus = "A_AFFECTER" | "AFFECTEE" | "EN_ROUTE" | "ARRIVE" | "LIVREE" | "ECHEC" | "REPROGRAMMEE" | "RETOUR";

export type TruthStatus =
  | "REEL"
  | "ESTIME"
  | "DERNIERE_POSITION_CONNUE"
  | "INDISPONIBLE"
  | "A_VERIFIER"
  | "CONFIRME";

export type SyncStatus = "SYNCHRONISE" | "EN_ATTENTE" | "SYNCHRONISATION" | "ECHEC";

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

const transitions: Record<MissionStatus, MissionStatus[]> = {
  A_AFFECTER: ["AFFECTEE"],
  AFFECTEE: ["EN_ROUTE"],
  EN_ROUTE: ["ARRIVE", "ECHEC"],
  ARRIVE: ["LIVREE", "ECHEC"],
  LIVREE: ["REPROGRAMMEE", "RETOUR"],
  ECHEC: ["REPROGRAMMEE", "RETOUR"],
  REPROGRAMMEE: ["AFFECTEE"],
  RETOUR: [],
};

export function canTransition(from: MissionStatus, to: MissionStatus): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: MissionStatus, to: MissionStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Transition interdite: ${from} → ${to}`);
  }
}

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

export function gpsTruthFromAge(ageSeconds: number | null): TruthStatus {
  if (ageSeconds === null || !Number.isFinite(ageSeconds) || ageSeconds < 0) return "INDISPONIBLE";
  if (ageSeconds <= 60) return "REEL";
  if (ageSeconds <= 900) return "DERNIERE_POSITION_CONNUE";
  return "INDISPONIBLE";
}
