-- Extends chk_movement_bins to accept the new 'gift' movement_type from
-- migration 0018. Split into its own file/transaction: referencing a
-- just-added enum value (even as a literal in a CHECK expression) can't
-- happen in the same transaction as the ALTER TYPE ... ADD VALUE that
-- created it.
--
-- Same bin shape as 'outbound': a gift leaves from a source bin, no
-- destination bin — see 0005_relax_return_movement_bin_constraint.sql for
-- the constraint's other clauses, all preserved here unchanged.
--
-- Safe to re-run: DROP IF EXISTS + re-ADD always converges to the same
-- constraint regardless of starting state.

ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS chk_movement_bins;

ALTER TABLE stock_movements ADD CONSTRAINT chk_movement_bins CHECK (
    (movement_type = 'inbound'   AND from_bin_id IS NULL     AND to_bin_id IS NOT NULL) OR
    (movement_type = 'outbound'  AND from_bin_id IS NOT NULL AND to_bin_id IS NULL) OR
    (movement_type = 'transfer'  AND from_bin_id IS NOT NULL AND to_bin_id IS NOT NULL) OR
    (movement_type = 'return_in' AND from_bin_id IS NULL) OR
    (movement_type = 'gift'      AND from_bin_id IS NOT NULL AND to_bin_id IS NULL) OR
    (movement_type = 'adjustment')
);
