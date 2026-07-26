-- Step 6 addition: default reason codes so the Returns UI (and future
-- adjustment/movement UIs) have something to select from out of the box.
-- Idempotent via ON CONFLICT — safe to re-run.

INSERT INTO reason_codes (code, label, applies_to) VALUES
  ('CUSTOMER_CHANGED_MIND', 'Customer changed their mind', 'return'),
  ('WRONG_ITEM', 'Wrong item shipped', 'return'),
  ('SIZE_FIT_ISSUE', 'Wrong size / fit', 'return'),
  ('DAMAGED', 'Damaged or defective', 'both'),
  ('QUALITY_ISSUE', 'Quality issue', 'both'),
  ('STOCK_COUNT_CORRECTION', 'Physical count correction', 'stock_movement'),
  ('OTHER', 'Other', 'both')
ON CONFLICT (code) DO NOTHING;
