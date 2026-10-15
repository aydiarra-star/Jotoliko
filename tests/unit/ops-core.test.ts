// Socle d'exploitation — sauvegarde, restauration, supervision, rétention.
//
// Ces tests existent parce que ces décisions se prennent habituellement **au
// moment de l'incident**, quand plus personne ne peut les relire : quelle
// sauvegarde la rétention peut supprimer, ce qui se passe si un artefact est
// corrompu, quand un service est déclaré disponible, quelle preuve la purge a le
// droit d'effacer. Les vérifier ici, à froid et sans base de données, est la
// seule façon de ne pas les découvrir en production.
//
// Les parties qui exigent PostgreSQL (`pg_dump`, `pg_restore`) ne sont pas
// simulées : elles sont exécutées en CI par `ops/backup.mjs` et
// `ops/restore-verify.mjs` sur un vrai serveur (job « Sauvegarde opérationnelle »).

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  backupPaths,
  buildManifest,
  evaluateHealth,
  listBackups,
  loadBackupConfig,
  opensslDecryptArgs,
  opensslEncryptArgs,
  planProofPurge,
  postgresConnection,
  selectPrunable,
  sha256File,
  timestampTag,
  verifyBackupIntegrity,
  verifyManifestShape,
} from "../../ops/lib/ops-core.mjs";

// Attention : `openssl --version` **échoue** (la forme valide est
// `openssl version`). Utiliser la mauvaise forme ferait ignorer ces cas en
// silence — et c'est précisément ce qui est arrivé à la première version de ce
// fichier.
const hasOpenssl = (() => {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "jotoliko-ops-"));
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("Sauvegarde — configuration", () => {
  const base = {
    BACKUP_DIR: "/sauvegardes",
    DATABASE_URL: "postgresql://u:p@h:5432/base",
    PROOF_STORAGE_DIR: "/volume/preuves",
  };

  it("refuse de démarrer sans destination de sauvegarde", () => {
    const { problems } = loadBackupConfig({ ...base, BACKUP_DIR: "" });
    expect(problems.join(" ")).toMatch(/BACKUP_DIR/);
  });

  it("refuse une sauvegarde qui ignorerait le volume de preuves", () => {
    // Une sauvegarde de la base seule « réussit » et laisse les pièces
    // justificatives sans protection : c'est le cas que la configuration doit
    // rendre impossible.
    const { problems } = loadBackupConfig({ ...base, PROOF_STORAGE_DIR: "" });
    expect(problems.join(" ")).toMatch(/PROOF_STORAGE_DIR/);
  });

  it("refuse une URL de base non PostgreSQL", () => {
    const { problems } = loadBackupConfig({ ...base, DATABASE_URL: "mysql://u:p@h/base" });
    expect(problems.join(" ")).toMatch(/PostgreSQL/);
  });

  it("refuse un chiffrement demandé sans clé", () => {
    const { problems } = loadBackupConfig({ ...base, BACKUP_ENCRYPTION: "openssl-aes256" });
    expect(problems.join(" ")).toMatch(/BACKUP_ENCRYPTION_KEY_FILE/);
  });

  it("refuse une clé de chiffrement lisible par tous", () => {
    // Une clé lisible par tous voyage avec la sauvegarde : le chiffrement ne
    // protégerait alors plus rien.
    const keyFile = join(root, "cle-ouverte");
    writeFileSync(keyFile, "clé de test", { mode: 0o644 });
    const { problems } = loadBackupConfig({
      ...base,
      BACKUP_ENCRYPTION: "openssl-aes256",
      BACKUP_ENCRYPTION_KEY_FILE: keyFile,
    });
    expect(problems.join(" ")).toMatch(/trop ouverte/);
  });

  it("refuse un chiffrement inconnu plutôt que de le traiter comme « aucun »", () => {
    const { problems } = loadBackupConfig({ ...base, BACKUP_ENCRYPTION: "gpg" });
    expect(problems.join(" ")).toMatch(/BACKUP_ENCRYPTION inconnu/);
  });

  it("accepte une configuration complète et applique des valeurs de rétention explicites", () => {
    const { problems, config } = loadBackupConfig(base);
    expect(problems).toEqual([]);
    expect(config.keepDaily).toBe(7);
    expect(config.keepWeekly).toBe(4);
    expect(config.encryption).toBe("none");
    // Aucune alerte n'est inventée : sans destinataire configuré, il n'y a pas
    // d'alerte, et le script le dit.
    expect(config.alertCommand).toBeNull();
  });
});

