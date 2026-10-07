-- The assistant moved from the Anthropic Messages API to an
-- OpenAI-compatible chat-completions API (Groq). In that format a tool's
-- result is its own message with role 'tool' (Anthropic nested results
-- inside a 'user' message), so ai_messages has to accept that role.
-- ai_messages.content now holds each message's full chat-completions
-- object; rows written in the old format still load (see history.ts).
--
-- Safe to re-run: DROP IF EXISTS + re-ADD always converges.
ALTER TABLE ai_messages DROP CONSTRAINT IF EXISTS chk_ai_messages_role;
ALTER TABLE ai_messages ADD CONSTRAINT chk_ai_messages_role CHECK (role IN ('user', 'assistant', 'tool'));
