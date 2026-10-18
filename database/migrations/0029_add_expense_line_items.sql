-- Itemized breakdown for an expense (e.g. Marketing 30,000 = Editor 5,000 +
-- Studio 20,000 + Photographer 5,000). Stored inline as a JSONB array of
-- {"description": text, "amount": number} rather than a child table: the
-- items are only ever read and written together with their expense, never
-- queried or aggregated on their own. An empty array means "no breakdown".
-- When non-empty, expenses.amount equals the items' sum — enforced in
-- expenses.service.ts, which is the only writer.
--
-- Safe to re-run.

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS line_items JSONB NOT NULL DEFAULT '[]'::jsonb;
