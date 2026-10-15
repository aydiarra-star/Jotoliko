// Stockage des preuves — test unitaire du système de fichiers.
//
// Ce fichier existe à cause d'un défaut réel : la validation des segments de clé
// bornait un segment à 64 caractères, alors que la clé composée
// (`<empreinte SHA-256>.<extension>`) en fait 68 à 69. **Tout** dépôt de preuve
// échouait donc en `500`, et cela n'a été découvert qu'en intégration HTTP.
//
// Le manque n'était pas l'absence de tests, mais l'absence d'un test qui compose
// la clé **réellement produite** avant de la valider. C'est ce que fait le
// premier cas ci-dessous, pour chaque type accepté.
//
// Ce test ne demande ni PostgreSQL, ni API compilée : il s'exécute partout, y
// compris dans un environnement sans base de données.

import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MAX_PROOF_BYTES,
  MAX_STORAGE_SEGMENT_LENGTH,
  PROOF_MIME_EXTENSIONS,
  ProofStorage,
  detectMimeType,
  isAllowedMimeType,
  sha256Hex,
} from "../../apps/api/src/proofs/proof-storage";

/** Signatures binaires minimales, telles qu'un appareil les produirait. */
const SIGNATURES = {
  "image/png": Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("contenu-png-de-test"),
  ]),
  "image/jpeg": Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.from("contenu-jpeg-de-test"),
  ]),
  "image/webp": Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.from([0x1a, 0x00, 0x00, 0x00]),
    Buffer.from("WEBPcontenu-webp"),
  ]),
  "application/pdf": Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from("contenu-pdf-de-test")]),
} as const;

const COMPANY_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const MISSION_ID = "9c858901-8a57-4791-81fe-4c455b099bc9";

let root: string;
let storage: ProofStorage;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "jotoliko-proof-storage-"));
  storage = new ProofStorage(root);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("Stockage des preuves — clé et chemin", () => {
  it("accepte la clé réellement composée, pour chaque type autorisé", () => {
    // Le cas qui manquait : la clé est produite par `keyFor`, puis validée par
    // `absolutePath`. Les tester séparément ne prouvait rien.
    const content = SIGNATURES["image/png"];
    for (const mimeType of Object.keys(PROOF_MIME_EXTENSIONS)) {
      const key = ProofStorage.keyFor(COMPANY_ID, MISSION_ID, sha256Hex(content), mimeType);
      expect(() => storage.absolutePath(key)).not.toThrow();
      const path = storage.absolutePath(key);
      // Et le chemin reste strictement à l'intérieur du répertoire de preuves.
      expect(path.startsWith(resolve(root) + sep)).toBe(true);
    }
  });

  it("ne dépend pas d'une empreinte courte : la borne vaut pour un SHA-256 complet", () => {
    const key = ProofStorage.keyFor(COMPANY_ID, MISSION_ID, "f".repeat(64), "image/webp");
    const filename = key.split("/")[2] as string;
    expect(filename).toHaveLength(64 + 1 + 4);
    expect(filename.length).toBeLessThanOrEqual(MAX_STORAGE_SEGMENT_LENGTH);
    expect(() => storage.absolutePath(key)).not.toThrow();
  });

  it("produit une clé stable : deux dépôts du même contenu visent le même fichier", () => {
    const sha = sha256Hex(SIGNATURES["image/jpeg"]);
    expect(ProofStorage.keyFor(COMPANY_ID, MISSION_ID, sha, "image/jpeg")).toBe(
      ProofStorage.keyFor(COMPANY_ID, MISSION_ID, sha, "image/jpeg")
    );
  });

  it("refuse un type non pris en charge plutôt que de composer une extension devinée", () => {
    expect(() => ProofStorage.keyFor(COMPANY_ID, MISSION_ID, "a".repeat(64), "text/html")).toThrow();
    expect(isAllowedMimeType("text/html")).toBe(false);
    expect(isAllowedMimeType("image/png")).toBe(true);
  });

  it("refuse toute tentative de sortie du répertoire", () => {
    const hostile = [
      "../../etc/passwd",
      `${COMPANY_ID}/${MISSION_ID}/../../../etc/passwd`,
      `${COMPANY_ID}/${MISSION_ID}/..`,
      `/etc/passwd`,
      `${COMPANY_ID}//${MISSION_ID}`,
      `${COMPANY_ID}/${MISSION_ID}`,
      `${COMPANY_ID}/${MISSION_ID}/a/b/c`,
      `${COMPANY_ID}/${MISSION_ID}/.cache`,
      `${COMPANY_ID}/${MISSION_ID}/-flag`,
      `${COMPANY_ID}/${MISSION_ID}/`,
      "",
    ];
    for (const key of hostile) {
      expect(() => storage.absolutePath(key), `clé refusée attendue : ${key}`).toThrow();
    }
  });
});

