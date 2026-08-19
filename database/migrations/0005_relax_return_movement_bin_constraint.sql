-- Loosens chk_movement_bins so a return_in movement can omit to_bin_id —
-- backs the Inventory page's new "Return" flow: when the scanned item's
-- condition is Damaged/Lost, it's logged as a pure audit entry and never
-- restocked, so there's no bin to record. from_bin_id stays disallowed for
-- return_in either way (a return never has a "from" bin — it enters from
-- outside the warehouse, not another bin).
--
-- Safe to re-run: DROP IF EXISTS + re-ADD always converges to the same
-- constraint regardless of starting state.

ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS chk_movement_bins;

ALTER TABLE stock_movements ADD CONSTRAINT chk_movement_bins CHECK (
    (movement_type = 'inbound'   AND from_bin_id IS NULL     AND to_bin_id IS NOT NULL) OR
    (movement_type = 'outbound'  AND from_bin_id IS NOT NULL AND to_bin_id IS NULL) OR
    (movement_type = 'transfer'  AND from_bin_id IS NOT NULL AND to_bin_id IS NOT NULL) OR
    (movement_type = 'return_in' AND from_bin_id IS NULL) OR
    (movement_type = 'adjustment')
);
