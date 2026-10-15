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
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

/** Taille maximale d'une preuve. Au-delà, le dépôt est refusé (413). */
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

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
  constructor(private readonly root: string) {}

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
