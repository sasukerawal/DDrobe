-- Migration 004: Tighten RLS and client privileges
-- Server-only writes (posts, counters, uploads) go through Edge Functions with the service role.

BEGIN;

-- ─── users ────────────────────────────────────────────────────────────────────
-- Clients may create/update their own profile fields, never counters or credits.
DROP POLICY IF EXISTS "users: own row" ON public.users;

CREATE POLICY "users: read own" ON public.users
  FOR SELECT USING (id = requesting_user_id());
CREATE POLICY "users: insert own" ON public.users
  FOR INSERT WITH CHECK (id = requesting_user_id());
CREATE POLICY "users: update own" ON public.users
  FOR UPDATE USING (id = requesting_user_id()) WITH CHECK (id = requesting_user_id());

REVOKE INSERT, UPDATE, DELETE ON public.users FROM anon, authenticated;
GRANT INSERT (id, email) ON public.users TO anon, authenticated;
GRANT UPDATE (id, email, push_token, style_preferences) ON public.users TO anon, authenticated;

-- ─── closet_items / outfits_history ──────────────────────────────────────────
-- Same ownership rule, now also enforced on the rows being written.
DROP POLICY IF EXISTS "closet_items: own items" ON public.closet_items;
CREATE POLICY "closet_items: own items" ON public.closet_items
  FOR ALL USING (user_id = requesting_user_id()) WITH CHECK (user_id = requesting_user_id());

DROP POLICY IF EXISTS "outfits_history: own history" ON public.outfits_history;
CREATE POLICY "outfits_history: own history" ON public.outfits_history
  FOR ALL USING (user_id = requesting_user_id()) WITH CHECK (user_id = requesting_user_id());

-- ─── feed_posts ──────────────────────────────────────────────────────────────
-- Posts are only created by create-post after moderation. Users can read and delete their own.
DROP POLICY IF EXISTS "feed_posts: manage own" ON public.feed_posts;
CREATE POLICY "feed_posts: read own" ON public.feed_posts
  FOR SELECT USING (user_id = requesting_user_id());
CREATE POLICY "feed_posts: delete own" ON public.feed_posts
  FOR DELETE USING (user_id = requesting_user_id());

REVOKE INSERT, UPDATE ON public.feed_posts FROM anon, authenticated;

-- ─── storage ─────────────────────────────────────────────────────────────────
-- All uploads happen server-side; public read stays so image URLs keep working.
DROP POLICY IF EXISTS "Users can upload lookbook posts" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own closet images" ON storage.objects;

COMMIT;
