-- Unified Settings page: brand profile fields, a single-row global settings
-- table (General & Localization + Inventory & Operations tabs), and a
-- per-brand shipping-rates-by-city list.

ALTER TABLE brands ADD COLUMN IF NOT EXISTS logo_url TEXT NULL;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS receipt_notes TEXT NULL;

CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  default_currency CHAR(3) NOT NULL DEFAULT 'EGP',
  date_format VARCHAR(20) NOT NULL DEFAULT 'DD/MM/YYYY',
  default_language VARCHAR(5) NOT NULL DEFAULT 'en',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the one settings row this app will ever use — settings.service.ts
-- always reads/writes the first row rather than a hardcoded id, but a row
-- must exist for that to work on a fresh database.
INSERT INTO app_settings (low_stock_threshold, default_currency, date_format, default_language)
SELECT 5, 'EGP', 'DD/MM/YYYY', 'en'
WHERE NOT EXISTS (SELECT 1 FROM app_settings);

CREATE TABLE IF NOT EXISTS shipping_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  city VARCHAR(100) NOT NULL,
  rate NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shipping_rates_brand_city ON shipping_rates (brand_id, city);
