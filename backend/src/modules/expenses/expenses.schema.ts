import { z } from "zod";

export const EXPENSE_CATEGORIES = [
  "marketing",
  "salaries",
  "production",
  "packaging",
  "rent",
  "misc",
] as const;

export const EXPENSE_PAYMENT_METHODS = ["cash", "bank_transfer", "card", "instapay", "other"] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

/** YYYY-MM-DD. The column is a DATE, so anything with a time/zone component would be silently truncated — reject it up front instead. */
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()), "Not a real date");

export const createExpenseSchema = z.object({
  brandId: z.string().uuid(),
  title: z.string().trim().min(1, "Title is required").max(200),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().positive("Amount must be greater than 0").max(99_999_999),
  paymentMethod: z.enum(EXPENSE_PAYMENT_METHODS).default("cash"),
  expenseDate: dateOnly,
  receiptUrl: z.string().trim().max(2000).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

/** brandId is intentionally absent: moving an expense between workspaces would silently rewrite two brands' P&L, so it isn't an edit — delete and re-create instead. */
export const updateExpenseSchema = createExpenseSchema
  .omit({ brandId: true })
  .partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one field must be provided",
  });

export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const listExpensesQuerySchema = z.object({
  brandId: z.string().uuid(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  /** Inclusive bounds, both optional — the Finance page's date range filter. */
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});

export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;

export const financeSummaryQuerySchema = z.object({
  brandId: z.string().uuid(),
});
