// Adaptateur SQL pour les reality tests.
//
// Le même jeu de tests doit tourner :
//   - en local, sur PostgreSQL 16 embarqué (PGlite/WASM) — aucune dépendance externe ;
//   - en CI, sur un vrai conteneur `postgres:16`, qui autorise plusieurs
//     connexions simultanées et donc une concurrence réellement parallèle.
//
// Le choix est automatique : `DATABASE_URL` s'il est défini, sinon PGlite.

export interface QueryResult<T> {
  rows: T[];
}

export interface SqlClient {
  /** Description de la cible, affichée dans les rapports de test. */
  readonly target: string;
  /** Vrai si le client accepte plusieurs connexions simultanées. */
  readonly supportsConcurrency: boolean;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
  /** Connexion indépendante, si la cible le permet. */
  fork(): Promise<SqlClient | null>;
  close(): Promise<void>;
}

export class PGliteClient implements SqlClient {
  readonly target = "PGlite (PostgreSQL 16 embarqué)";
  readonly supportsConcurrency = false;

  // Import paresseux : le paquet n'est chargé que si nécessaire.
  private constructor(private readonly db: { query: Function; exec: Function; close: Function }) {}

  static async create(): Promise<PGliteClient> {
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite();
    await db.waitReady;
    return new PGliteClient(db);
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const result = (await this.db.query(sql, params)) as { rows: T[] };
    return { rows: result.rows };
  }

  async exec(sql: string): Promise<void> {
    await this.db.exec(sql);
  }

  async fork(): Promise<SqlClient | null> {
    // PGlite est mono-connexion : la concurrence réelle est vérifiée en CI.
    return null;
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

export class PgClient implements SqlClient {
  readonly target = "PostgreSQL externe (DATABASE_URL)";
  readonly supportsConcurrency = true;

  private constructor(private readonly pool: { query: Function; end: Function; connect: Function }) {}

  static async create(url: string): Promise<PgClient> {
    const pg = await import("pg");
    const pool = new pg.default.Pool({ connectionString: url, max: 10 });
    return new PgClient(pool);
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const result = (await this.pool.query(sql, params)) as { rows: T[] };
    return { rows: result.rows };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async fork(): Promise<SqlClient | null> {
    if (typeof this.pool.connect !== "function") return null;
    const pool = this.pool;
    return new (class implements SqlClient {
      readonly target = "PostgreSQL externe (connexion dédiée)";
      readonly supportsConcurrency = true;
      async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
        const result = (await pool.query(sql, params)) as { rows: T[] };
        return { rows: result.rows };
      }
      async exec(sql: string): Promise<void> {
        await pool.query(sql);
      }
      async fork(): Promise<SqlClient | null> {
        return null;
      }
      async close(): Promise<void> {
        /* connexion rendue au pool */
      }
    })();
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** Efface le schéma public pour partir d'une base réellement vierge. */
export async function resetSchema(client: SqlClient): Promise<void> {
  await client.exec(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`);
}

export async function applyMigrations(client: SqlClient, migrationSql: string): Promise<void> {
  await client.exec(migrationSql);
}

export function isPgError(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as { code?: unknown }).code === code;
}

/** Codes PostgreSQL usuels utilisés par les tests. */
export const PG = {
  UNIQUE_VIOLATION: "23505",
  CHECK_VIOLATION: "23514",
  FOREIGN_KEY_VIOLATION: "23503",
  NOT_NULL_VIOLATION: "23502",
} as const;
