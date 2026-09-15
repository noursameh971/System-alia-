-- Inventory page's new "Gift" (هدية) batch-scan tab: items given away for
-- free leave the warehouse the same way an outbound sale does (stock
-- decrements from a source bin, no destination bin), but tagged with its
-- own movement_type so it's never conflated with a real sale in the
-- Recent Movements Log or any future reporting.
--
-- ALTER TYPE ... ADD VALUE must run as its own statement, not batched with
-- other DDL/DML in the same transaction — this file contains nothing else.
ALTER TYPE movement_type ADD VALUE IF NOT EXISTS 'gift';
