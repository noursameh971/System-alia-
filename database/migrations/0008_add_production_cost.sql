-- Financial & Profit Analysis Engine: production cost per variant (mirrors
-- variant_prices' history-tracked pattern exactly — only one active,
-- effective_to IS NULL, row per variant at a time) and a cost-at-sale
-- snapshot per order item (mirrors unit_price_at_sale), so profit can still
-- be computed correctly for historical orders even after a variant's
-- production cost later changes.

CREATE TABLE IF NOT EXISTS variant_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  cost NUMERIC(10, 2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'EGP',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_variant_costs_active ON variant_costs (variant_id) WHERE effective_to IS NULL;

-- NOT NULL DEFAULT 0 (not nullable) — a missing production cost is simply
-- "not tracked yet" and should contribute 0 to COGS/profit math everywhere
-- without null-checks, same reasoning as shipping_fee's default in 0007.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cost_at_sale NUMERIC(10, 2) NOT NULL DEFAULT 0;
