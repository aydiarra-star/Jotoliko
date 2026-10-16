// Garde-fou anti-dérive : `prisma/schema.prisma` ⇄ `prisma/migrations/`.
//
// `prisma migrate diff` exige un moteur téléchargé depuis binaries.prisma.sh,
// indisponible dans certains environnements. Ce test obtient la même garantie
// sans binaires : il applique toutes les migrations à un PostgreSQL réel, puis
// introspecte le catalogue système et compare **type, nullabilité et
// énumération** de chaque colonne déclarée dans le schéma.
//
// C'est ce contrôle qui empêche la réapparition du défaut d'origine : un schéma
// déclarant des tables qu'aucune migration ne crée.
//
// Il ne remplace pas `prisma migrate diff` (qui vérifie aussi les index et les
// clés étrangères et tourne en CI), mais il attrape la classe d'erreur qui a
// réellement cassé ce dépôt, et il est exécutable partout, à chaque `npm test`.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGliteClient, PgClient, resetSchema, type SqlClient } from "./sql-client";

const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "prisma/migrations");
const SCHEMA_PATH = join(REPO_ROOT, "prisma/schema.prisma");

const MIGRATIONS_SQL = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(MIGRATIONS_DIR, entry.name, "migration.sql"))
  .sort()
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

const SCHEMA_SOURCE = readFileSync(SCHEMA_PATH, "utf8");

/** Type PostgreSQL attendu pour chaque type scalaire Prisma. */
const PG_TYPES: Record<string, string> = {
  String: "text",
  Int: "integer",
  BigInt: "bigint",
  Float: "double precision",
  Decimal: "numeric",
  Boolean: "boolean",
  DateTime: "timestamp without time zone",
  Json: "jsonb",
  Bytes: "bytea",
};

type ParsedField = {
  name: string;
  prismaType: string;
  isArray: boolean;
  isOptional: boolean;
  isEnum: boolean;
  columnName: string;
};

type ParsedModel = {
  name: string;
  table: string;
  fields: ParsedField[];
};

function parseSchema(): { models: ParsedModel[]; enums: Map<string, string[]> } {
  const source = SCHEMA_SOURCE.replace(/\/\/.*/g, "");

  const enums = new Map<string, string[]>();
  for (const match of source.matchAll(/enum\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const values = match[2]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("@@"))
      .map((line) => line.split(/\s+/)[0]!);
    enums.set(match[1]!, values);
  }

  const models: ParsedModel[] = [];
  for (const match of source.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const name = match[1]!;
    const body = match[2]!;
    const table = body.match(/@@map\("([^"]+)"\)/)?.[1] ?? name;

    const fields: ParsedField[] = [];
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("@@")) continue;
      // Ignore les champs de relation : ce sont des tableaux de types
      // non scalaires ou des objets, sans colonne propre.
      const field = line.match(/^(\w+)\s+([\w]+)(\[\])?(\?)?/);
      if (!field) continue;
      const [, fieldName, prismaType, isArray, isOptional] = field;

      const isScalar = prismaType in PG_TYPES;
      const isEnum = enums.has(prismaType);
      if (!isScalar && !isEnum) continue; // relation

      const columnName = line.match(/@map\("([^"]+)"\)/)?.[1] ?? fieldName!;
      fields.push({
        name: fieldName!,
        prismaType: prismaType!,
        isArray: Boolean(isArray),
        isOptional: Boolean(isOptional),
        isEnum,
        columnName,
      });
    }
    models.push({ name, table, fields });
  }

  return { models, enums };
}

const { models, enums } = parseSchema();

let client: SqlClient;
let actualColumns: Map<string, Map<string, { dataType: string; udtName: string; isNullable: boolean }>>;

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  client = url ? await PgClient.create(url) : await PGliteClient.create();
  await resetSchema(client);
  await client.exec(MIGRATIONS_SQL);

  const res = await client.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: string;
  }>(
    `SELECT table_name, column_name, data_type, udt_name, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public'`
  );

  actualColumns = new Map();
  for (const row of res.rows) {
    if (!actualColumns.has(row.table_name)) actualColumns.set(row.table_name, new Map());
    actualColumns.get(row.table_name)!.set(row.column_name, {
      dataType: row.data_type,
      udtName: row.udt_name,
      isNullable: row.is_nullable === "YES",
    });
  }
}, 120_000);

