-- Migration 006: Item details + wear log

BEGIN;

-- ─── closet_items: user-editable details ─────────────────────────────────────
ALTER TABLE public.closet_items
  ADD COLUMN IF NOT EXISTS name  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS size  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2) CHECK (price IS NULL OR price >= 0);

ALTER TABLE public.closet_items
  ADD CONSTRAINT closet_items_text_lengths CHECK (
    char_length(name) <= 80 AND char_length(brand) <= 60 AND
    char_length(size) <= 20 AND char_length(notes) <= 500
  );

-- ─── wear_log: one row per item per day it was worn ──────────────────────────
CREATE TABLE IF NOT EXISTS public.wear_log (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_id    UUID NOT NULL REFERENCES public.closet_items(id) ON DELETE CASCADE,
  worn_on    DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, worn_on)
);

CREATE INDEX IF NOT EXISTS idx_wear_log_user_date ON public.wear_log (user_id, worn_on DESC);

ALTER TABLE public.wear_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wear_log: own rows" ON public.wear_log
  FOR ALL USING (user_id = requesting_user_id()) WITH CHECK (user_id = requesting_user_id());

-- An item can only be logged by the user who owns it.
CREATE POLICY "wear_log: own items only" ON public.wear_log
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.closet_items ci
    WHERE ci.id = item_id AND ci.user_id = requesting_user_id()
  ));

REVOKE UPDATE ON public.wear_log FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.wear_log TO authenticated;

COMMIT;
