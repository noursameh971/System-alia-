/**
 * Runs hand-authored SQL migrations from database/migrations/ against
 * DATABASE_URL, through the backend's own connection pool — the same thing
 * `psql "$DATABASE_URL" -f <file>` does, for machines without psql.
 *
 * Usage:
 *   cd backend
 *   npm run db:apply -- 0023_add_expense_categories.sql 0024_add_ai_assistant.sql
 *
 * Files run in the order given, each as one batch (like psql -f), and the
 * run stops at the first failure. There's no applied-migrations table in
 * this project, so this doesn't track what has already run: only pass files
 * that are safe to re-run (IF NOT EXISTS / DROP IF EXISTS), or that you know
 * haven't been applied yet.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../db/client.js";

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../database/migrations");

async function main(): Promise<void> {
  const names = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (names.length === 0) {
    console.error("Usage: npm run db:apply -- <migration file> [more files...]   (names from database/migrations/)");
    process.exitCode = 1;
    return;
  }

  // Resolve and read every file before touching the database, so a typo in
  // the third name doesn't leave the first two applied and the rest not.
  const files = names.map((name) => {
    const file = path.join(MIGRATIONS_DIR, path.basename(name));
    if (!fs.existsSync(file)) throw new Error(`No such migration: ${path.basename(name)} (looked in ${MIGRATIONS_DIR})`);
    return { name: path.basename(file), sql: fs.readFileSync(file, "utf8") };
  });

  console.log(`Database: ${new URL(process.env.DATABASE_URL ?? "").hostname}`);
  for (const file of files) {
    process.stdout.write(`Applying ${file.name} ... `);
    await pool.query(file.sql);
    console.log("done");
  }
}

main()
  .catch((err: unknown) => {
    console.log("FAILED");
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
