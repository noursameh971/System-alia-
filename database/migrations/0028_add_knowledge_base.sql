-- The assistant's knowledge base: what search_knowledge (and the per-turn
-- pre-retrieval in chat.service.ts) look through before answering.
--
-- Two kinds of document share one index:
--   * uploads  — company documents an admin added (supplier contracts,
--                price lists, policies): split into chunks.
--   * records  — the business's own rows (suppliers, products, materials,
--                expenses, revenue, ledger entries, receipts) rendered as a
--                short text each, kept in sync by knowledge/records.ts.
--
-- Every chunk carries a 384-dim embedding from the local multilingual model
-- (EmbeddingGemma-300m, truncated to 384 dims — see knowledge/embedder.ts) for
-- search by meaning, plus a full-text vector and trigram index for exact
-- names, SKUs and numbers. Results from both are fused at query time.
--
-- Safe to re-run: every statement is IF NOT EXISTS / idempotent.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS kb_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'upload' for admin-added files; otherwise the record type
  -- ('ledger_entity', 'product', 'expense', ...) — see knowledge/records.ts.
  source_type      VARCHAR(32) NOT NULL,
  -- The row a record document mirrors. Null for uploads.
  source_id        UUID,
  -- Null = applies to every workspace (e.g. a company-wide policy).
  brand_id         UUID REFERENCES brands(id) ON DELETE CASCADE,
  -- Optional: the supplier/client a document is about (e.g. their contract).
  ledger_entity_id UUID REFERENCES ledger_entities(id) ON DELETE SET NULL,
  title            VARCHAR(300) NOT NULL,
  file_url         TEXT,
  content_type     VARCHAR(100),
  -- Hash of the indexed text: a record whose text hasn't changed isn't re-embedded.
  content_hash     CHAR(64) NOT NULL,
  status           VARCHAR(16) NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'failed')),
  error            TEXT,
  chunk_count      INTEGER NOT NULL DEFAULT 0,
  uploaded_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One index document per mirrored row.
CREATE UNIQUE INDEX IF NOT EXISTS ux_kb_documents_source ON kb_documents (source_type, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_kb_documents_brand ON kb_documents (brand_id);

CREATE TABLE IF NOT EXISTS kb_chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  -- Denormalized from the document so searches filter without a join.
  brand_id    UUID REFERENCES brands(id) ON DELETE CASCADE,
  source_type VARCHAR(32) NOT NULL,
  chunk_index INTEGER NOT NULL,
  content     TEXT NOT NULL,
  embedding   vector(384) NOT NULL,
  -- 'simple' configuration: no stemming, so Arabic and English words both match as written.
  tsv         tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS ix_kb_chunks_embedding ON kb_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS ix_kb_chunks_tsv ON kb_chunks USING gin (tsv);
CREATE INDEX IF NOT EXISTS ix_kb_chunks_trgm ON kb_chunks USING gin (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_kb_chunks_brand ON kb_chunks (brand_id);
