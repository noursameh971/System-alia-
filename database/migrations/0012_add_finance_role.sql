-- Adds the "finance" value to the existing user_role enum, backing the new
-- Finance Manager RBAC role: brand-scoped like warehouse_staff, but granted
-- access to /api/expenses and /api/ledger instead of the warehouse modules.
-- IF NOT EXISTS makes this safe to re-run.

ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'finance';