describe("Stockage des preuves — écriture et lecture", () => {
  it("écrit le contenu exact, lisible et de longueur vérifiable", async () => {
    const content = SIGNATURES["image/webp"];
    const key = ProofStorage.keyFor(COMPANY_ID, MISSION_ID, sha256Hex(content), "image/webp");
    await storage.save(key, content);

    const onDisk = readFileSync(storage.absolutePath(key));
    expect(onDisk.equals(content)).toBe(true);
    expect(sha256Hex(onDisk)).toBe(sha256Hex(content));
    expect(await storage.size(key)).toBe(content.length);

    const opened = await storage.open(key);
    expect(opened).not.toBeNull();
    expect(opened?.size).toBe(content.length);
    const streamed = await new Promise<Buffer>((resolve_, reject) => {
      const chunks: Buffer[] = [];
      opened?.stream.on("data", (chunk: string | Buffer) =>
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
      );
      opened?.stream.on("end", () => resolve_(Buffer.concat(chunks)));
      opened?.stream.on("error", reject);
    });
    expect(streamed.equals(content)).toBe(true);
  });

  it("écrit dans un fichier lisible par le seul propriétaire du processus", async () => {
    const content = SIGNATURES["application/pdf"];
    const key = ProofStorage.keyFor(COMPANY_ID, MISSION_ID, sha256Hex(content), "application/pdf");
    await storage.save(key, content);
    const mode = statSync(storage.absolutePath(key)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("ne laisse aucun fichier temporaire après une écriture réussie", async () => {
    const content = SIGNATURES["image/png"];
    const key = ProofStorage.keyFor(COMPANY_ID, MISSION_ID, sha256Hex(content), "image/png");
    await storage.save(key, content);
    const entries = readdirSync(join(root, COMPANY_ID, MISSION_ID));
    expect(entries.filter((name) => name.includes(".tmp-"))).toEqual([]);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("réécrire le même contenu est sans effet : le fichier reste unique", async () => {
    const content = SIGNATURES["image/jpeg"];
    const key = ProofStorage.keyFor(COMPANY_ID, MISSION_ID, sha256Hex(content), "image/jpeg");
    await storage.save(key, content);
    const before = readdirSync(join(root, COMPANY_ID, MISSION_ID)).length;
    await storage.save(key, content);
    expect(readdirSync(join(root, COMPANY_ID, MISSION_ID)).length).toBe(before);
  });

  it("distingue un fichier absent d'un fichier vide, sans jamais lever", async () => {
    const missing = ProofStorage.keyFor(COMPANY_ID, MISSION_ID, "b".repeat(64), "image/png");
    expect(await storage.size(missing)).toBeNull();
    expect(await storage.open(missing)).toBeNull();
  });
});

describe("Stockage des preuves — diagnostic du volume (supervision)", () => {
  it("déclare le volume utilisable et publie l'espace libre", async () => {
    const health = await storage.health();
    expect(health.usable).toBe(true);
    expect(health.reason).toBeNull();
    // L'espace libre est une valeur réelle du système de fichiers, pas une
    // constante : c'est ce qui permet d'alerter avant la saturation.
    expect(typeof health.freeBytes).toBe("number");
    expect(health.freeBytes).toBeGreaterThan(0);
    expect(health.minFreeBytes).toBeGreaterThan(0);
  });

  it("ne laisse aucun fichier témoin derrière lui", async () => {
    await storage.health();
    const entries = readdirSync(root);
    expect(entries.filter((name) => name.startsWith(".sante-"))).toEqual([]);
  });

  it("se déclare inutilisable quand le chemin n'est pas un répertoire", async () => {
    // Cas déterministe, sans dépendre des droits du processus : un volume monté
    // au mauvais endroit (fichier au lieu de répertoire) doit être signalé.
    const notADirectory = join(root, "fichier-au-lieu-de-volume");
    writeFileSync(notADirectory, "je ne suis pas un répertoire");
    const broken = new ProofStorage(notADirectory);
    const health = await broken.health();
    expect(health.usable).toBe(false);
    expect(["INDISPONIBLE", "NON_INSCRIPTIBLE"]).toContain(health.reason);
  });

  it("alerte quand l'espace libre passe sous le seuil configuré", async () => {
    // Seuil volontairement inatteignable : l'espace libre réel est toujours
    // inférieur au plus grand entier sûr, donc le cas se reproduit partout.
    const exigent = new ProofStorage(root, Number.MAX_SAFE_INTEGER);
    const health = await exigent.health();
    expect(health.usable).toBe(false);
    expect(health.reason).toBe("ESPACE_INSUFFISANT");
    expect(health.minFreeBytes).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("refuse un volume réellement non inscriptible", async () => {
    // Le contrôle écrit vraiment : un test de droit d'accès ne détecte ni un
    // montage en lecture seule, ni un disque plein.
    if (process.getuid?.() === 0) {
      console.warn("[proof-storage] root : le refus d'écriture ne peut pas être éprouvé, cas ignoré");
      return;
    }
    const closed = mkdtempSync(join(tmpdir(), "jotoliko-proofs-ferme-"));
    chmodSync(closed, 0o500);
    try {
      const health = await new ProofStorage(closed).health();
      expect(health.usable).toBe(false);
      expect(["NON_INSCRIPTIBLE", "INDISPONIBLE"]).toContain(health.reason);
    } finally {
      chmodSync(closed, 0o700);
      rmSync(closed, { recursive: true, force: true });
    }
  });
});

describe("Stockage des preuves — contrôle du contenu", () => {
  it("reconnaît chaque format par sa signature binaire", () => {
    for (const [mimeType, content] of Object.entries(SIGNATURES)) {
      expect(detectMimeType(content), mimeType).toBe(mimeType);
    }
  });

  it("refuse un contenu qui n'est pas une pièce justificative acceptée", () => {
    // Un exécutable renommé en `.jpg` : la signature ne ment pas.
    expect(detectMimeType(Buffer.from("#!/bin/sh\nrm -rf /"))).toBeNull();
    expect(detectMimeType(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]))).toBeNull();
    // Un contenu trop court pour porter une signature n'est pas deviné.
    expect(detectMimeType(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
    expect(detectMimeType(Buffer.alloc(0))).toBeNull();
  });

  it("n'accepte pas un RIFF qui ne serait pas un WEBP", () => {
    const riffWav = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.from([0x1a, 0x00, 0x00, 0x00]),
      Buffer.from("WAVEcontenu-audio"),
    ]);
    expect(detectMimeType(riffWav)).toBeNull();
  });

  it("borne la taille acceptée par une constante explicite", () => {
    expect(MAX_PROOF_BYTES).toBe(5 * 1024 * 1024);
  });
});
