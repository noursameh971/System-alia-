-- Lets an expense optionally represent a payment toward a specific
-- supplier's payable balance (e.g. "paid 40,000 EGP to Al-Sabaie Fabrics"
-- recorded as both an operating expense AND a ledger payment that reduces
-- their Remaining Balance). ledger_transaction_id points at the
-- ledger_transactions row (kind='payment') that this expense created, so
-- editing/deleting the expense can keep that row in sync instead of leaving
-- an orphaned or stale payment behind.

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS ledger_entity_id UUID NULL REFERENCES ledger_entities(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS ledger_transaction_id UUID NULL REFERENCES ledger_transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_expenses_ledger_entity ON expenses (ledger_entity_id);
