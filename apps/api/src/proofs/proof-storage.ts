// Stockage des preuves de livraison.
//
// Le stockage est un système de fichiers dédié (`PROOF_STORAGE_DIR`), jamais une
// URL publique : une preuve de livraison contient une adresse, une signature et
// parfois un visage. Elle est donc lue uniquement par l'API, après contrôle du
// périmètre de l'appelant.
//
// Trois propriétés sont garanties ici, et testées au niveau HTTP :
//   1. le contenu déclaré est confronté à son contenu réel (signature binaire) ;
//   2. l'écriture est atomique (fichier temporaire puis renommage) : un
//      téléversement interrompu ne laisse jamais un fichier partiel servi comme
//      une preuve valide ;
//   3. la clé de stockage est construite à partir d'identifiants et d'une
//      empreinte, jamais d'un nom de fichier fourni par le client — aucune
//      traversée de chemin n'est possible.

import { createHash, randomUUID } from "node:crypto";
import { createReadStream, type ReadStream } from "node:fs";
import { mkdir, rename, stat, statfs, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

/** Taille maximale d'une preuve. Au-delà, le dépôt est refusé (413). */
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

/**
 * Seuil d'alerte d'espace libre du volume de preuves : 256 Mio par défaut.
 *
 * Cette valeur n'est pas un optimum calculé, c'est une **hypothèse de départ**
 * explicitement configurable (`PROOF_STORAGE_MIN_FREE_BYTES`) : elle doit être
 * ajustée à la taille réelle des preuves et au rythme des livraisons du pilote.
 * Le rôle du seuil est d'alerter *avant* la saturation, pas de la prévoir.
 */
export const DEFAULT_PROOF_STORAGE_MIN_FREE_BYTES = 256 * 1024 * 1024;

/** Diagnostic du volume de preuves, destiné aux sondes et à la supervision. */
export type StorageHealth = {
  usable: boolean;
  /** Raison du refus, en clair et stable, exploitable par une règle d'alerte. */
  reason: "INDISPONIBLE" | "NON_INSCRIPTIBLE" | "ESPACE_INSUFFISANT" | null;
  freeBytes: number | null;
  minFreeBytes: number;
};

/** Types acceptés, avec l'extension employée sur disque. */
export const PROOF_MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export type AllowedMimeType = keyof typeof PROOF_MIME_EXTENSIONS;

export function isAllowedMimeType(value: unknown): value is AllowedMimeType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PROOF_MIME_EXTENSIONS, value);
}

/**
 * Signatures binaires des formats acceptés.
 *
 * Le type déclaré par le client n'est qu'une prétention : un exécutable renommé
 * `photo.jpg` doit être refusé. `webp` est vérifié par sa signature RIFF…WEBP.
 */
