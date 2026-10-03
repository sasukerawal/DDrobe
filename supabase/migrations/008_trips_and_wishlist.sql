-- Migration 008: Trips (packing lists) + wishlist

BEGIN;

-- ─── trips ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trips (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  destination TEXT NOT NULL DEFAULT '' CHECK (char_length(destination) <= 80),
  purpose     TEXT NOT NULL DEFAULT '' CHECK (char_length(purpose) <= 200),
  start_date  DATE NOT NULL,
  nights      SMALLINT NOT NULL CHECK (nights BETWEEN 1 AND 30),
  extras      TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trips_user_start ON public.trips (user_id, start_date DESC);

-- ─── trip_items: the packing list ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trip_items (
  id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.closet_items(id) ON DELETE CASCADE,
  packed  BOOLEAN NOT NULL DEFAULT FALSE,
  reason  TEXT NOT NULL DEFAULT '' CHECK (char_length(reason) <= 160),
  UNIQUE (trip_id, item_id)
);

-- ─── wishlist_items ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wishlist_items (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  category   TEXT CHECK (category IS NULL OR category IN ('top', 'bottom', 'shoe', 'outerwear', 'accessory')),
  color      TEXT NOT NULL DEFAULT '' CHECK (char_length(color) <= 40),
  brand      TEXT NOT NULL DEFAULT '' CHECK (char_length(brand) <= 60),
  price      NUMERIC(10, 2) CHECK (price IS NULL OR price >= 0),
  url        TEXT NOT NULL DEFAULT '' CHECK (char_length(url) <= 500 AND (url = '' OR url ~* '^https?://')),
  notes      TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 300),
  purchased  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wishlist_user ON public.wishlist_items (user_id, created_at DESC);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trips: own rows" ON public.trips
  FOR ALL USING (user_id = requesting_user_id()) WITH CHECK (user_id = requesting_user_id());
CREATE POLICY "wishlist_items: own rows" ON public.wishlist_items
  FOR ALL USING (user_id = requesting_user_id()) WITH CHECK (user_id = requesting_user_id());
CREATE POLICY "trip_items: own rows" ON public.trip_items
  FOR ALL USING (user_id = requesting_user_id()) WITH CHECK (user_id = requesting_user_id());

-- A packing-list row must point at the caller's own trip and own item.
CREATE POLICY "trip_items: own trip and item" ON public.trip_items
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = requesting_user_id())
    AND public.owns_items(ARRAY[item_id])
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.trip_items TO authenticated;
GRANT UPDATE (packed) ON public.trip_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wishlist_items TO authenticated;

COMMIT;
