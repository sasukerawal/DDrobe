-- Migration 007: Saved outfits + outfit plans

BEGIN;

-- ─── saved_outfits ───────────────────────────────────────────────────────────
-- Deleting a core piece (top/bottom/shoe) removes outfits built on it.
CREATE TABLE IF NOT EXISTS public.saved_outfits (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT '' CHECK (char_length(name) <= 60),
  description  TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 400),
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('ai', 'manual')),
  top_id       UUID NOT NULL REFERENCES public.closet_items(id) ON DELETE CASCADE,
  bottom_id    UUID NOT NULL REFERENCES public.closet_items(id) ON DELETE CASCADE,
  shoe_id      UUID NOT NULL REFERENCES public.closet_items(id) ON DELETE CASCADE,
  accessory_id UUID REFERENCES public.closet_items(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_outfits_user ON public.saved_outfits (user_id, created_at DESC);

-- ─── planned_outfits: one plan per user per day ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.planned_outfits (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  outfit_id  UUID NOT NULL REFERENCES public.saved_outfits(id) ON DELETE CASCADE,
  plan_date  DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, plan_date)
);

ALTER TABLE public.saved_outfits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planned_outfits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_outfits: own rows" ON public.saved_outfits
  FOR ALL USING (user_id = requesting_user_id()) WITH CHECK (user_id = requesting_user_id());

-- Every referenced item must belong to the same user.
CREATE OR REPLACE FUNCTION public.owns_items(ids UUID[]) RETURNS BOOLEAN
  LANGUAGE sql STABLE
  AS $$
    SELECT NOT EXISTS (
      SELECT 1 FROM unnest(ids) AS t(item_id)
      WHERE item_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.closet_items ci
          WHERE ci.id = t.item_id AND ci.user_id = requesting_user_id()
        )
    );
  $$;

CREATE POLICY "saved_outfits: own items only" ON public.saved_outfits
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.owns_items(ARRAY[top_id, bottom_id, shoe_id, accessory_id]));
CREATE POLICY "saved_outfits: own items only on update" ON public.saved_outfits
  AS RESTRICTIVE FOR UPDATE
  WITH CHECK (public.owns_items(ARRAY[top_id, bottom_id, shoe_id, accessory_id]));

CREATE POLICY "planned_outfits: own rows" ON public.planned_outfits
  FOR ALL USING (user_id = requesting_user_id()) WITH CHECK (user_id = requesting_user_id());
CREATE POLICY "planned_outfits: own outfits only" ON public.planned_outfits
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.saved_outfits so
    WHERE so.id = outfit_id AND so.user_id = requesting_user_id()
  ));
CREATE POLICY "planned_outfits: own outfits only on update" ON public.planned_outfits
  AS RESTRICTIVE FOR UPDATE
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.saved_outfits so
    WHERE so.id = outfit_id AND so.user_id = requesting_user_id()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_outfits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planned_outfits TO authenticated;

COMMIT;
