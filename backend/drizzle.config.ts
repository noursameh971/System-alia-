import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Note: database/schema.sql (repo root) is the canonical, hand-authored
// migration for the initial schema — it was reviewed and validated in Step 1.
// This config lets drizzle-kit manage *future* incremental migrations against
// the same database, generated from the TypeScript schema in src/db/schema.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "../database/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
