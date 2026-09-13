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

/** "Add New Bill / Invoice" on the Supplier Detail page — same shape as recordPaymentSchema plus an optional due date, mirroring the opening-balance flow's charge fields. */
export const createChargeSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0").max(99_999_999),
  transactionDate: dateOnly.optional(),
  dueDate: dateOnly.optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type CreateChargeInput = z.infer<typeof createChargeSchema>;

/**
 * "Edit Supplier Info" on the Supplier Detail page. balanceType is
 * deliberately not editable here — see getOrCreateEntity's comment on why
 * flipping payable/receivable after the fact would retroactively change
 * what every past transaction meant.
 */
export const updateLedgerEntitySchema = z.object({
  name: z.string().trim().min(1, "Entity/Supplier name is required").max(200).optional(),
  category: z.enum(LEDGER_ENTITY_CATEGORIES).optional(),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type UpdateLedgerEntityInput = z.infer<typeof updateLedgerEntitySchema>;

/**
 * Editing (or adjusting) one existing ledger_transactions row from the
 * Supplier Detail page's history table. kind is deliberately not editable —
 * a charge silently becoming a payment (or vice versa) would corrupt what
 * Total Billed/Amount Paid mean without anything about the row visibly
 * changing.
 */
export const updateLedgerTransactionSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0").max(99_999_999).optional(),
  transactionDate: dateOnly.optional(),
  dueDate: dateOnly.nullable().optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type UpdateLedgerTransactionInput = z.infer<typeof updateLedgerTransactionSchema>;
