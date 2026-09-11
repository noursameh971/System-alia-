-- Finance page: hand-recorded revenue, alongside the order-derived revenue
-- the system already computes from order_items.subtotal. This table is for
-- income that never became an Order row (a wholesale invoice, an in-person
-- or DM sale, etc.) — brand-scoped, mirroring expenses (0010_add_expenses.sql).

-- Fixed reporting buckets, same reasoning as expense_category: free text
-- would let typos fragment a bucket.
DO $$ BEGIN
  CREATE TYPE revenue_category AS ENUM (
    'product_sales',
    'wholesale',
    'shipping_income',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS revenues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  source VARCHAR(200) NOT NULL,
  category revenue_category NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'EGP',
  -- DATE, not TIMESTAMPTZ: revenue belongs to a calendar day for reporting,
  -- same reasoning as expenses.expense_date.
  revenue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every read path is "this brand's revenue, newest first" or grouped by
-- month — both lead with brand_id and order by date.
CREATE INDEX IF NOT EXISTS ix_revenues_brand_date ON revenues (brand_id, revenue_date DESC);
