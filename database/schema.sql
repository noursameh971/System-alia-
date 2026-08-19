-- ============================================================================
-- Multi-Brand Inventory & Order Management System
-- Database: PostgreSQL
-- Step 1: Core schema (Brands, Catalog, Variants, Warehouse, Inventory,
--         Stock Movements, Orders, Returns, Pricing, Users/RBAC)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE user_role AS ENUM ('admin', 'warehouse_staff');
CREATE TYPE product_status AS ENUM ('active', 'draft', 'discontinued');
CREATE TYPE variant_status AS ENUM ('active', 'discontinued');
CREATE TYPE movement_type AS ENUM ('inbound', 'outbound', 'transfer', 'return_in', 'adjustment');
CREATE TYPE reason_scope AS ENUM ('stock_movement', 'return', 'both');
CREATE TYPE order_status AS ENUM ('pending', 'processing', 'shipped', 'delivered', 'cancelled');
CREATE TYPE return_disposition AS ENUM ('restock', 'write_off');

-- ============================================================================
-- USERS & RBAC
-- ============================================================================

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name       VARCHAR(150) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role            user_role NOT NULL DEFAULT 'warehouse_staff',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- BRANDS
-- ============================================================================

CREATE TABLE brands (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL UNIQUE,      -- 'Alia Hijab', 'Noori'
    code            VARCHAR(10) NOT NULL UNIQUE,        -- 'ALH', 'NOO' (used in SKU generation)
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- CATALOG: Categories, Products, Attributes, Variants
-- ============================================================================

-- Categories are shared taxonomy across brands (enables cross-brand reporting
-- by category), while each product still belongs to exactly one brand.
CREATE TABLE categories (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(100) NOT NULL UNIQUE,
    code                VARCHAR(10) NOT NULL UNIQUE,   -- used in SKU generation
    parent_category_id  UUID NULL REFERENCES categories(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A "product" is the style-level parent (e.g., "Classic Chiffon Hijab").
-- Every product is brand-exclusive.
CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id        UUID NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
    category_id     UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    status          product_status NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (brand_id, name)
);

CREATE INDEX idx_products_brand ON products(brand_id);
CREATE INDEX idx_products_category ON products(category_id);

-- Variant dimensions (Color, Size, Material today; extensible without migration).
CREATE TABLE attributes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(50) NOT NULL UNIQUE   -- 'Color', 'Size', 'Material'
);

CREATE TABLE attribute_values (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attribute_id    UUID NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
    value           VARCHAR(50) NOT NULL,          -- 'Black', 'M', 'Chiffon'
    code            VARCHAR(10) NOT NULL,           -- short code for SKU, e.g. 'BLK', 'M', 'CHF'
    UNIQUE (attribute_id, value)
);

-- A variant is the sellable unit: one specific combination of attribute values
-- for a given product (e.g., Classic Chiffon Hijab / Black / M).
CREATE TABLE product_variants (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku                 VARCHAR(60) NOT NULL UNIQUE,   -- auto-generated: BRAND-CATEGORY-SEQ-ATTR1-ATTR2...
    qr_code_value       VARCHAR(100) NOT NULL UNIQUE,   -- payload encoded in the printed QR (defaults to sku)
    status              variant_status NOT NULL DEFAULT 'active',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_variants_product ON product_variants(product_id);

-- Junction: which attribute values make up this variant.
-- NOTE: uniqueness of the *combination* per product (no two variants of the
-- same product may share the exact same set of attribute values) is enforced
-- at the application layer when generating the SKU, since PostgreSQL cannot
-- natively express "unique set of rows" without a computed signature column.
CREATE TABLE variant_attribute_values (
    variant_id          UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    attribute_value_id  UUID NOT NULL REFERENCES attribute_values(id) ON DELETE RESTRICT,
    PRIMARY KEY (variant_id, attribute_value_id)
);

-- ============================================================================
-- PRICING (versioned — past orders keep their historical price)
-- ============================================================================

CREATE TABLE variant_prices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id      UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    price           NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    currency        CHAR(3) NOT NULL DEFAULT 'EGP',
    effective_from  TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_to    TIMESTAMPTZ NULL,               -- NULL = currently active price
    created_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_variant_prices_variant ON variant_prices(variant_id);

-- Only one active (effective_to IS NULL) price per variant at a time.
CREATE UNIQUE INDEX uq_variant_prices_active
    ON variant_prices(variant_id)
    WHERE effective_to IS NULL;

-- ============================================================================
-- WAREHOUSE: Warehouse -> Zone -> Bin (single shared warehouse today,
-- structure supports adding more locations later)
-- ============================================================================

CREATE TABLE warehouses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    address         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE warehouse_zones (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id    UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    code            VARCHAR(20) NOT NULL,          -- e.g. 'A', 'B'
    name            VARCHAR(100),
    UNIQUE (warehouse_id, code)
);

CREATE TABLE warehouse_bins (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id         UUID NOT NULL REFERENCES warehouse_zones(id) ON DELETE CASCADE,
    code            VARCHAR(20) NOT NULL,          -- e.g. 'A3'
    UNIQUE (zone_id, code)
);

-- ============================================================================
-- INVENTORY (current on-hand quantity per variant per bin)
-- ============================================================================

CREATE TABLE inventory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id      UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    bin_id          UUID NOT NULL REFERENCES warehouse_bins(id) ON DELETE RESTRICT,
    quantity        INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (variant_id, bin_id)
);

CREATE INDEX idx_inventory_variant ON inventory(variant_id);
CREATE INDEX idx_inventory_bin ON inventory(bin_id);

-- ============================================================================
-- STOCK MOVEMENTS (full audit trail: inbound, outbound, transfer, return, adjustment)
-- ============================================================================

CREATE TABLE reason_codes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(30) NOT NULL UNIQUE,   -- 'DAMAGED', 'WRONG_ITEM', 'CUSTOMER_CHANGED_MIND'
    label           VARCHAR(100) NOT NULL,
    applies_to      reason_scope NOT NULL DEFAULT 'both',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stock_movements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id      UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    movement_type   movement_type NOT NULL,
    quantity        INTEGER NOT NULL CHECK (quantity > 0),
    from_bin_id     UUID NULL REFERENCES warehouse_bins(id) ON DELETE RESTRICT,
    to_bin_id       UUID NULL REFERENCES warehouse_bins(id) ON DELETE RESTRICT,
    reason_code_id  UUID NULL REFERENCES reason_codes(id) ON DELETE RESTRICT,
    reference_type  VARCHAR(30) NULL,              -- 'order', 'return', 'manual', 'purchase'
    reference_id    UUID NULL,                      -- polymorphic pointer, no FK (app-enforced)
    performed_by    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_movement_bins CHECK (
        (movement_type = 'inbound'   AND from_bin_id IS NULL     AND to_bin_id IS NOT NULL) OR
        (movement_type = 'outbound'  AND from_bin_id IS NOT NULL AND to_bin_id IS NULL) OR
        (movement_type = 'transfer'  AND from_bin_id IS NOT NULL AND to_bin_id IS NOT NULL) OR
        (movement_type = 'return_in' AND from_bin_id IS NULL     AND to_bin_id IS NOT NULL) OR
        (movement_type = 'adjustment')
    )
);

