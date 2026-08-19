-- Orders: payment method (COD/Online) and a per-order shipping fee, both
-- needed by the redesigned Orders page's "+ New Order" modal and table.
-- Neither existed before; order totals were purely sum(item subtotals).

DO $$ BEGIN
  CREATE TYPE order_payment_method AS ENUM ('cod', 'online');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method order_payment_method NOT NULL DEFAULT 'cod';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(10, 2) NOT NULL DEFAULT 0;
