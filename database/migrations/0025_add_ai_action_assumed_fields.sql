-- Which fields of an assistant draft the model filled in with a default
-- (e.g. today's date, cash) rather than taking from the admin's own words.
-- The confirmation card highlights these so the admin checks them before
-- confirming. The amount, category and purpose of an entry can never be
-- assumed — the propose tools refuse such a draft and the model has to ask
-- the admin instead (see proposeTools.ts).
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS assumed_fields TEXT[] NOT NULL DEFAULT '{}';
