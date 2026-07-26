import { and, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { inventory } from "./schema/index.js";
import { ApiError } from "../utils/apiError.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = PgTransaction<any, any, any>;

/**
 * Atomically adds `quantity` to a (variant, bin)'s on-hand count, creating
 * the inventory row if it doesn't exist yet (e.g. first inbound to a bin).
 *
 * Concurrency: this is a single INSERT ... ON CONFLICT DO UPDATE statement.
 * Postgres executes the conflict check and the update in one atomic step —
 * if two of these run concurrently for the same (variant_id, bin_id), the
 * second one blocks on the row lock the first takes, then applies its own
 * `quantity + $delta` against the *already-updated* value once the first
 * commits. Neither request can read a stale quantity and overwrite the
 * other's change (no lost update), and no separate SELECT-then-UPDATE
 * round trip exists for a race to slip into.
 */
export async function incrementInventory(
  tx: Tx,
  params: { variantId: string; binId: string; quantity: number },
): Promise<number> {
  const { variantId, binId, quantity } = params;

  const [row] = await tx
    .insert(inventory)
    .values({ variantId, binId, quantity })
    .onConflictDoUpdate({
      target: [inventory.variantId, inventory.binId],
      set: {
        quantity: sql`${inventory.quantity} + ${quantity}`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ quantity: inventory.quantity });

  if (!row) throw new Error("Inventory upsert returned no row"); // unreachable
  return row.quantity;
}

/**
 * Atomically subtracts `quantity` from a (variant, bin)'s on-hand count.
 *
 * Concurrency & overselling: the guard (`quantity >= $requested`) lives in
 * the same UPDATE statement as the subtraction, not in application code.
 * Postgres locks the target row for the duration of the statement; a second
 * concurrent decrement against the same row waits for the first to commit,
 * then re-evaluates its own WHERE clause against the now-updated row before
 * applying. So if two requests race to take the last 5 units, one succeeds
 * (row lands at 0) and the other's WHERE clause fails against that fresh
 * value — it matches zero rows and this function throws a 409, rather than
 * either request reading a stale "5 available" and driving the count
 * negative. This is why the check is a SQL WHERE clause and not a
 * `SELECT quantity` followed by an `if` in TypeScript — that two-step
 * version has a window between the read and the write where a concurrent
 * request can slip in.
 */
export async function decrementInventory(
  tx: Tx,
  params: { variantId: string; binId: string; quantity: number },
): Promise<number> {
  const { variantId, binId, quantity } = params;

  const [row] = await tx
    .update(inventory)
    .set({
      quantity: sql`${inventory.quantity} - ${quantity}`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(inventory.variantId, variantId),
        eq(inventory.binId, binId),
        sql`${inventory.quantity} >= ${quantity}`,
      ),
    )
    .returning({ quantity: inventory.quantity });

  if (row) return row.quantity;

  // 0 rows affected: either the row doesn't exist, or it exists with too
  // little stock. Look it up (outside any lock — the transaction is about
  // to abort anyway) purely to give a precise error message.
  const [existing] = await tx
    .select({ quantity: inventory.quantity })
    .from(inventory)
    .where(and(eq(inventory.variantId, variantId), eq(inventory.binId, binId)))
    .limit(1);

  throw ApiError.conflict("Insufficient stock in the source bin", {
    variantId,
    binId,
    requested: quantity,
    available: existing?.quantity ?? 0,
  });
}
