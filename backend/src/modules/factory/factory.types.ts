import type { PgTransaction } from "drizzle-orm/pg-core";

/** Shared across every factory sub-module's *Tx helpers — same shape as products.service.ts's Tx. */
export type Tx = PgTransaction<any, any, any>;
