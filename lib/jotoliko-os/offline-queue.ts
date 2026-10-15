// File d'attente hors ligne (terrain).
//
// Principe : une action terrain est d'abord persistée localement, puis envoyée
// au serveur. Tant que le serveur n'a pas confirmé, l'opération reste EN_ATTENTE
// — l'interface ne doit jamais l'afficher comme confirmée.
//
// Ce module contient la logique pure. Le stockage est injecté (`QueueStorage`)
// afin qu'il soit remplaçable (IndexedDB sur le téléphone, mémoire dans les
// tests) et que la logique soit vérifiable sans navigateur.

export const QUEUE_STATES = ["EN_ATTENTE", "SYNCHRONISATION", "SYNCHRONISE", "ECHEC"] as const;
export type QueueState = (typeof QUEUE_STATES)[number];

export type QueuedOperation = {
  /** Clé d'idempotence générée sur l'appareil. Stable sur toute la durée de vie. */
  clientId: string;
  /** Opération métier : PAYMENT, REMITTANCE, TRANSITION, GPS, PROOF. */
  kind: string;
  /** Ressource cible (identifiant de mission). */
  targetId: string;
  payload: Record<string, unknown>;
  /** Horodatage de l'appareil. Conservé tel quel, même après synchronisation. */
  recordedAt: string;
  state: QueueState;
  attempts: number;
  lastError?: string;
  /** Horodatage serveur, renseigné uniquement après confirmation réelle. */
  syncedAt?: string;
  /** Identifiant du résultat serveur, si renvoyé. */
  serverResultId?: string;
};

export interface QueueStorage {
  all(): Promise<QueuedOperation[]>;
  put(operation: QueuedOperation): Promise<void>;
  remove(clientId: string): Promise<void>;
}

export class MemoryQueueStorage implements QueueStorage {
  private readonly items = new Map<string, QueuedOperation>();

  constructor(seed: QueuedOperation[] = []) {
    for (const item of seed) this.items.set(item.clientId, { ...item, payload: { ...item.payload } });
  }

  async all(): Promise<QueuedOperation[]> {
    return [...this.items.values()].map((i) => ({ ...i, payload: { ...i.payload } }));
  }

  async put(operation: QueuedOperation): Promise<void> {
    this.items.set(operation.clientId, { ...operation, payload: { ...operation.payload } });
  }

  async remove(clientId: string): Promise<void> {
    this.items.delete(clientId);
  }
}

/** Backoff exponentiel plafonné, avec décalage déterministe par opération. */
export const BASE_BACKOFF_MS = 2_000;
export const MAX_BACKOFF_MS = 5 * 60_000;

export function backoffMs(attempts: number, jitterKey = ""): number {
  const safeAttempts = Math.max(0, Math.floor(attempts));
  const raw = Math.min(BASE_BACKOFF_MS * 2 ** safeAttempts, MAX_BACKOFF_MS);
  // Décalage déterministe (0–10 %) : évite que toutes les opérations repartent
  // au même instant sans introduire d'aléatoire non testable.
  let hash = 0;
  for (let i = 0; i < jitterKey.length; i += 1) hash = (hash * 31 + jitterKey.charCodeAt(i)) % 1000;
  const jitter = Math.floor((raw * (hash % 11)) / 100);
  return raw + jitter;
}

export function isPending(operation: QueuedOperation): boolean {
  return operation.state !== "SYNCHRONISE";
}

export class OfflineQueue {
  constructor(private readonly storage: QueueStorage) {}

  /**
   * Met une opération en file. Une même `clientId` n'est jamais dupliquée :
   * une action déjà enregistrée est conservée telle quelle.
   */
  async enqueue(input: {
    clientId: string;
    kind: string;
    targetId: string;
    payload: Record<string, unknown>;
    recordedAt: string;
  }): Promise<QueuedOperation> {
    if (!input.clientId) throw new Error("clientId requis");
    const existing = (await this.storage.all()).find((o) => o.clientId === input.clientId);
    if (existing) return existing;

    const operation: QueuedOperation = {
      ...input,
      state: "EN_ATTENTE",
      attempts: 0,
    };
    await this.storage.put(operation);
    return operation;
  }