export function detectMimeType(content: Buffer): string | null {
  if (content.length < 12) return null;
  if (content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return "image/jpeg";
  if (
    content[0] === 0x89 &&
    content[1] === 0x50 &&
    content[2] === 0x4e &&
    content[3] === 0x47 &&
    content[4] === 0x0d &&
    content[5] === 0x0a &&
    content[6] === 0x1a &&
    content[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    content.toString("ascii", 0, 4) === "RIFF" &&
    content.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (content.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

export function sha256Hex(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Longueur maximale d'un segment de clé de stockage.
 *
 * Valeur **déduite** de ce que `keyFor` compose réellement, et non choisie :
 * le segment le plus long est `<empreinte SHA-256 (64 caractères)>.<extension>`
 * (`.webp` = 4), soit 69 caractères.
 *
 * Défaut constaté en intégration HTTP : la borne précédente était fixée à 64
 * (dimensionnée pour un identifiant), si bien que **tout** dépôt de preuve
 * échouait sur « Clé de stockage invalide », converti en `500` muet. Aucun test
 * ne composait la clé réelle avant de la valider ; `tests/unit/proof-storage`
 * verrouille désormais cet accord.
 */
export const MAX_STORAGE_SEGMENT_LENGTH = 69;

/**
 * Un segment de clé de stockage est un identifiant ou une empreinte — jamais un
 * chemin. Interdit notamment le séparateur, l'antislash et le segment `.` ou
 * `..` (un segment doit commencer par un caractère alphanumérique). Cette
 * contrainte est la seule barrière nécessaire contre la traversée de
 * répertoire ; elle est vérifiée même si les valeurs viennent de la base.
 */
const SAFE_SEGMENT = new RegExp(
  `^[A-Za-z0-9][A-Za-z0-9._-]{0,${MAX_STORAGE_SEGMENT_LENGTH - 1}}$`
);

export class ProofStorage {
  constructor(
    private readonly root: string,
    /** Seuil d'alerte d'espace libre, en octets. */
    private readonly minFreeBytes: number = DEFAULT_PROOF_STORAGE_MIN_FREE_BYTES
  ) {}

  /** Clé stable et déterministe : entreprise / mission / empreinte.extension. */
  static keyFor(companyId: string, missionId: string, sha256: string, mimeType: string): string {
    const extension = PROOF_MIME_EXTENSIONS[mimeType];
    if (!extension) throw new Error(`Type de preuve non pris en charge : ${mimeType}`);
    return `${companyId}/${missionId}/${sha256}.${extension}`;
  }

  /**
   * Prépare le répertoire racine. Appelé au démarrage : un volume absent ou non
   * inscriptible doit empêcher l'API de démarrer, pas se découvrir au premier
   * dépôt d'une preuve.
   */
  async prepare(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  /**
   * Diagnostic du volume, utilisé par `/health/ready` et par la supervision.
   *
   * Deux contrôles, pour deux pannes distinctes qui ne se voient pas l'une
   * l'autre :
   *  1. une **écriture réelle** (fichier témoin écrit puis supprimé) — un test
   *     de droit d'accès ne détecte ni un montage exclusivement en lecture, ni un
   *     disque plein, alors que l'écriture échoue dans les deux cas ;
   *  2. l'**espace libre** du système de fichiers, comparé à un seuil
   *     configurable : un dépôt de preuve refusé faute de place ferait échouer une
   *     livraison devant le client, ce qu'aucun exploitant ne veut découvrir sur
   *     le terrain.
   */
  async health(): Promise<StorageHealth> {
    let freeBytes: number | null = null;
    try {
      const info = await statfs(this.root);
      // `bavail` : blocs réellement disponibles pour l'utilisateur (hors réserve
      // root), c'est la valeur qui compte pour prédire un échec d'écriture.
      freeBytes = Number(info.bavail) * Number(info.bsize);
    } catch {
      freeBytes = null;
    }

    const probe = join(this.root, `.sante-${randomUUID()}`);
    try {
      await writeFile(probe, "ok", { mode: 0o600 });
      await unlink(probe);
    } catch {
      return {
        usable: false,
        reason: freeBytes === null ? "INDISPONIBLE" : "NON_INSCRIPTIBLE",
        freeBytes,
        minFreeBytes: this.minFreeBytes,
      };
    }

    if (freeBytes !== null && freeBytes < this.minFreeBytes) {
      return { usable: false, reason: "ESPACE_INSUFFISANT", freeBytes, minFreeBytes: this.minFreeBytes };
    }
    return { usable: true, reason: null, freeBytes, minFreeBytes: this.minFreeBytes };
  }

  absolutePath(storageKey: string): string {
    const segments = storageKey.split("/");
    if (segments.length !== 3) {
      throw new Error(`Clé de stockage invalide : ${segments.length} segment(s), 3 attendus`);
    }
    const rejected = segments.find((segment) => !SAFE_SEGMENT.test(segment));
    if (rejected !== undefined) {
      // Le segment fautif est nommé : sans cela, la seule trace d'un échec de
      // dépôt était « Clé de stockage invalide », insuffisant pour diagnostiquer.
      throw new Error(
        `Clé de stockage invalide : segment « ${rejected} » refusé ` +
          `(1 à ${MAX_STORAGE_SEGMENT_LENGTH} caractères alphanumériques, `.concat(
          "points, tirets ou soulignés, sans séparateur de chemin)"
        )
      );
    }
    const target = resolve(this.root, ...segments);
    const boundary = resolve(this.root) + sep;
    if (!target.startsWith(boundary)) throw new Error("Clé de stockage hors du répertoire de preuves");
    return target;
  }

  /** Écriture atomique : le fichier n'apparaît complet qu'une fois renommé. */
  async save(storageKey: string, content: Buffer): Promise<void> {
    const target = this.absolutePath(storageKey);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${randomUUID()}`;
    try {
      await writeFile(temporary, content, { mode: 0o600 });
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async size(storageKey: string): Promise<number | null> {
    try {
      const info = await stat(this.absolutePath(storageKey));
      return info.isFile() ? info.size : null;
    } catch {
      return null;
    }
  }

  /**
   * Flux de lecture. La taille est vérifiée avant : un fichier absent est un
   * incident d'exploitation signalé explicitement (410), jamais une réponse
   * vide présentée comme une preuve.
   */
  async open(storageKey: string): Promise<{ stream: ReadStream; size: number } | null> {
    const size = await this.size(storageKey);
    if (size === null) return null;
    return { stream: createReadStream(this.absolutePath(storageKey)), size };
  }
}
