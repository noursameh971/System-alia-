import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env.js";
import * as schema from "./schema/index.js";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  // Errors on idle clients — log and let the pool recover; a crashed
  // process here would take down every in-flight request unnecessarily.
  console.error("Unexpected PostgreSQL pool error", err);
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;
