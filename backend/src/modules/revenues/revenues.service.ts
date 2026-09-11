import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { revenues } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import type { CreateRevenueInput, ListRevenuesQuery, RevenueCategory, UpdateRevenueInput } from "./revenues.schema.js";

export interface RevenueRecord {
  id: string;
  brandId: string;
  source: string;
  category: RevenueCategory;
  amount: number;
  currency: string;
  revenueDate: string;
  notes: string | null;
  createdAt: string;
}

function toRecord(row: typeof revenues.$inferSelect): RevenueRecord {
  return {
    id: row.id,
    brandId: row.brandId,
    source: row.source,
    category: row.category,
    amount: Number(row.amount),
    currency: row.currency,
    revenueDate: row.revenueDate,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listRevenues(query: ListRevenuesQuery): Promise<RevenueRecord[]> {
  const filters = [eq(revenues.brandId, query.brandId)];
  if (query.category) filters.push(eq(revenues.category, query.category));
  if (query.from) filters.push(gte(revenues.revenueDate, query.from));
  if (query.to) filters.push(lte(revenues.revenueDate, query.to));

  const rows = await db
    .select()
    .from(revenues)
    .where(and(...filters))
    .orderBy(desc(revenues.revenueDate), desc(revenues.createdAt));

  return rows.map(toRecord);
}

export async function createRevenue(input: CreateRevenueInput, actorUserId: string): Promise<RevenueRecord> {
  const [created] = await db
    .insert(revenues)
    .values({
      brandId: input.brandId,
      source: input.source,
      category: input.category,
      amount: input.amount.toFixed(2),
      revenueDate: input.revenueDate,
      notes: input.notes?.trim() || null,
      createdBy: actorUserId,
    })
    .returning();

  return toRecord(created!);
}

export async function updateRevenue(id: string, input: UpdateRevenueInput): Promise<RevenueRecord> {
  const [updated] = await db
    .update(revenues)
    .set({
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.amount !== undefined ? { amount: input.amount.toFixed(2) } : {}),
      ...(input.revenueDate !== undefined ? { revenueDate: input.revenueDate } : {}),
      ...(input.notes !== undefined ? { notes: input.notes.trim() || null } : {}),
      updatedAt: sql`now()`,
    })
    .where(eq(revenues.id, id))
    .returning();

  if (!updated) throw ApiError.notFound("Revenue not found");
  return toRecord(updated);
}

export async function deleteRevenue(id: string): Promise<void> {
  const [deleted] = await db.delete(revenues).where(eq(revenues.id, id)).returning({ id: revenues.id });
  if (!deleted) throw ApiError.notFound("Revenue not found");
}

/** Used by requireBrandAccess-style checks on :id routes, where the brand isn't in the URL. */
export async function getRevenueBrandId(id: string): Promise<string> {
  const [row] = await db.select({ brandId: revenues.brandId }).from(revenues).where(eq(revenues.id, id)).limit(1);
  if (!row) throw ApiError.notFound("Revenue not found");
  return row.brandId;
}
