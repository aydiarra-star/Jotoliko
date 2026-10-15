#!/usr/bin/env node
// Outil de développement local — dérive un substitut de types `@prisma/client`
// depuis le schéma canonique `prisma/schema.prisma`.
//
// Pourquoi : `prisma generate` télécharge un moteur depuis binaries.prisma.sh.
// Dans un environnement sans accès réseau à cet hôte, le client ne peut pas être
// généré, et l'API NestJS n'est donc plus vérifiable du tout (ni compilation,
// ni relecture).
//
// Ce script produit un substitut **dérivé du schéma réel**, donc impossible à
// faire diverger du modèle : les types sont extraits du même fichier que celui
// utilisé en production. Il ne s'exécute que si le vrai client est absent, et il
// n'est jamais utilisé en CI (où `prisma generate` fonctionne).
//
// Usage : node apps/api/scripts/local-prisma-stub.mjs
//
// Limites assumées : les arguments `where`/`data` sont typés structurellement de
// façon permissive. Ce substitut vérifie la compilation du code applicatif, pas
// la validité exacte des requêtes Prisma — celle-ci reste vérifiée en CI par le
// client réel.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const schemaPath = join(repoRoot, "prisma", "schema.prisma");
const targetDir = join(repoRoot, "apps", "api", "node_modules", "@prisma", "client");

const SCALARS = {
  String: "string",
  Int: "number",
  BigInt: "bigint",
  Float: "number",
  Decimal: "number",
  Boolean: "boolean",
  DateTime: "Date",
  Json: "unknown",
  Bytes: "Uint8Array",
};

const source = readFileSync(schemaPath, "utf8");

// --- enums ----------------------------------------------------------------
const enums = [];
for (const match of source.matchAll(/enum\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
  const values = match[2]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//") && !l.startsWith("@@"))
    .map((l) => l.split(/\s+/)[0]);
  if (values.length) enums.push({ name: match[1], values });
}

// --- models ---------------------------------------------------------------
const models = [];
for (const match of source.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
  const name = match[1];
  const body = match[2].replace(/\/\/.*/g, "");
  const mapMatch = body.match(/@@map\("([^"]+)"\)/);
  const fields = [];
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("@@")) continue;
    // champ scalaire : "nom Type?" ou "nom Type @..."
    const scalar = trimmed.match(/^(\w+)\s+(String|Int|BigInt|Float|Decimal|Boolean|DateTime|Json|Bytes)(\[\])?(\?)?/);
    if (scalar) {
      const [, field, type, list, optional] = scalar;
      const base = SCALARS[type];
      fields.push({
        name: field,
        ts: list ? `${base}[]` : optional ? `${base} | null` : base,
        requiredOnCreate: !optional && !list && !/@default|@updatedAt/.test(trimmed),
      });
      continue;
    }
    // champ enum : "nom EnumType?" avec un type déclaré dans le schéma
    const enumField = trimmed.match(/^(\w+)\s+(\w+)(\[\])?(\?)?/);
    if (enumField && enums.some((e) => e.name === enumField[2])) {
      const [, field, type, list, optional] = enumField;
      fields.push({
        name: field,
        ts: list ? `${type}[]` : optional ? `${type} | null` : type,
        requiredOnCreate: !optional && !list && !/@default/.test(trimmed),
      });
    }
    // les champs de relation sont volontairement ignorés : le code applicatif
    // n'utilise jamais `include`.
  }
  models.push({ name, table: mapMatch ? mapMatch[1] : name, fields });
}

const header = `// GÉNÉRÉ AUTOMATIQUEMENT — substitut local de @prisma/client.
import type * as runtime from "@prisma/client/runtime/library";
// Source : prisma/schema.prisma. Ne pas modifier à la main.
// En CI, \`prisma generate\` produit le vrai client et ce fichier est remplacé.
`;

const enumBlocks = enums
  .map(
    (e) => `export const ${e.name} = {
${e.values.map((v) => `  ${v}: "${v}",`).join("\n")}
} as const;
export type ${e.name} = (typeof ${e.name})[keyof typeof ${e.name}];
`
  )
  .join("\n");

const modelBlocks = models
  .map((m) => {
    const typeName = m.name;
    const fields = m.fields.map((f) => `  ${f.name}: ${f.ts};`).join("\n");
    const required = m.fields
      .filter((f) => f.requiredOnCreate)
      .map((f) => `  ${f.name}: ${f.ts.replace(" | null", "")};`)
      .join("\n");
    const optional = m.fields.map((f) => `  ${f.name}?: ${f.ts};`).join("\n");
    return `export type ${typeName} = {
${fields}
};

export type ${typeName}CreateInput = {
${required}
${optional}
};

export type ${typeName}UpdateInput = {
${optional}
};
`;
  })
  .join("\n");

const delegate = (m) => `  ${m.name.charAt(0).toLowerCase()}${m.name.slice(1)}: ModelDelegate<${m.name}>;`;