describe("Sauvegarde — manifeste et intégrité", () => {
  const writeArtifact = (name: string, content: Buffer) => {
    const path = join(root, name);
    writeFileSync(path, content);
    return { name, bytes: content.length, sha256: "", contentSha256: "" };
  };

  it("détecte une sauvegarde corrompue sur son support", async () => {
    const dumpName = "corrompue-database.dump";
    const proofsName = "corrompue-proofs.tar.gz";
    writeFileSync(join(root, dumpName), Buffer.from("contenu de base"));
    writeFileSync(join(root, proofsName), Buffer.from("contenu de preuves"));

    let manifest = buildManifest({
      tag: "2026-10-15T0800Z",
      createdAt: new Date().toISOString(),
      encrypted: false,
      database: { name: dumpName, bytes: statSync(join(root, dumpName)).size, sha256: await sha256File(join(root, dumpName)), contentSha256: "" },
      proofs: { name: proofsName, bytes: statSync(join(root, proofsName)).size, sha256: await sha256File(join(root, proofsName)), contentSha256: "" },
      counts: { missions: 0 },
    });
    manifest = {
      ...manifest,
      artifacts: manifest.artifacts.map((a: { sha256: string }) => ({ ...a, contentSha256: a.sha256 })),
    };

    expect(await verifyBackupIntegrity(root, manifest)).toEqual({ ok: true, problems: [] });

    // Un octet modifié sur le support : la sauvegarde n'est plus fiable, et il
    // faut le savoir avant d'en avoir besoin.
    writeFileSync(join(root, dumpName), Buffer.from("contenu de base modifié"));
    const corrupted = await verifyBackupIntegrity(root, manifest);
    expect(corrupted.ok).toBe(false);
    expect(corrupted.problems.join(" ")).toMatch(/empreinte|octets/);

    writeFileSync(join(root, dumpName), Buffer.from("contenu de base"));
    expect((await verifyBackupIntegrity(root, manifest)).ok).toBe(true);
  });

  it("signale un artefact manquant sans lever", async () => {
    const manifest = buildManifest({
      tag: "2026-10-15T0810Z",
      createdAt: new Date().toISOString(),
      encrypted: false,
      database: { name: "disparue.dump", bytes: 10, sha256: "a".repeat(64), contentSha256: "a".repeat(64) },
      proofs: { name: "disparue.tar.gz", bytes: 10, sha256: "b".repeat(64), contentSha256: "b".repeat(64) },
    });
    const result = await verifyBackupIntegrity(root, manifest);
    expect(result.ok).toBe(false);
    expect(result.problems.filter((p: string) => p.includes("manquant"))).toHaveLength(2);
  });

  it("refuse un manifeste qui ne décrit aucune empreinte de contenu", () => {
    const manifest = buildManifest({
      tag: "t",
      createdAt: new Date().toISOString(),
      encrypted: false,
      database: { name: "database.dump", bytes: 10, sha256: "a".repeat(64) },
      proofs: null,
    });
    expect(verifyManifestShape(manifest).join(" ")).toMatch(/empreinte de contenu/);
  });

  it("refuse un manifeste d'une version inconnue", () => {
    expect(verifyManifestShape({ manifestVersion: 99, artifacts: [] }).join(" ")).toMatch(/version de manifeste/);
  });

  it("nomme les artefacts selon le chiffrement, sans ambiguïté", () => {
    const clair = backupPaths("/sauvegardes", "2026-10-15T0800Z", { encrypted: false });
    expect(clair.database.endsWith("database.dump")).toBe(true);
    const chiffre = backupPaths("/sauvegardes", "2026-10-15T0800Z", { encrypted: true });
    // Un nom de fichier ne doit pas laisser croire à un contenu chiffré : `.enc`
    // apparaît seulement quand le chiffrement est actif.
    expect(chiffre.database.endsWith("database.dump.enc")).toBe(true);
    expect(chiffre.proofs.endsWith("proofs.tar.gz.enc")).toBe(true);
  });

  it("horodate les sauvegardes de façon triable", () => {
    const tag = timestampTag(new Date("2026-10-15T08:30:45.000Z"));
    expect(tag).toBe("2026-10-15T0830Z");
    expect(timestampTag(new Date("2026-10-15T09:30:00.000Z")) > tag).toBe(true);
  });
});

