-- Opening Balances modal: an optional receipt/invoice image attached to the
-- transaction, uploaded from the local device instead of a pasted URL (see
-- backend/src/modules/uploads). Nullable — every existing row, and most new
-- ones, will never have one.

ALTER TABLE ledger_transactions ADD COLUMN IF NOT EXISTS receipt_url TEXT NULL;