CREATE INDEX idx_stock_movements_variant ON stock_movements(variant_id);
CREATE INDEX idx_stock_movements_created_at ON stock_movements(created_at);
CREATE INDEX idx_stock_movements_reference ON stock_movements(reference_type, reference_id);

-- ============================================================================
-- ORDERS & RETURNS
-- ============================================================================

CREATE TABLE orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id            UUID NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
    order_number        VARCHAR(50) NOT NULL UNIQUE,
    customer_name       VARCHAR(150),
    customer_phone      VARCHAR(30),
    customer_address    TEXT,
    status              order_status NOT NULL DEFAULT 'pending',
    order_date          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_brand ON orders(brand_id);
CREATE INDEX idx_orders_order_date ON orders(order_date);

CREATE TABLE order_items (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id                UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id              UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    quantity                INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_at_sale      NUMERIC(10,2) NOT NULL CHECK (unit_price_at_sale >= 0), -- snapshot from variant_prices
    subtotal                NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price_at_sale) STORED,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_variant ON order_items(variant_id);

CREATE TABLE returns (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    order_item_id       UUID NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
    variant_id          UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    quantity            INTEGER NOT NULL CHECK (quantity > 0),
    reason_code_id      UUID NOT NULL REFERENCES reason_codes(id) ON DELETE RESTRICT,
    disposition         return_disposition NOT NULL,
    restock_bin_id      UUID NULL REFERENCES warehouse_bins(id) ON DELETE RESTRICT,
    processed_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_restock_bin_required CHECK (
        (disposition = 'restock' AND restock_bin_id IS NOT NULL) OR
        (disposition = 'write_off' AND restock_bin_id IS NULL)
    )
);

CREATE INDEX idx_returns_order ON returns(order_id);
CREATE INDEX idx_returns_variant ON returns(variant_id);
