-- Suppliers & Debts Ledger: historical/opening balances plus ongoing charges
-- and payments against named entities (suppliers, factories, couriers,
-- clients). Distinct from `expenses`: expenses are operating costs already
-- paid; ledger entries track money owed in *either direction* that hasn't
-- necessarily been settled yet, and feed the Accounts Payable / Accounts
-- Receivable / Net Cash Flow KPI cards.

DO $$ BEGIN
  CREATE TYPE ledger_entity_category AS ENUM (
    'fabric',
    'stitching',
    'packaging',
    'courier',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- payable: we owe this entity (a fabric/stitching/packaging supplier).
-- receivable: this entity owes us (a courier holding COD, or a client).
DO $$ BEGIN
  CREATE TYPE ledger_balance_type AS ENUM ('payable', 'receivable');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ledger_transaction_kind AS ENUM (
    'opening_balance',
    'charge',
    'payment'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ledger_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  category ledger_entity_category NOT NULL DEFAULT 'other',
  balance_type ledger_balance_type NOT NULL,
  notes TEXT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One entity per (brand, name) case-insensitively — lets the Opening
-- Balances flow and the Excel importer upsert by name instead of minting a
-- duplicate supplier every time the same name is entered again.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_entities_brand_name
  ON ledger_entities (brand_id, lower(name));

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES ledger_entities(id) ON DELETE CASCADE,
  -- Denormalized from ledger_entities.brand_id: lets the cash-flow summary
  -- aggregate transactions with a single indexed WHERE instead of a join,
  -- the same tradeoff `expenses.brand_id` already makes.
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  kind ledger_transaction_kind NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NULL,
  notes TEXT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ledger_transactions_entity
  ON ledger_transactions (entity_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS ix_ledger_transactions_brand
  ON ledger_transactions (brand_id);