describe("Sauvegarde — rétention", () => {
  const entry = (tag: string, createdAt: string) => ({ tag, createdAt });

  it("ne supprime jamais la sauvegarde la plus récente", () => {
    const entries = [
      entry("A", "2026-10-15T08:00:00.000Z"),
      entry("B", "2026-10-14T08:00:00.000Z"),
      entry("C", "2026-01-01T08:00:00.000Z"),
    ];
    const prunable = selectPrunable(entries, { keepDaily: 1, keepWeekly: 1 });
    expect(prunable.map((e: { tag: string }) => e.tag)).not.toContain("A");
  });

  it("conserve la fenêtre quotidienne même avec une seule sauvegarde par jour", () => {
    const entries = Array.from({ length: 10 }, (_, index) =>
      entry(`J-${index}`, new Date(Date.UTC(2026, 9, 15 - index, 8)).toISOString())
    );
    const pruned = selectPrunable(entries, { keepDaily: 7, keepWeekly: 4 }).map((e: { tag: string }) => e.tag);
    // Les 7 plus récentes sont conservées, la plus récente jamais supprimée.
    for (const tag of ["J-0", "J-1", "J-2", "J-3", "J-4", "J-5", "J-6"]) {
      expect(pruned).not.toContain(tag);
    }
    expect(pruned.length).toBeGreaterThan(0);
  });

  it("ne décide rien quand il n'y a qu'une seule sauvegarde", () => {
    expect(selectPrunable([entry("seule", "2026-10-15T08:00:00.000Z")], { keepDaily: 1, keepWeekly: 1 })).toEqual([]);
    expect(selectPrunable([], {})).toEqual([]);
  });

  it("conserve la couverture hebdomadaire sur des jours distincts", () => {
    const entries = [
      entry("recente", "2026-10-15T08:00:00.000Z"),
      entry("jour-2", "2026-10-13T08:00:00.000Z"),
      entry("jour-3", "2026-10-11T08:00:00.000Z"),
      entry("jour-4", "2026-10-08T08:00:00.000Z"),
      entry("tres-ancienne", "2026-09-01T08:00:00.000Z"),
    ];
    const pruned = selectPrunable(entries, { keepDaily: 2, keepWeekly: 4 }).map((e: { tag: string }) => e.tag);
    expect(pruned).not.toContain("recente");
    expect(pruned).not.toContain("jour-3");
    expect(pruned).not.toContain("jour-4");
    // Au-delà de la fenêtre hebdomadaire, l'ancienne sauvegarde est bien purgée.
    expect(pruned).toContain("tres-ancienne");
  });

  it("ne confond jamais l'étiquette d'un manifeste avec le répertoire à supprimer", async () => {
    // Un manifeste dont l'étiquette ne correspond pas à son répertoire est
    // anormal — mais la rétention ne doit pas, pour autant, supprimer la
    // sauvegarde d'un autre.
    const root2 = mkdtempSync(join(tmpdir(), "jotoliko-etiquette-"));
    try {
      const { mkdirSync } = await import("node:fs");
      mkdirSync(join(root2, "repertoire-reel"), { recursive: true });
      writeFileSync(
        join(root2, "repertoire-reel", "manifest.json"),
        JSON.stringify({ tag: "etiquette-divergente", createdAt: "2026-10-15T08:00:00.000Z", artifacts: [] })
      );
      const [backup] = await listBackups(root2);
      expect(backup.directory).toBe("repertoire-reel");
      expect(backup.tag).toBe("etiquette-divergente");
    } finally {
      rmSync(root2, { recursive: true, force: true });
    }
  });

  it("liste les sauvegardes présentes, plus récentes d'abord", async () => {
    const backupRoot = mkdtempSync(join(tmpdir(), "jotoliko-liste-"));
    try {
      for (const [tag, createdAt] of [
        ["2026-10-14T0800Z", "2026-10-14T08:00:00.000Z"],
        ["2026-10-15T0800Z", "2026-10-15T08:00:00.000Z"],
      ]) {
        const directory = join(backupRoot, tag);
        const { mkdirSync } = await import("node:fs");
        mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, "manifest.json"), JSON.stringify({ tag, createdAt, artifacts: [] }));
      }
      const listed = await listBackups(backupRoot);
      expect(listed.map((b: { tag: string }) => b.tag)).toEqual(["2026-10-15T0800Z", "2026-10-14T0800Z"]);
      // Le nom de répertoire est publié à part de l'étiquette : c'est lui que la
      // rétention doit supprimer.
      expect(listed.map((b: { directory: string }) => b.directory)).toEqual(["2026-10-15T0800Z", "2026-10-14T0800Z"]);
    } finally {
      rmSync(backupRoot, { recursive: true, force: true });
    }
  });
});

