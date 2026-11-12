import { DOUBLE_AUCTION_SCHEMA } from "@/experiments/double-auction/server/schema";
import { EMH_SCHEMA } from "@/experiments/emh/server/schema";
import { JUDGMENT_SCHEMA } from "@/experiments/judgment/server/schema";
import { REGISTRY_SCHEMA } from "./experiment-schema";
import { EVOLUTION_SCHEMA } from "@/experiments/evolution/server/schema";
import { timed } from "./performance";
import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";
import { Pool as PgPool, Client as PgClient } from "pg";

export interface Sql {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}
export interface Database {
  mode: "local" | "online";
  query: Sql["query"];
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  listen?(
    onChange: (payload: string) => void,
    onError: () => void,
  ): Promise<() => Promise<void>>;
}

export const SCHEMA = [
  ...DOUBLE_AUCTION_SCHEMA,
  ...EMH_SCHEMA,
  ...JUDGMENT_SCHEMA,
  ...EVOLUTION_SCHEMA,
  ...REGISTRY_SCHEMA,
];

export function localDatabase(pg: PGlite): Database {
  return {
    mode: "local",
    query: (sql, params) => pg.query(sql, params),
    transaction: (fn) => pg.transaction((tx) => fn(tx)),
    listen: (onChange) => pg.listen("auction_changes", onChange),
  };
}

export function assertLocalDatabaseUrl(url: string) {
  const parsed = new URL(url);
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
  )
    throw new Error("Local testing requires a loopback PostgreSQL URL");
}

function postgresListener(url: string): NonNullable<Database["listen"]> {
  return async (onChange, onError) => {
    const client = new PgClient({
      connectionString: url,
      connectionTimeoutMillis: 8000,
    });
    let closed = false;
    client.on("notification", (message) => {
      if (message.channel === "auction_changes" && message.payload)
        onChange(message.payload);
    });
    client.on("error", () => {
      if (!closed) onError();
    });
    client.on("end", () => {
      if (!closed) onError();
    });
    try {
      await client.connect();
      await client.query("LISTEN auction_changes");
    } catch (error) {
      closed = true;
      await client.end().catch(() => {});
      throw error;
    }
    return async () => {
      closed = true;
      await client.end().catch(() => {});
    };
  };
}

export function postgresDatabase(url: string) {
  assertLocalDatabaseUrl(url);
  const pool = new PgPool({
    connectionString: url,
    max: 20,
    connectionTimeoutMillis: 8000,
  });
  const db: Database & { close(): Promise<void> } = {
    mode: "local",
    query: (sql, params) => timed("db.read", () => pool.query(sql, params)),
    async transaction<T>(fn: (tx: Sql) => Promise<T>) {
      const client = await timed("db.pool_wait", () => pool.connect());
      try {
        await client.query("BEGIN");
        await client.query(
          "SELECT set_config('lock_timeout', '8s', true), set_config('statement_timeout', '15s', true)",
        );
        const result = await timed("db.transaction_body", () => fn(client));
        await timed("db.commit", () => client.query("COMMIT"));
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    listen: postgresListener(url),
    close: () => pool.end(),
  };
  return db;
}

const globals = globalThis as typeof globalThis & {
  auctionDatabase?: Promise<Database>;
};

async function open(): Promise<Database> {
  let db: Database;
  if (process.env.LOCAL_DATABASE_URL) {
    if (process.env.VERCEL)
      throw new Error("LOCAL_DATABASE_URL cannot be used on Vercel");
    db = postgresDatabase(process.env.LOCAL_DATABASE_URL);
  } else if (process.env.DATABASE_URL) {
    if (process.env.LOCAL_ONLY === "1")
      throw new Error("DATABASE_URL is disabled in LOCAL_ONLY mode");
    neonConfig.webSocketConstructor = ws;
    const url = process.env.DATABASE_URL;
    const http = neon(url);
    db = {
      mode: "online",
      // LISTEN needs a direct connection, never a transaction-pooler connection.
      ...(process.env.REALTIME_DATABASE_URL
        ? { listen: postgresListener(process.env.REALTIME_DATABASE_URL) }
        : {}),
      query: async <T extends Record<string, unknown>>(
        sql: string,
        params?: unknown[],
      ) => ({ rows: (await http.query(sql, params ?? [])) as T[] }),
      async transaction<T>(fn: (tx: Sql) => Promise<T>) {
        // A request-scoped connection must not outlive a serverless invocation.
        const pool = new Pool({
          connectionString: url,
          connectionTimeoutMillis: 10_000,
          max: 1,
        });
        try {
          const client = await timed("db.pool_wait", () => pool.connect());
          try {
            await client.query("BEGIN");
            await client.query("SET LOCAL lock_timeout = '8s'");
            await client.query("SET LOCAL statement_timeout = '15s'");
            const result = await timed("db.transaction_body", () => fn(client));
            await timed("db.commit", () => client.query("COMMIT"));
            return result;
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          } finally {
            client.release();
          }
        } finally {
          await pool.end();
        }
      },
    };
  } else {
    if (process.env.VERCEL)
      throw new Error("DATABASE_URL is required on Vercel");
    const { PGlite } = await import("@electric-sql/pglite");
    // Local data is created at runtime; it must never be traced into a deployment.
    const dir = path.resolve(
      /* turbopackIgnore: true */ process.env.PGLITE_DATA_DIR ||
        ".data/auction",
    );
    await mkdir(path.dirname(dir), { recursive: true });
    db = localDatabase(new PGlite(dir));
  }
  await migrate(db);
  return db;
}

export async function migrate(db: Database) {
  await db.transaction(async (tx) => {
    // Concurrent cold starts must not race CREATE TABLE in the system catalogs.
    await tx.query("SELECT pg_advisory_xact_lock(21433, 1)");
    for (const statement of SCHEMA) await tx.query(statement);
  });
}

export function database(): Promise<Database> {
  globals.auctionDatabase ??= open().catch((error) => {
    globals.auctionDatabase = undefined;
    throw error;
  });
  return globals.auctionDatabase;
}

export async function databaseTime(tx: Sql) {
  const result = await tx.query<{ now: string }>(
    "SELECT (extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now",
  );
  return Number(result.rows[0].now);
}