  /** Opérations restant à transmettre, dans l'ordre d'enregistrement terrain. */
  async pending(): Promise<QueuedOperation[]> {
    return (await this.storage.all())
      .filter(isPending)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  }

  /**
   * Sélectionne un lot prêt à être envoyé. Une opération encore en échec est
   * repoussée selon son backoff afin de ne pas saturer un réseau déjà instable.
   */
  async takeBatch(nowMs: number, size = 20): Promise<QueuedOperation[]> {
    const pending = await this.pending();
    const ready: QueuedOperation[] = [];
    for (const operation of pending) {
      if (operation.state === "ECHEC" && operation.lastError) {
        const readyAt = Date.parse(operation.recordedAt) + backoffMs(operation.attempts, operation.clientId);
        if (Number.isFinite(readyAt) && nowMs < readyAt) continue;
      }
      ready.push(operation);
      if (ready.length >= size) break;
    }
    return ready;
  }

  async markSending(clientId: string): Promise<void> {
    const operation = (await this.storage.all()).find((o) => o.clientId === clientId);
    if (!operation) return;
    await this.storage.put({ ...operation, state: "SYNCHRONISATION" });
  }

  /**
   * Confirme une opération. `syncedAt` doit provenir de l'accusé de réception
   * serveur : c'est la seule trace admise d'une synchronisation réelle.
   */
  async markSynced(clientId: string, serverConfirmedAt: string, serverResultId?: string): Promise<void> {
    const operation = (await this.storage.all()).find((o) => o.clientId === clientId);
    if (!operation) return;
    await this.storage.put({
      ...operation,
      state: "SYNCHRONISE",
      syncedAt: serverConfirmedAt,
      serverResultId,
      lastError: undefined,
    });
  }

  /**
   * Enregistre un échec. L'opération est conservée : une erreur réseau ne doit
   * jamais faire disparaître une action terrain.
   */
  async markFailed(clientId: string, error: string): Promise<void> {
    const operation = (await this.storage.all()).find((o) => o.clientId === clientId);
    if (!operation) return;
    await this.storage.put({
      ...operation,
      state: "ECHEC",
      attempts: operation.attempts + 1,
      lastError: error,
    });
  }

  /** Remet en attente les opérations interrompues par une coupure ou un arrêt. */
  async recoverInterrupted(): Promise<number> {
    const all = await this.storage.all();
    let recovered = 0;
    for (const operation of all) {
      if (operation.state === "SYNCHRONISATION") {
        await this.storage.put({ ...operation, state: "EN_ATTENTE" });
        recovered += 1;
      }
    }
    return recovered;
  }

  /** Vue destinée à l'interface : ce qui est confirmé vs ce qui ne l'est pas. */
  async report(): Promise<{
    pending: number;
    failed: number;
    synced: number;
    pendingOperations: QueuedOperation[];
  }> {
    const all = await this.storage.all();
    return {
      pending: all.filter((o) => o.state === "EN_ATTENTE" || o.state === "SYNCHRONISATION").length,
      failed: all.filter((o) => o.state === "ECHEC").length,
      synced: all.filter((o) => o.state === "SYNCHRONISE").length,
      pendingOperations: all.filter(isPending),
    };
  }
}

/**
 * Envoie un lot puis met à jour la file selon la réponse **réelle** du serveur.
 * Un envoi qui n'a pas produit d'accusé de réception reste non confirmé.
 */
export async function flushQueue(
  queue: OfflineQueue,
  send: (operation: QueuedOperation) => Promise<{ accepted: boolean; syncedAt?: string; resultId?: string; error?: string }>,
  nowMs: number,
  batchSize = 20
): Promise<{ synced: number; failed: number }> {
  const batch = await queue.takeBatch(nowMs, batchSize);
  let synced = 0;
  let failed = 0;
  for (const operation of batch) {
    await queue.markSending(operation.clientId);
    try {
      const result = await send(operation);
      if (result.accepted && result.syncedAt) {
        await queue.markSynced(operation.clientId, result.syncedAt, result.resultId);
        synced += 1;
      } else {
        await queue.markFailed(operation.clientId, result.error ?? "Accusé de réception serveur absent");
        failed += 1;
      }
    } catch (error) {
      await queue.markFailed(operation.clientId, (error as Error).message);
      failed += 1;
    }
  }
  return { synced, failed };
}