describe("Supervision — décision de disponibilité", () => {
  it("déclare disponible un service dont les deux sondes sont nominales", () => {
    const verdict = evaluateHealth({
      live: { reachable: true, status: 200, body: { status: "ok" } },
      ready: { reachable: true, status: 200, body: { status: "ready", checks: { database: "ok", storage: "ok" } } },
    });
    expect(verdict).toMatchObject({ state: "DISPONIBLE", exitCode: 0 });
  });

  it("distingue « dégradé » de « injoignable »", () => {
    // La distinction commande la réponse : alerter n'est pas intervenir.
    const degrade = evaluateHealth({
      live: { reachable: true, status: 200 },
      ready: { reachable: true, status: 503, body: { status: "degraded", checks: { database: "unreachable", storage: "ok" } } },
    });
    expect(degrade).toMatchObject({ state: "DEGRADE", exitCode: 1 });
    expect(degrade.reason).toContain("database=unreachable");

    const injoignable = evaluateHealth({ live: { reachable: false, error: "ECONNREFUSED" }, ready: { reachable: false } });
    expect(injoignable).toMatchObject({ state: "INDISPONIBLE", exitCode: 2 });
    expect(injoignable.reason).toContain("ECONNREFUSED");
  });

  it("ne déclare jamais disponible sur la seule vivacité", () => {
    // Un processus qui répond mais dont la base est absente ne peut honorer
    // aucune requête métier : la vivacité seule ne suffit pas.
    const verdict = evaluateHealth({
      live: { reachable: true, status: 200 },
      ready: { reachable: true, status: 503, body: { status: "degraded", checks: {} } },
    });
    expect(verdict.exitCode).not.toBe(0);
  });

  it("nomme la raison du retrait du routage (base ou stockage)", () => {
    const stockage = evaluateHealth({
      live: { reachable: true, status: 200 },
      ready: {
        reachable: true,
        status: 503,
        body: { status: "degraded", checks: { database: "ok", storage: "ESPACE_INSUFFISANT" } },
      },
    });
    expect(stockage.reason).toContain("ESPACE_INSUFFISANT");
  });
});

describe("Preuves — plan de purge", () => {
  const row = (id: string, deletedAt: string | null) => ({ id, storageKey: `c/m/${id}.png`, deletedAt });

  it("ne purge que les preuves déjà supprimées avant la date limite", () => {
    const plan = planProofPurge([row("a", "2025-12-01T00:00:00.000Z"), row("b", "2026-06-01T00:00:00.000Z")], {
      before: "2026-01-01",
    });
    expect(plan.deletions.map((d: { id: string }) => d.id)).toEqual(["a"]);
    expect(plan.skipped[0].why).toMatch(/date limite/);
  });

  it("ne touche jamais une preuve active, quelle que soit son ancienneté", () => {
    // Une preuve non supprimée peut encore servir de pièce justificative.
    const plan = planProofPurge([row("active", null)], { before: "2030-01-01" });
    expect(plan.deletions).toEqual([]);
    expect(plan.skipped[0].why).toMatch(/active/);
  });

  it("refuse une date limite illisible plutôt que de purger à l'aveugle", () => {
    const plan = planProofPurge([row("a", "2020-01-01T00:00:00.000Z")], { before: "hier" });
    expect(plan.deletions).toEqual([]);
    expect(plan.problems.join(" ")).toMatch(/date limite invalide/);
  });

  it("exige une date limite : aucune durée de conservation n'est implicite", () => {
    // Décision humaine : le module ne doit pas pouvoir purger sans qu'elle soit
    // fournie explicitement.
    const plan = planProofPurge([row("a", "2020-01-01T00:00:00.000Z")], { before: undefined } as never);
    expect(plan.problems.length).toBeGreaterThan(0);
  });
});

