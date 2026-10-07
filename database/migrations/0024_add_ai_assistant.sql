-- Admin AI assistant (Phase 1): chat history plus the propose → confirm
-- queue for every write the assistant makes. Admin-only — enforced on the
-- /api/assistant router, not here.
--
-- Nothing in the existing finance tables changes: an expense or revenue the
-- assistant created is an ordinary row written by the ordinary service
-- (createExpense / createRevenue), and ai_actions.result_id is the link
-- back to the conversation that produced it.

-- proposed: drafted by the model, waiting on the admin's Confirm/Cancel.
-- executed: confirmed and written. rejected: the admin cancelled it.
-- failed:   confirmed, but the write itself errored (see ai_actions.error).
-- expired:  left unconfirmed past expires_at — stale drafts can't be
--           confirmed days later against data that has since moved on.
DO $$ BEGIN
  CREATE TYPE ai_action_status AS ENUM ('proposed', 'executed', 'rejected', 'failed', 'expired');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Conversations are private to the admin who started them.
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The workspace the chat was opened from — the default brand for its
  -- tools. NULL when opened from a cross-brand page (e.g. /dashboard).
  brand_id UUID NULL REFERENCES brands(id) ON DELETE SET NULL,
  title VARCHAR(200) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The history sidebar: "my conversations, most recently active first".
CREATE INDEX IF NOT EXISTS ix_ai_conversations_user ON ai_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL,
  -- The Claude API content blocks exactly as sent/received (text, tool_use,
  -- tool_result) — replayed verbatim on the next turn, so this must never
  -- be reduced to plain text.
  content JSONB NOT NULL,
  -- Per-turn token usage, for cost tracking. NULL on user turns.
  input_tokens INTEGER NULL,
  output_tokens INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_ai_messages_role CHECK (role IN ('user', 'assistant'))
);

CREATE INDEX IF NOT EXISTS ix_ai_messages_conversation ON ai_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS ai_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  -- The tool_use block that proposed this action, so a confirmation card can
  -- be placed next to the right assistant message when history is reloaded.
  tool_use_id VARCHAR(64) NULL,
  tool_name VARCHAR(64) NOT NULL,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  -- The already-validated service input — exactly what Confirm will write.
  payload JSONB NOT NULL,
  status ai_action_status NOT NULL DEFAULT 'proposed',
  -- What Confirm created, e.g. ('expenses', <expense id>).
  result_table VARCHAR(64) NULL,
  result_id UUID NULL,
  error TEXT NULL,
  proposed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decided_by UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  decided_at TIMESTAMPTZ NULL,
  executed_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A confirmed action must say what it wrote; nothing else may claim to have.
  CONSTRAINT chk_ai_actions_result CHECK (
    (status = 'executed' AND result_table IS NOT NULL AND result_id IS NOT NULL) OR
    (status <> 'executed' AND result_id IS NULL)
  )
);

-- Loading a conversation's confirmation cards alongside its messages.
CREATE INDEX IF NOT EXISTS ix_ai_actions_conversation ON ai_actions (conversation_id, created_at);
