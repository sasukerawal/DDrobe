-- Migration 003: Clerk-compatible user IDs
-- auth.uid() always returns UUID type — unusable with Clerk "user_..." IDs.
-- Solution: TEXT columns + requesting_user_id() helper function.

-- 1. Helper that reads JWT sub as TEXT (works with Clerk IDs)
CREATE OR REPLACE FUNCTION requesting_user_id() RETURNS TEXT
  LANGUAGE sql STABLE
  AS $$
    SELECT NULLIF(
      COALESCE(
        current_setting('request.jwt.claim.sub', true),
        (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
      ),
      ''
    );
  $$;

-- 2. Drop existing RLS policies
DROP POLICY IF EXISTS "users: own row" ON public.users;
DROP POLICY IF EXISTS "closet_items: own items" ON public.closet_items;
DROP POLICY IF EXISTS "outfits_history: own history" ON public.outfits_history;
DROP POLICY IF EXISTS "feed_posts: manage own" ON public.feed_posts;
DROP POLICY IF EXISTS "feed_posts: read approved" ON public.feed_posts;

-- 3. Drop FK constraints referencing users.id
ALTER TABLE public.closet_items    DROP CONSTRAINT IF EXISTS closet_items_user_id_fkey;
ALTER TABLE public.outfits_history DROP CONSTRAINT IF EXISTS outfits_history_user_id_fkey;
ALTER TABLE public.feed_posts      DROP CONSTRAINT IF EXISTS feed_posts_user_id_fkey;

-- 4. Alter column types UUID -> TEXT with explicit cast
ALTER TABLE public.users           ALTER COLUMN id      TYPE TEXT USING id::TEXT;
ALTER TABLE public.closet_items    ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
ALTER TABLE public.outfits_history ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
ALTER TABLE public.feed_posts      ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- 5. Restore FK constraints (both sides are now TEXT)
ALTER TABLE public.closet_items    ADD CONSTRAINT closet_items_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.outfits_history ADD CONSTRAINT outfits_history_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.feed_posts      ADD CONSTRAINT feed_posts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 6. Recreate RLS policies using requesting_user_id() (TEXT-safe)
CREATE POLICY "users: own row" ON public.users
  FOR ALL USING (id = requesting_user_id());

CREATE POLICY "closet_items: own items" ON public.closet_items
  FOR ALL USING (user_id = requesting_user_id());

CREATE POLICY "outfits_history: own history" ON public.outfits_history
  FOR ALL USING (user_id = requesting_user_id());

CREATE POLICY "feed_posts: read approved" ON public.feed_posts
  FOR SELECT USING (moderation_status = 'approved');

CREATE POLICY "feed_posts: manage own" ON public.feed_posts
  FOR ALL USING (user_id = requesting_user_id());
