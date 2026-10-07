import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env.js";
import * as schema from "./schema/index.js";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  // Managed Postgres on Render/Railway requires TLS, and presents a
  // certificate chain that isn't in Node's default trust store when
  // connected to from outside their own network — hence
  // rejectUnauthorized: false rather than a plain `ssl: true`. Gated on
  // NODE_ENV=production so a local Postgres install (no TLS listener at
  // all) is unaffected; see docs/DEPLOYMENT.md.
  ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

pool.on("error", (err) => {
  // Errors on idle clients — log and let the pool recover; a crashed
  // process here would take down every in-flight request unnecessarily.
  console.error("Unexpected PostgreSQL pool error", err);
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;

/** The handle a transaction callback receives — same query API as `db`. */
export type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Either the pool or an open transaction. Services that accept one let a
 * caller fold their write into a larger transaction (e.g. the assistant's
 * confirm step, which must record the expense and mark its action executed
 * atomically); `executor.transaction()` on a transaction becomes a
 * savepoint, so the service's own all-or-nothing guarantee still holds.
 */
export type DbExecutor = Database | DbTransaction;
