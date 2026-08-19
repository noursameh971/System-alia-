import { z } from "zod";

/** The "+ New Workspace" modal — creates a brand with the exact same lazily-created shared taxonomy (categories, warehouses, attributes) every other brand already uses, so it needs no seed data beyond this row. */
export const createBrandSchema = z.object({
  name: z.string().trim().min(1, "Workspace name is required").max(100),
  code: z
    .string()
    .trim()
    .min(2, "Code must be 2-10 letters/numbers")
    .max(10, "Code must be 2-10 letters/numbers")
    .regex(/^[A-Za-z0-9]+$/, "Code can only contain letters and numbers"),
});

export type CreateBrandInput = z.infer<typeof createBrandSchema>;

/** The Settings page's "Brand Profile" tab. */
export const updateBrandProfileSchema = z
  .object({
    name: z.string().trim().min(1, "Business name is required").max(100).optional(),
    /** Empty string explicitly clears the notes; omit the field to leave it untouched — same convention as products.imageUrl. */
    receiptNotes: z.string().trim().max(2000).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one field must be provided",
  });

export type UpdateBrandProfileInput = z.infer<typeof updateBrandProfileSchema>;
