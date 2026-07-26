import { ApiError } from "./apiError.js";

const POSTGRES_UNIQUE_VIOLATION = "23505";

function pgErrorCode(err: unknown): string | undefined {
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
