-- Supplier Detail page: contact phone number for a ledger entity, shown and
-- editable on the per-supplier statement page. Nullable — most historical
-- entities (couriers, opening balances) never had one.

ALTER TABLE ledger_entities ADD COLUMN IF NOT EXISTS phone VARCHAR(50) NULL;
