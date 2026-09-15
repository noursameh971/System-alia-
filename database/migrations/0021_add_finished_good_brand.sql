-- Links each Factory finished good to a retail brand (Noori, Alia Hijab, ...)
-- so the factory can organize/manufacture across multiple brands. Nullable:
-- existing finished goods predate this column and must keep working with it
-- unset; the create form requires picking a brand going forward.
-- See backend/src/db/schema/factory.ts for the typed Drizzle definition.

ALTER TABLE finished_goods
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_finished_goods_brand ON finished_goods(brand_id);
