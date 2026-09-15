-- Factory & Manufacturing ERP module — standalone from the retail brands
-- (Alia Hijab / Noori). No brand_id anywhere in here; the only bridge to the
-- retail catalog is finished_goods.linked_variant_id, a nullable soft link.
-- See backend/src/db/schema/factory.ts for the typed Drizzle definitions
-- this mirrors.

-- --- enums -------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE work_order_status AS ENUM (
    'draft', 'scheduled', 'in_progress', 'paused', 'completed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE work_order_priority AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE stage_status AS ENUM ('pending', 'in_progress', 'completed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE machine_status AS ENUM ('idle', 'running', 'maintenance', 'down');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE material_movement_type AS ENUM ('receipt', 'issue', 'return', 'adjustment', 'waste');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE finished_goods_movement_type AS ENUM ('production_receipt', 'shipment_out', 'adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE quality_result AS ENUM ('pass', 'fail', 'rework');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --- sequences -----------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS factory_work_order_seq;
CREATE SEQUENCE IF NOT EXISTS factory_material_sku_seq;
CREATE SEQUENCE IF NOT EXISTS factory_finished_good_sku_seq;

-- --- master data: materials, locations, lines, machines, stage templates -

CREATE TABLE IF NOT EXISTS factory_material_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  code VARCHAR(10) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS factory_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  kind VARCHAR(30) NOT NULL DEFAULT 'raw_material',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS raw_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES factory_material_categories(id) ON DELETE RESTRICT,
  name VARCHAR(200) NOT NULL,
  sku VARCHAR(60) NOT NULL UNIQUE,
  unit VARCHAR(20) NOT NULL,
  reorder_level NUMERIC(14, 3) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_raw_materials_category ON raw_materials (category_id);

CREATE TABLE IF NOT EXISTS material_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
  cost_per_unit NUMERIC(14, 4) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'EGP',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_material_costs_active
  ON material_costs (material_id) WHERE effective_to IS NULL;

CREATE TABLE IF NOT EXISTS material_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES factory_locations(id) ON DELETE RESTRICT,
  quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (material_id, location_id)
);

CREATE TABLE IF NOT EXISTS material_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES raw_materials(id) ON DELETE RESTRICT,
  movement_type material_movement_type NOT NULL,
  quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
  from_location_id UUID NULL REFERENCES factory_locations(id) ON DELETE RESTRICT,
  to_location_id UUID NULL REFERENCES factory_locations(id) ON DELETE RESTRICT,
  unit_cost_snapshot NUMERIC(14, 4) NULL,
  reference_type VARCHAR(30) NULL,
  reference_id UUID NULL,
  performed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_material_movement_locations CHECK (
    (movement_type = 'receipt'    AND from_location_id IS NULL     AND to_location_id IS NOT NULL) OR
    (movement_type = 'issue'      AND from_location_id IS NOT NULL AND to_location_id IS NULL) OR
    (movement_type = 'return'     AND from_location_id IS NULL     AND to_location_id IS NOT NULL) OR
    (movement_type = 'waste'      AND from_location_id IS NOT NULL AND to_location_id IS NULL) OR
    (movement_type = 'adjustment')
  )
);
CREATE INDEX IF NOT EXISTS ix_material_stock_movements_material
  ON material_stock_movements (material_id, created_at);
CREATE INDEX IF NOT EXISTS ix_material_stock_movements_reference
  ON material_stock_movements (reference_type, reference_id);

CREATE TABLE IF NOT EXISTS production_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  code VARCHAR(20) NOT NULL UNIQUE,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id UUID NULL REFERENCES production_lines(id) ON DELETE SET NULL,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(30) NOT NULL UNIQUE,
  machine_type VARCHAR(60) NULL,
  status machine_status NOT NULL DEFAULT 'idle',
  purchase_date DATE NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_machines_line ON machines (line_id);

CREATE TABLE IF NOT EXISTS production_stage_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  default_sequence_order INTEGER NOT NULL DEFAULT 0,
  default_line_id UUID NULL REFERENCES production_lines(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --- finished goods + BOM -------------------------------------------------

CREATE TABLE IF NOT EXISTS finished_goods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  sku VARCHAR(60) NOT NULL UNIQUE,
  unit VARCHAR(20) NOT NULL DEFAULT 'piece',
  linked_variant_id UUID NULL REFERENCES product_variants(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_finished_goods_linked_variant ON finished_goods (linked_variant_id);

CREATE TABLE IF NOT EXISTS boms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finished_good_id UUID NOT NULL REFERENCES finished_goods(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  label VARCHAR(100) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  output_quantity NUMERIC(14, 3) NOT NULL DEFAULT 1,
  notes TEXT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (finished_good_id, version)
);

CREATE TABLE IF NOT EXISTS bom_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id UUID NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES raw_materials(id) ON DELETE RESTRICT,
  quantity_per_batch NUMERIC(14, 4) NOT NULL CHECK (quantity_per_batch > 0),
  waste_allowance_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT NULL
);
CREATE INDEX IF NOT EXISTS ix_bom_lines_bom ON bom_lines (bom_id);

CREATE TABLE IF NOT EXISTS bom_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id UUID NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
  stage_template_id UUID NOT NULL REFERENCES production_stage_templates(id) ON DELETE RESTRICT,
  sequence_order INTEGER NOT NULL,
  standard_time_minutes NUMERIC(8, 2) NULL,
  default_line_id UUID NULL REFERENCES production_lines(id) ON DELETE SET NULL,
  UNIQUE (bom_id, sequence_order)
);

