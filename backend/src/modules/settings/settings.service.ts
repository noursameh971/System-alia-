import { asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { appSettings, shippingRates } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import type { UpdateSettingsInput, UpsertShippingRateInput } from "./settings.schema.js";

export interface AppSettingsResult {
  lowStockThreshold: number;
  defaultCurrency: string;
  dateFormat: string;
  defaultLanguage: string;
}

/**
 * Always operates on the single row seeded by migration 0009 — get-or-create
 * defensively (rather than assuming a fixed id) in case that row is ever
 * missing, e.g. a database restored from a pre-0009 backup.
 */
async function getSettingsRow() {
  const [row] = await db.select().from(appSettings).limit(1);
  if (row) return row;
  const [created] = await db.insert(appSettings).values({}).returning();
  return created!;
}

export async function getSettings(): Promise<AppSettingsResult> {
  const row = await getSettingsRow();
  return {
    lowStockThreshold: row.lowStockThreshold,
    defaultCurrency: row.defaultCurrency,
    dateFormat: row.dateFormat,
    defaultLanguage: row.defaultLanguage,
  };
}

export async function updateSettings(input: UpdateSettingsInput): Promise<AppSettingsResult> {
  const row = await getSettingsRow();
  const [updated] = await db
    .update(appSettings)
    .set({ ...input, updatedAt: sql`now()` })
    .where(eq(appSettings.id, row.id))
    .returning();
  return {
    lowStockThreshold: updated!.lowStockThreshold,
    defaultCurrency: updated!.defaultCurrency,
    dateFormat: updated!.dateFormat,
    defaultLanguage: updated!.defaultLanguage,
  };
}

export interface ShippingRateResult {
  id: string;
  brandId: string;
  city: string;
  rate: number;
}

export async function listShippingRates(brandId?: string): Promise<ShippingRateResult[]> {
  const rows = await db
    .select()
    .from(shippingRates)
    .where(brandId ? eq(shippingRates.brandId, brandId) : undefined)
    .orderBy(asc(shippingRates.city));
  return rows.map((r) => ({ id: r.id, brandId: r.brandId, city: r.city, rate: Number(r.rate) }));
}

/** Insert-or-update by (brandId, city) — backs the Inventory & Operations tab's shipping-rate row editor. */
export async function upsertShippingRate(input: UpsertShippingRateInput): Promise<ShippingRateResult> {
  const [row] = await db
    .insert(shippingRates)
    .values({ brandId: input.brandId, city: input.city.trim(), rate: input.rate.toFixed(2) })
    .onConflictDoUpdate({
      target: [shippingRates.brandId, shippingRates.city],
      set: { rate: input.rate.toFixed(2), updatedAt: sql`now()` },
    })
    .returning();
  return { id: row!.id, brandId: row!.brandId, city: row!.city, rate: Number(row!.rate) };
}

export async function deleteShippingRate(id: string): Promise<void> {
  const [deleted] = await db.delete(shippingRates).where(eq(shippingRates.id, id)).returning({ id: shippingRates.id });
  if (!deleted) throw ApiError.notFound(`No shipping rate with id ${id}`);
}