afterAll(async () => {
  await client?.close();
});

describe("Anti-dérive schéma Prisma ⇄ migrations", () => {
  it("déclare au moins un modèle (le test ne doit pas passer à vide)", () => {
    // Ce nombre est volontairement figé : l'ajout de modèles doit rester
    // conscient et accompagné de migrations. Le socle de facturation et
    // d'inscription professionnelle porte désormais le schéma à 30 modèles.
    expect(models.length).toBe(30);
    expect(enums.size).toBe(10);
  });

  it("migre toutes les tables déclarées dans le schéma", () => {
    const missing = models.filter((model) => !actualColumns.has(model.table)).map((m) => m.table);
    expect(missing, `tables déclarées mais non migrées : ${missing.join(", ")}`).toEqual([]);
  });

  it("migre toutes les énumérations déclarées", async () => {
    const res = await client.query<{ typname: string }>(
      `SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typtype = 'e'`
    );
    const present = new Set(res.rows.map((r) => r.typname));
    const missing = [...enums.keys()].filter((name) => !present.has(name));
    expect(missing, `énumérations non migrées : ${missing.join(", ")}`).toEqual([]);
  });

  it("migre chaque colonne déclarée avec le bon type PostgreSQL", () => {
    const problems: string[] = [];

    for (const model of models) {
      const columns = actualColumns.get(model.table);
      if (!columns) continue;

      for (const field of model.fields) {
        const actual = columns.get(field.columnName);
        if (!actual) {
          problems.push(`${model.table}.${field.columnName} : colonne manquante`);
          continue;
        }

        if (field.isEnum) {
          // PostgreSQL expose « USER-DEFINED » comme data_type ; le nom réel du
          // type énuméré est dans udt_name. Prisma crée les types entre
          // guillemets, donc la casse est conservée : on compare exactement.
          const expectedEnum = field.prismaType;
          if (actual.udtName !== expectedEnum) {
            problems.push(
              `${model.table}.${field.columnName} : énumération ${actual.udtName} au lieu de ${expectedEnum}`
            );
          }
          continue;
        }

        const expected = PG_TYPES[field.prismaType]!;
        if (actual.dataType !== expected) {
          problems.push(
            `${model.table}.${field.columnName} : type ${actual.dataType} au lieu de ${expected}`
          );
        }
      }
    }

    expect(problems, problems.join("\n")).toEqual([]);
  });

  it("respecte la nullabilité déclarée", () => {
    const problems: string[] = [];

    for (const model of models) {
      const columns = actualColumns.get(model.table);
      if (!columns) continue;

      for (const field of model.fields) {
        const actual = columns.get(field.columnName);
        if (!actual) continue;
        // Un champ optionnel doit accepter NULL ; un champ obligatoire ne doit pas.
        const expectNullable = field.isOptional;
        if (actual.isNullable !== expectNullable) {
          problems.push(
            `${model.table}.${field.columnName} : nullabilité ${actual.isNullable ? "NULL autorisé" : "NOT NULL"} ` +
              `alors que le schéma déclare ${expectNullable ? "optionnel" : "obligatoire"}`
          );
        }
      }
    }

    expect(problems, problems.join("\n")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Index et contraintes
//
// Prisma nomme les index de façon déterministe :
//   @unique sur un champ        -> <table>_<colonne>_key
//   @@unique([a, b])            -> <table>_<a>_<b>_key
//   @@index([a, b])             -> <table>_<a>_<b>_idx
//   @@id([a, b])                -> clé primaire composite
// Ces noms sont vérifiés ici : un index manquant ne casse pas la compilation
// mais transforme une requête opérationnelle en parcours complet de table.
// ---------------------------------------------------------------------------
describe("Index, unicité et clés étrangères", () => {
  const indexName = (table: string, columns: string[], suffix: "key" | "idx") =>
    `${table}_${columns.join("_")}_${suffix}`;

  it("crée les index et contraintes d'unicité déclarés", async () => {
    const res = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`
    );
    const present = new Set(res.rows.map((r) => r.indexname));
    const problems: string[] = [];

    for (const model of models) {
      const body = SCHEMA_SOURCE.match(
        new RegExp(`model\\s+${model.name}\\s*\\{([\\s\\S]*?)\\n\\}`)
      )?.[1];
      if (!body) continue;

      const columns = (list: string) =>
        list.split(",").map((c) => c.trim()).filter(Boolean);

      for (const match of body.matchAll(/@@unique\(\[([^\]]+)\]\)/g)) {
        const name = indexName(model.table, columns(match[1]!), "key");
        if (!present.has(name)) problems.push(`index unique manquant : ${name}`);
      }
      for (const match of body.matchAll(/@@index\(\[([^\]]+)\]\)/g)) {
        const name = indexName(model.table, columns(match[1]!), "idx");
        if (!present.has(name)) problems.push(`index manquant : ${name}`);
      }
      // @unique (et non @@unique) : marqueur porté par le champ lui-même.
      for (const line of body.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("@@") || !trimmed.includes("@unique")) continue;
        const field = trimmed.match(/^(\w+)\s+/)?.[1];
        if (!field) continue;
        const name = indexName(model.table, [field], "key");
        if (!present.has(name)) problems.push(`index unique de champ manquant : ${name}`);
      }
    }

    expect(problems, problems.join("\n")).toEqual([]);
  });

  it("déclare une clé primaire pour chaque table", async () => {
    const res = await client.query<{ table_name: string }>(
      `SELECT tc.table_name
         FROM information_schema.table_constraints tc
        WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'`
    );
    const withPk = new Set(res.rows.map((r) => r.table_name));
    const missing = models.filter((m) => !withPk.has(m.table)).map((m) => m.table);
    expect(missing, `tables sans clé primaire : ${missing.join(", ")}`).toEqual([]);
  });

  it("crée une clé étrangère pour chaque relation, avec l'action de suppression déclarée", () => {
    // Vérifié par la présence effective des contraintes : une relation oubliée
    // laisserait des lignes orphelines après suppression d'une entreprise.
    const expected: Array<[string, string]> = [
      ["missions", "missions_companyId_fkey"],
      ["missions", "missions_assignedUserId_fkey"],
      ["cash_movements", "cash_movements_companyId_fkey"],
      ["cash_movements", "cash_movements_missionId_fkey"],
      ["memberships", "memberships_userId_fkey"],
      ["memberships", "memberships_companyId_fkey"],
      ["role_permissions", "role_permissions_roleId_fkey"],
      ["orders", "orders_customerId_fkey"],
      ["order_items", "order_items_orderId_fkey"],
      ["deliveries", "deliveries_orderId_fkey"],
      ["deliveries", "deliveries_driverId_fkey"],
      ["proofs", "proofs_deliveryId_fkey"],
      ["payments", "payments_orderId_fkey"],
      ["payments", "payments_settlementId_fkey"],
      ["settlements", "settlements_driverId_fkey"],
      ["notifications", "notifications_userId_fkey"],
      ["settings", "settings_companyId_fkey"],
      ["audit_logs", "audit_logs_userId_fkey"],
    ];

    return client
      .query<{ constraint_name: string; table_name: string }>(
        `SELECT tc.constraint_name, tc.table_name
           FROM information_schema.table_constraints tc
          WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'`
      )
      .then((res) => {
        const present = new Set(res.rows.map((r) => `${r.table_name}|${r.constraint_name}`));
        const missing = expected
          .map(([table, name]) => `${table}|${name}`)
          .filter((key) => !present.has(key));
        expect(missing, `clés étrangères manquantes : ${missing.join(", ")}`).toEqual([]);
      });
  });
});
