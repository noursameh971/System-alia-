-- Receipts and invoices the admin attaches in the assistant panel (photos,
-- InstaPay / bank screenshots, PDFs).
--
-- The file itself lives in the same receipt store the Finance page's
-- upload button uses (uploads/receipts, see uploads.image.service.ts), so
-- a confirmed draft can point expenses.receipt_url (etc.) at it exactly
-- like a hand-attached receipt. This table records who uploaded it, what
-- the vision model read from it, and which chat message carried it.
--
-- Safe to re-run: every statement is IF NOT EXISTS / idempotent.

CREATE TABLE IF NOT EXISTS ai_attachments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- Null until the file is sent in a chat turn. SET NULL rather than
  -- CASCADE: deleting a chat mustn't orphan the receipt behind an expense
  -- that was confirmed from it.
  conversation_id   UUID REFERENCES ai_conversations(id) ON DELETE SET NULL,
  message_id        UUID REFERENCES ai_messages(id) ON DELETE SET NULL,
  file_url          TEXT NOT NULL,
  file_name         VARCHAR(255),
  content_type      VARCHAR(100) NOT NULL,
  size_bytes        INTEGER NOT NULL CHECK (size_bytes > 0),
  -- Re-uploading the same screenshot is the commonest way a payment gets
  -- recorded twice; the hash lets the assistant warn before it happens.
  sha256            CHAR(64) NOT NULL,
  -- The structured fields read from the file (receiptReader.ts's shape),
  -- or null when reading failed — the file is still attached either way.
  extraction        JSONB,
  extraction_status VARCHAR(16) NOT NULL CHECK (extraction_status IN ('done', 'failed')),
  extraction_error  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ai_attachments_sha256 ON ai_attachments (sha256);
CREATE INDEX IF NOT EXISTS ix_ai_attachments_conversation ON ai_attachments (conversation_id);
CREATE INDEX IF NOT EXISTS ix_ai_attachments_reference ON ai_attachments ((extraction->>'reference'))
  WHERE extraction->>'reference' IS NOT NULL;

-- A draft made from a receipt remembers which one, so a later upload of the
-- same file can be recognised as already recorded.
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS attachment_id UUID REFERENCES ai_attachments(id) ON DELETE SET NULL;
-- What the card shows beyond the payload itself (e.g. the linked supplier's
-- name and balance) — the shownOnCard values the model was given.
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS display JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Revenue had no receipt column; an incoming InstaPay transfer from a
-- client is as much a receipt as an outgoing one.
ALTER TABLE revenues ADD COLUMN IF NOT EXISTS receipt_url TEXT;
