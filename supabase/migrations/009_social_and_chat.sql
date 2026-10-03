-- Migration 009: display names, Lookbook likes/comments, chat allowance

BEGIN;

-- ─── users: public display name + separate daily chat counter ────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '' CHECK (char_length(display_name) <= 40),
  ADD COLUMN IF NOT EXISTS daily_chat_used SMALLINT NOT NULL DEFAULT 0;

GRANT INSERT (display_name) ON public.users TO anon, authenticated;
GRANT UPDATE (display_name) ON public.users TO anon, authenticated;

-- Only id + display name are public. The view runs as its owner, so it can read
-- every row while exposing nothing else from users.
CREATE OR REPLACE VIEW public.public_profiles
  WITH (security_invoker = false) AS
  SELECT id, display_name FROM public.users;
REVOKE ALL ON public.public_profiles FROM anon;
GRANT SELECT ON public.public_profiles TO authenticated;

-- ─── post_likes ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_likes (
  post_id    UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- ─── post_comments ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_comments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id    UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_comments_post ON public.post_comments (post_id, created_at);

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

-- Visible on any post the reader can see (approved posts, or their own).
CREATE POLICY "post_likes: read on visible posts" ON public.post_likes
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.feed_posts p WHERE p.id = post_id));
CREATE POLICY "post_likes: like approved posts as yourself" ON public.post_likes
  FOR INSERT WITH CHECK (
    user_id = requesting_user_id()
    AND EXISTS (SELECT 1 FROM public.feed_posts p WHERE p.id = post_id AND p.moderation_status = 'approved')
  );
CREATE POLICY "post_likes: unlike own" ON public.post_likes
  FOR DELETE USING (user_id = requesting_user_id());

CREATE POLICY "post_comments: read on visible posts" ON public.post_comments
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.feed_posts p WHERE p.id = post_id));
CREATE POLICY "post_comments: comment on approved posts as yourself" ON public.post_comments
  FOR INSERT WITH CHECK (
    user_id = requesting_user_id()
    AND EXISTS (SELECT 1 FROM public.feed_posts p WHERE p.id = post_id AND p.moderation_status = 'approved')
  );
-- Authors can delete their comments; post owners can remove comments on their posts.
CREATE POLICY "post_comments: delete own or on own post" ON public.post_comments
  FOR DELETE USING (
    user_id = requesting_user_id()
    OR EXISTS (SELECT 1 FROM public.feed_posts p WHERE p.id = post_id AND p.user_id = requesting_user_id())
  );

GRANT SELECT, INSERT, DELETE ON public.post_likes TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.post_comments TO authenticated;

COMMIT;

-- Reset the chat allowance with the outfit counter at midnight UTC.
SELECT cron.schedule(
  'daily-generation-reset',
  '0 0 * * *',
  $$ update public.users set daily_generations_used = 0, daily_chat_used = 0
     where daily_generations_used <> 0 or daily_chat_used <> 0 $$
);
