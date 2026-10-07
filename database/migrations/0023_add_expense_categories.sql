-- Two new expense buckets, added for the admin assistant (which otherwise
-- has nowhere to put "2000 EGP for the lawyer" except misc) and equally
-- usable from the Finance page's Add Expense modal:
--
--   professional_fees — lawyers, accountants, consultants, registration fees.
--   logistics         — moving goods between factory/warehouse/suppliers.
--                       NOT per-order customer shipping: that's derived from
--                       orders.shipping_fee (see expenses.service.ts
--                       getFinanceSummary), so recording it here too would
--                       double-count it in Total Expenses.
--
-- BEFORE 'misc' keeps the catch-all last in the enum's sort order.
--
-- ALTER TYPE ... ADD VALUE must run as its own statement, not batched with
-- other DDL/DML in the same transaction — this file contains nothing else
-- (same reasoning as 0018_add_gift_movement_type.sql). psql -f runs each
-- statement in its own implicit transaction, so the two below are fine.
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'professional_fees' BEFORE 'misc';
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'logistics' BEFORE 'misc';
