-- Admin "Revert / Undo" for the Inventory page's Recent Movements Log.
-- See revertMovements in backend/src/modules/stock-movements/stockMovements.service.ts.
--
-- A revert never edits or deletes the original movement. It records a new,
-- inverse movement (reversal_of_id points back at the original) and stamps
-- the original with reverted_at/reverted_by, so the audit trail keeps both.
-- The unique index makes a second reversal of the same movement impossible
-- even if two requests race.

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS reverted_by UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reversal_of_id UUID NULL REFERENCES stock_movements(id);

CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_reversal_of_id_key ON stock_movements(reversal_of_id);
