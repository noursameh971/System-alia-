-- Finance & Expenses page: operating expenses recorded by hand, alongside
-- the COGS/shipping the system already derives from orders. Deliberately
-- brand-scoped (not global) — each workspace runs its own P&L, and the
-- Finance page lives at /[workspace]/finance.

-- Fashion-brand expense categories. A fixed enum rather than a lookup table:
-- these six are the reporting buckets the breakdown chart is built around,
-- and a free-text category would let typos silently fragment a bucket.
DO $$ BEGIN
  CREATE TYPE expense_category AS ENUM (
    'marketing',
    'salaries',
    'production',
    'packaging',
    'rent',
    'misc'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Separate from order_payment_method ('cod'/'online'): how a *customer* pays
-- for an order and how the *business* pays a bill are different domains, and
-- conflating them would put "cash on delivery" in a rent-payment dropdown.
DO $$ BEGIN
  CREATE TYPE expense_payment_method AS ENUM (
    'cash',
    'bank_transfer',
    'card',
    'instapay',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  category expense_category NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'EGP',
  payment_method expense_payment_method NOT NULL DEFAULT 'cash',
  -- DATE, not TIMESTAMPTZ: an expense belongs to a calendar day for
  -- reporting, and a timezone-shifted timestamp would move a late-evening
  -- expense into the next month's totals.
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_url TEXT NULL,
  notes TEXT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every read path is "this brand's expenses, newest first" (the table) or
-- "this brand's expenses grouped by month" (the chart) — both lead with
-- brand_id and order by date.
CREATE INDEX IF NOT EXISTS ix_expenses_brand_date ON expenses (brand_id, expense_date DESC);
