import { z } from "zod";

/** The Settings page's "General & Localization" + "Inventory & Operations" tabs — one combined single-row settings object. */
export const updateSettingsSchema = z
  .object({
    lowStockThreshold: z.number().int().min(0, "Threshold can't be negative").max(100_000),
    defaultCurrency: z.string().trim().length(3, "Use a 3-letter currency code, e.g. EGP"),
    dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]),
    defaultLanguage: z.enum(["en", "ar"]),
  })
  .partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one field must be provided",
  });

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/** The Inventory & Operations tab's "Default Shipping Rates per city" list — insert-or-update by (brandId, city). */
export const upsertShippingRateSchema = z.object({
  brandId: z.string().uuid(),
  city: z.string().trim().min(1, "City is required").max(100),
  rate: z.number().min(0, "Rate can't be negative"),
});

export type UpsertShippingRateInput = z.infer<typeof upsertShippingRateSchema>;

export const listShippingRatesQuerySchema = z.object({
  brandId: z.string().uuid().optional(),
});

export type ListShippingRatesQuery = z.infer<typeof listShippingRatesQuerySchema>;