-- --- work orders + execution tracking -------------------------------------

CREATE TABLE IF NOT EXISTS work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(20) NOT NULL UNIQUE,
  finished_good_id UUID NOT NULL REFERENCES finished_goods(id) ON DELETE RESTRICT,
  bom_id UUID NOT NULL REFERENCES boms(id) ON DELETE RESTRICT,
  quantity_ordered NUMERIC(14, 3) NOT NULL CHECK (quantity_ordered > 0),
  quantity_completed NUMERIC(14, 3) NOT NULL DEFAULT 0,
  quantity_scrapped NUMERIC(14, 3) NOT NULL DEFAULT 0,
  status work_order_status NOT NULL DEFAULT 'draft',
  priority work_order_priority NOT NULL DEFAULT 'normal',
  line_id UUID NULL REFERENCES production_lines(id) ON DELETE SET NULL,
  planned_start_date DATE NULL,
  planned_end_date DATE NULL,
  actual_start_at TIMESTAMPTZ NULL,
  actual_end_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_work_orders_status ON work_orders (status);
CREATE INDEX IF NOT EXISTS ix_work_orders_finished_good ON work_orders (finished_good_id);

CREATE TABLE IF NOT EXISTS work_order_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  stage_template_id UUID NOT NULL REFERENCES production_stage_templates(id) ON DELETE RESTRICT,
  sequence_order INTEGER NOT NULL,
  line_id UUID NULL REFERENCES production_lines(id) ON DELETE SET NULL,
  machine_id UUID NULL REFERENCES machines(id) ON DELETE SET NULL,
  status stage_status NOT NULL DEFAULT 'pending',
  planned_start_at TIMESTAMPTZ NULL,
  planned_end_at TIMESTAMPTZ NULL,
  actual_start_at TIMESTAMPTZ NULL,
  actual_end_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  UNIQUE (work_order_id, sequence_order)
);
CREATE INDEX IF NOT EXISTS ix_work_order_stages_order ON work_order_stages (work_order_id);

CREATE TABLE IF NOT EXISTS labor_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  stage_id UUID NULL REFERENCES work_order_stages(id) ON DELETE SET NULL,
  worker_name VARCHAR(150) NOT NULL,
  hours_worked NUMERIC(6, 2) NOT NULL CHECK (hours_worked > 0),
  hourly_rate NUMERIC(10, 2) NULL,
  quantity_produced NUMERIC(14, 3) NOT NULL DEFAULT 0,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT NULL,
  logged_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_labor_logs_work_order ON labor_logs (work_order_id);

CREATE TABLE IF NOT EXISTS production_output_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  stage_id UUID NULL REFERENCES work_order_stages(id) ON DELETE SET NULL,
  quantity_good NUMERIC(14, 3) NOT NULL DEFAULT 0,
  quantity_scrap NUMERIC(14, 3) NOT NULL DEFAULT 0,
  scrap_reason VARCHAR(200) NULL,
  recorded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT NULL,
  CONSTRAINT chk_production_output_nonzero CHECK (quantity_good > 0 OR quantity_scrap > 0)
);
CREATE INDEX IF NOT EXISTS ix_production_output_logs_work_order ON production_output_logs (work_order_id);

CREATE TABLE IF NOT EXISTS quality_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  stage_id UUID NULL REFERENCES work_order_stages(id) ON DELETE SET NULL,
  checked_quantity NUMERIC(14, 3) NOT NULL CHECK (checked_quantity > 0),
  passed_quantity NUMERIC(14, 3) NOT NULL,
  failed_quantity NUMERIC(14, 3) NOT NULL,
  result quality_result NOT NULL,
  inspector_notes TEXT NULL,
  checked_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_quality_checks_work_order ON quality_checks (work_order_id);

-- --- finished goods inventory ----------------------------------------------

CREATE TABLE IF NOT EXISTS finished_goods_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finished_good_id UUID NOT NULL REFERENCES finished_goods(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES factory_locations(id) ON DELETE RESTRICT,
  quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (finished_good_id, location_id)
);

CREATE TABLE IF NOT EXISTS finished_goods_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finished_good_id UUID NOT NULL REFERENCES finished_goods(id) ON DELETE RESTRICT,
  movement_type finished_goods_movement_type NOT NULL,
  quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
  from_location_id UUID NULL REFERENCES factory_locations(id) ON DELETE RESTRICT,
  to_location_id UUID NULL REFERENCES factory_locations(id) ON DELETE RESTRICT,
  reference_type VARCHAR(30) NULL,
  reference_id UUID NULL,
  performed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_finished_goods_movements_good ON finished_goods_movements (finished_good_id, created_at);

-- --- starter data: a sensible default set of locations and stage templates,
-- so the module isn't an empty shell the first time someone opens it -------

INSERT INTO factory_locations (name, kind) VALUES
  ('Raw Material Store', 'raw_material'),
  ('Production Floor', 'wip'),
  ('Finished Goods Store', 'finished_goods')
ON CONFLICT (name) DO NOTHING;

INSERT INTO production_stage_templates (name, default_sequence_order) VALUES
  ('Cutting', 10),
  ('Sewing', 20),
  ('Finishing', 30),
  ('Quality Control', 40),
  ('Packing', 50)
ON CONFLICT (name) DO NOTHING;

INSERT INTO factory_material_categories (name, code) VALUES
  ('Fabric', 'FAB'),
  ('Trims & Accessories', 'TRM'),
  ('Packaging', 'PKG'),
  ('Dyes & Chemicals', 'CHM'),
  ('Other', 'OTH')
ON CONFLICT (name) DO NOTHING;
