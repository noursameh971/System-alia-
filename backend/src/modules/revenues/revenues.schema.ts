import { z } from "zod";

export const REVENUE_CATEGORIES = ["product_sales", "wholesale", "shipping_income", "other"] as const;

export type RevenueCategory = (typeof REVENUE_CATEGORIES)[number];

/** YYYY-MM-DD. The column is a DATE, so anything with a time/zone component would be silently truncated — reject it up front instead. */
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()), "Not a real date");

export const createRevenueSchema = z.object({
  brandId: z.string().uuid(),
  source: z.string().trim().min(1, "Source is required").max(200),
  category: z.enum(REVENUE_CATEGORIES),
  amount: z.number().positive("Amount must be greater than 0").max(99_999_999),
  revenueDate: dateOnly,
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type CreateRevenueInput = z.infer<typeof createRevenueSchema>;

/** brandId is intentionally absent: moving revenue between workspaces would silently rewrite two brands' P&L, so it isn't an edit — delete and re-create instead. */
export const updateRevenueSchema = createRevenueSchema
  .omit({ brandId: true })
  .partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one field must be provided",
  });

export type UpdateRevenueInput = z.infer<typeof updateRevenueSchema>;

export const listRevenuesQuerySchema = z.object({
  brandId: z.string().uuid(),
  category: z.enum(REVENUE_CATEGORIES).optional(),
  /** Inclusive bounds, both optional — the Finance page's date range filter. */
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});

export type ListRevenuesQuery = z.infer<typeof listRevenuesQuerySchema>;