const runtime = `export type WhereInput = Record<string, unknown>;

export interface ModelDelegate<T> {
  findMany(args?: {
    where?: WhereInput;
    orderBy?: Record<string, unknown> | Record<string, unknown>[];
    take?: number;
    skip?: number;
    cursor?: Record<string, unknown>;
    select?: Record<string, unknown>;
    distinct?: unknown;
  }): Promise<T[]>;
  findFirst(args?: { where?: WhereInput; orderBy?: unknown; select?: unknown }): Promise<T | null>;
  findUnique(args: { where: WhereInput; select?: unknown }): Promise<T | null>;
  count(args?: { where?: WhereInput }): Promise<number>;
  create(args: { data: Record<string, unknown>; select?: unknown }): Promise<T>;
  createMany(args: { data: Record<string, unknown>[] | Record<string, unknown>; skipDuplicates?: boolean }): Promise<{ count: number }>;
  update(args: { where: WhereInput; data: Record<string, unknown>; select?: unknown }): Promise<T>;
  updateMany(args: { where?: WhereInput; data: Record<string, unknown> }): Promise<{ count: number }>;
  upsert(args: { where: WhereInput; create: Record<string, unknown>; update: Record<string, unknown> }): Promise<T>;
  delete(args: { where: WhereInput }): Promise<T>;
  deleteMany(args?: { where?: WhereInput }): Promise<{ count: number }>;
  aggregate(args?: Record<string, unknown>): Promise<Record<string, unknown>>;
  groupBy(args?: Record<string, unknown>): Promise<unknown[]>;
}

export class PrismaClient {
${models.map(delegate).join("\n")}
  $transaction<R>(fn: (tx: TransactionClient) => Promise<R>): Promise<R>;
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Promise<T>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Promise<number>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  $on(event: string, callback: (...args: unknown[]) => void): void;
  $extends(extension: unknown): PrismaClient;
}

export type TransactionClient = Omit<PrismaClient, "$transaction" | "$connect" | "$disconnect" | "$on" | "$use" | "$extends">;

type PrismaClientCtor = new (options?: unknown) => PrismaClient;

/**
 * Espace de noms Prisma. Comme le client reel, il porte a la fois des types
 * (Prisma.Sql) et des valeurs (Prisma.sql, Prisma.raw, Prisma.join).
 * Un simple objet exporte ne suffirait pas : Prisma.Sql est un TYPE.
 */
export namespace Prisma {
  /**
   * La surface SQL brute est reprise TELLE QUELLE du runtime Prisma réel
   * (@prisma/client/runtime/library), qui est livré avec le paquet et disponible
   * hors ligne. La dériver plutôt que la réécrire évite exactement le piège
   * rencontré : un substitut trop permissif laissait passer l'API de CI qui
   * refusait, elle, une chaîne brute ou un fragment mal typé.
   */
  export type Sql = runtime.Sql;
  export type RawValue = runtime.RawValue;
  export type PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError;
  /** Client transmis au rappel de $transaction (voir Prisma.TransactionClient). */
  export type TransactionClient = Omit<
    import("./index").PrismaClient,
    "$transaction" | "$connect" | "$disconnect" | "$on" | "$extends" | "$queryRaw" | "$executeRaw"
  > & Pick<import("./index").PrismaClient, "$queryRaw" | "$executeRaw">;
  export const PrismaClient: PrismaClientCtor;
  export const sql: typeof runtime.sqltag;
  export const raw: typeof runtime.raw;
  export const join: typeof runtime.join;
  export const empty: runtime.Sql;
}

export type PrismaClientKnownRequestError = Error & { code?: string };
`;

const output = `${header}\n${enumBlocks}\n${modelBlocks}\n${runtime}`;

if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
writeFileSync(join(targetDir, "index.d.ts"), output, "utf8");
writeFileSync(
  join(targetDir, "index.js"),
  "// Substitut local : l'exécution réelle nécessite le client généré par Prisma.\n" +
    "class PrismaClient {\n" +
    models.map((m) => `  ${m.name.charAt(0).toLowerCase()}${m.name.slice(1)}: any;`).join("\n") +
    "\n}\nmodule.exports = { PrismaClient, Prisma: { PrismaClient } };\n",
  "utf8"
);
writeFileSync(
  join(targetDir, "package.json"),
  JSON.stringify({ name: "@prisma/client", version: "0.0.0-local-stub", main: "index.js", types: "index.d.ts" }, null, 2),
  "utf8"
);
// Prisma's own default path lookup expects .prisma/client.
const dotPrisma = join(repoRoot, "apps", "api", "node_modules", ".prisma", "client");
mkdirSync(dotPrisma, { recursive: true });
writeFileSync(join(dotPrisma, "index.js"), "module.exports = require('@prisma/client');\n", "utf8");
writeFileSync(join(dotPrisma, "index.d.ts"), `export * from "@prisma/client";\n`, "utf8");
writeFileSync(
  join(dotPrisma, "package.json"),
  JSON.stringify({ name: ".prisma/client", main: "index.js", types: "index.d.ts" }, null, 2),
  "utf8"
);

console.log(
  `Substitut @prisma/client écrit depuis prisma/schema.prisma : ` +
    `${models.length} modèles, ${enums.length} énumérations.`
);
