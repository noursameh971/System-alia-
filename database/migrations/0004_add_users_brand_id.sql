-- Step 7 (Auth & RBAC): warehouse_staff accounts are locked to a single
-- brand workspace; admins stay unscoped (brand_id NULL = "all brands").
-- ON DELETE RESTRICT: a brand with staff assigned can't be deleted out from
-- under them by accident.

ALTER TABLE users
  ADD COLUMN brand_id UUID NULL REFERENCES brands(id) ON DELETE RESTRICT;

CREATE INDEX users_brand_id_idx ON users (brand_id);
