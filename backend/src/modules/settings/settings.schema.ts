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

/** Settings > Danger Zone — the client makes the user type this exact word; re-validated server-side so the destructive action can never be triggered by a bare/scripted API call. */
export const resetDataSchema = z.object({
  confirmation: z.literal("RESET", { message: 'Type "RESET" to confirm' }),
});

export type ResetDataInput = z.infer<typeof resetDataSchema>;
