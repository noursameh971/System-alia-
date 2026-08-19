import { z } from "zod";

export const LEDGER_ENTITY_CATEGORIES = ["fabric", "stitching", "packaging", "courier", "other"] as const;
export type LedgerEntityCategory = (typeof LEDGER_ENTITY_CATEGORIES)[number];

export const LEDGER_BALANCE_TYPES = ["payable", "receivable"] as const;
export type LedgerBalanceType = (typeof LEDGER_BALANCE_TYPES)[number];

/** YYYY-MM-DD. The columns are DATE, so anything with a time/zone component would be silently truncated — reject it up front instead. */
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()), "Not a real date");

export const listLedgerEntitiesQuerySchema = z.object({
  brandId: z.string().uuid(),
});

export const cashFlowSummaryQuerySchema = z.object({
  brandId: z.string().uuid(),
});

/**
 * The Opening Balances modal — creates the entity if this is the first time
 * its name has been used for this brand, or attaches a new opening_balance
 * transaction to the existing one. category/balanceType only apply on
 * first creation; see getOrCreateEntity for what happens when they're
 * supplied again for an entity that already has different ones.
 */
export const createOpeningBalanceSchema = z.object({
  brandId: z.string().uuid(),
  entityName: z.string().trim().min(1, "Entity/Supplier name is required").max(200),
  category: z.enum(LEDGER_ENTITY_CATEGORIES),
  balanceType: z.enum(LEDGER_BALANCE_TYPES),
  amount: z.number().positive("Amount must be greater than 0").max(99_999_999),
  dueDate: dateOnly.optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type CreateOpeningBalanceInput = z.infer<typeof createOpeningBalanceSchema>;

/** "Record Payment" on an existing entity's row — the entity (and therefore its brand and direction) is resolved from the :id route param, not from this body. */
export const recordPaymentSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0").max(99_999_999),
  transactionDate: dateOnly.optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
