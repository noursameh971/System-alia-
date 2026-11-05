-- Optional per-brand starting position for the Finance page's Balance
-- Sheet: the real bank/cash balance and the owner's starting capital as of
-- a given day. See backend/src/modules/statements/statements.service.ts.
--
-- as_of_date: the day the starting cash balance was true. Recorded flows on
-- or after it are added to starting_cash; earlier flows are assumed to be
-- already reflected in it. NULL means "before the first record", i.e. every
-- recorded flow is added.

CREATE TABLE IF NOT EXISTS brand_opening_balances (
  brand_id UUID PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE,
  starting_cash NUMERIC(14, 2) NOT NULL DEFAULT 0,
  owner_capital NUMERIC(14, 2) NOT NULL DEFAULT 0,
  as_of_date DATE NULL,
  updated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
