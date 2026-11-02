-- Adds the "qr_printer" value to the existing user_role enum, backing the
-- QR Printer RBAC role: brand-scoped like warehouse_staff, but strictly
-- read-only — it can browse its workspace's Products page and print QR
-- labels, nothing else (enforced in backend/src/middleware/auth.ts).
-- IF NOT EXISTS makes this safe to re-run.

ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'qr_printer';
