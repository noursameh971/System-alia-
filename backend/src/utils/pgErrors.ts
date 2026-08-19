import { ApiError } from "./apiError.js";

const POSTGRES_UNIQUE_VIOLATION = "23505";
/**
 * Postgres raises two different SQLSTATEs depending on which side of a FK
 * relationship trips: 23503 (foreign_key_violation) for an insert/update
 * referencing a row that doesn't exist, and 23001 (restrict_violation)
 * specifically when an ON DELETE RESTRICT blocks a delete because a
 * dependent row still points at it. Deleting a variant that has stock
 * movements or order history is the RESTRICT case, so callers checking for
 * "this delete is blocked by dependent rows" need both codes.
 */
export const POSTGRES_FOREIGN_KEY_VIOLATION_CODES = ["23503", "23001"] as const;

/** Extracts the raw Postgres error code (e.g. "23505") from a thrown drizzle/pg error, if there is one. */
export function pgErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  // drizzle-orm's node-postgres driver wraps the raw pg error in a
  // DrizzleQueryError, so the `code` Postgres actually sets lives on
  // `.cause`, not on the thrown error itself.
  const candidate = "cause" in err ? err.cause : err;
  if (typeof candidate !== "object" || candidate === null || !("code" in candidate)) return undefined;
  return (candidate as { code?: unknown }).code as string | undefined;
}

/** Runs `fn`, translating a Postgres unique-constraint violation into a clean 409 instead of a raw 500. */
export async function withUniqueConstraint<T>(message: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (pgErrorCode(err) === POSTGRES_UNIQUE_VIOLATION) {
      throw ApiError.conflict(message);
    }
    throw err;
  }
}