describe("Connexion PostgreSQL — aucun secret dans la ligne de commande", () => {
  const url = "postgresql://sauvegarde:mot-de-passe-secret@base.interne:5433/jotoliko?sslmode=require";

  it("ne met jamais le mot de passe dans les arguments", () => {
    // Un mot de passe en argument est lisible par tout utilisateur de la machine
    // via la table des processus, et se retrouve dans tout journal qui recopie la
    // ligne de commande. Le contrôle est fait sur la ligne entière, pas seulement
    // sur le champ « mot de passe » : c'est la fuite réelle qui est testée.
    const { args } = postgresConnection(url);
    const ligne = args.join(" ");
    expect(ligne).not.toContain("mot-de-passe-secret");
    expect(ligne).not.toContain("sauvegarde:mot-de-passe-secret");
    expect(ligne).not.toContain("@base.interne");
  });

  it("transmet le mot de passe par l'environnement, et conserve le reste", () => {
    const { args, env } = postgresConnection(url);
    expect(env.PGPASSWORD).toBe("mot-de-passe-secret");
    expect(args).toContain("base.interne");
    expect(args).toContain("5433");
    expect(args).toContain("jotoliko");
    expect(args.join(" ")).toContain("sauvegarde");
    // Un `sslmode` exigé ne doit pas être perdu : l'ignorer retenterait une
    // connexion en clair là où le serveur l'interdit.
    expect(env.PGSSLMODE).toBe("require");
  });

  it("vise une autre base lors d'une restauration isolée", () => {
    const { args } = postgresConnection(url, { database: "jotoliko_verif_abc" });
    expect(args[args.length - 1]).toBe("jotoliko_verif_abc");
  });

  it("accepte une URL sans mot de passe (authentification par le système)", () => {
    const { args, env } = postgresConnection("postgresql://localhost:5432/jotoliko");
    expect(env).toEqual({});
    expect(args).toEqual(["--host", "localhost", "--port", "5432", "--dbname", "jotoliko"]);
  });

  it("décode un mot de passe encodé dans l'URL", () => {
    const { env } = postgresConnection("postgresql://u:p%40ss%3Aword@h:5432/d");
    expect(env.PGPASSWORD).toBe("p@ss:word");
  });
});

describe("Sauvegarde — chiffrement des artefacts", () => {
  it.skipIf(!hasOpenssl)("chiffre puis déchiffre un artefact à l'identique", async () => {
    // La même paire d'arguments que celle employée par ops/backup.mjs et
    // ops/restore-verify.mjs : tester une copie de la commande ne prouverait rien.
    const keyFile = join(root, "cle-test");
    writeFileSync(keyFile, "phrase-secrete-de-test", { mode: 0o600 });
    const source = join(root, "a-chiffrer.dump");
    const content = Buffer.from("contenu réel de sauvegarde\n".repeat(50));
    writeFileSync(source, content);

    const encrypted = join(root, "a-chiffrer.dump.enc");
    const plaintext = join(root, "restaure.dump");
    execFileSync("openssl", opensslEncryptArgs(source, encrypted, keyFile));
    execFileSync("openssl", opensslDecryptArgs(encrypted, plaintext, keyFile));

    // Le chiffrement change réellement les octets stockés…
    expect(readFileSync(encrypted).equals(content)).toBe(false);
    // …et la restitution est exacte, octet pour octet.
    expect(readFileSync(plaintext).equals(content)).toBe(true);
    expect(await sha256File(plaintext)).toBe(await sha256File(source));
  });

  it.skipIf(!hasOpenssl)("échoue avec une clé erronée au lieu de produire un fichier silencieusement faux", () => {
    const bonneCle = join(root, "bonne-cle");
    const mauvaiseCle = join(root, "mauvaise-cle");
    writeFileSync(bonneCle, "phrase-secrete-de-test", { mode: 0o600 });
    writeFileSync(mauvaiseCle, "autre-phrase", { mode: 0o600 });
    const source = join(root, "source.dump");
    writeFileSync(source, "contenu");
    const encrypted = join(root, "source.dump.enc");
    execFileSync("openssl", opensslEncryptArgs(source, encrypted, bonneCle));

    expect(() =>
      execFileSync("openssl", opensslDecryptArgs(encrypted, join(root, "mauvais.dump"), mauvaiseCle), { stdio: "ignore" })
    ).toThrow();
  });
});
