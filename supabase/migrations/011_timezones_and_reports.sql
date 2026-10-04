-- Migration 011: Local-time daily resets + morning push, content reports, moderated comments

BEGIN;

-- ─── users: timezone-aware daily counters and reminders ──────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS counters_reset_on DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS notified_on DATE;

GRANT INSERT (timezone) ON public.users TO anon, authenticated;
GRANT UPDATE (timezone) ON public.users TO anon, authenticated;

-- An unknown timezone name would break every AT TIME ZONE below, so fall back to UTC.
CREATE OR REPLACE FUNCTION public.normalize_user_timezone() RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public, pg_catalog
  AS $$
  BEGIN
    IF NEW.timezone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone) THEN
      NEW.timezone := 'UTC';
    END IF;
    RETURN NEW;
  END;
  $$;

DROP TRIGGER IF EXISTS users_normalize_timezone ON public.users;
CREATE TRIGGER users_normalize_timezone
  BEFORE INSERT OR UPDATE OF timezone ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.normalize_user_timezone();

-- Resets everyone whose local date has moved past their last reset.
CREATE OR REPLACE FUNCTION public.reset_daily_counters() RETURNS INTEGER
  LANGUAGE sql SECURITY DEFINER
  SET search_path = public, pg_catalog
  AS $$
    WITH updated AS (
      UPDATE public.users
      SET daily_generations_used = 0,
          daily_chat_used = 0,
          counters_reset_on = (now() AT TIME ZONE timezone)::date
      WHERE counters_reset_on < (now() AT TIME ZONE timezone)::date
      RETURNING 1
    )
    SELECT count(*)::int FROM updated;
  $$;

-- Claims push tokens of users for whom it is now 07:xx local time and who have not
-- been reminded today; marks them as reminded in the same statement.
CREATE OR REPLACE FUNCTION public.claim_morning_pushes() RETURNS TABLE (push_token TEXT)
  LANGUAGE sql SECURITY DEFINER
  SET search_path = public, pg_catalog
  AS $$
    UPDATE public.users
    SET notified_on = (now() AT TIME ZONE timezone)::date
    WHERE push_token IS NOT NULL
      AND extract(hour FROM now() AT TIME ZONE timezone) = 7
      AND notified_on IS DISTINCT FROM (now() AT TIME ZONE timezone)::date
    RETURNING push_token;
  $$;

REVOKE ALL ON FUNCTION public.reset_daily_counters() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_morning_pushes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_morning_pushes() TO service_role;

-- ─── content_reports ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_reports (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  post_id     UUID REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  comment_id  UUID REFERENCES public.post_comments(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL DEFAULT '' CHECK (char_length(reason) <= 200),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((post_id IS NULL) <> (comment_id IS NULL)),
  UNIQUE (reporter_id, post_id),
  UNIQUE (reporter_id, comment_id)
);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_reports: read own" ON public.content_reports
  FOR SELECT USING (reporter_id = requesting_user_id());
CREATE POLICY "content_reports: report visible content as yourself" ON public.content_reports
  FOR INSERT WITH CHECK (
    reporter_id = requesting_user_id()
    AND (
      (post_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.feed_posts p WHERE p.id = post_id AND p.user_id <> requesting_user_id()))
      OR (comment_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.post_comments c WHERE c.id = comment_id AND c.user_id <> requesting_user_id()))
    )
  );

REVOKE UPDATE, DELETE ON public.content_reports FROM anon, authenticated;
GRANT SELECT, INSERT ON public.content_reports TO anon, authenticated;

-- Three different reporters hide a post (rejected) or remove a comment.
CREATE OR REPLACE FUNCTION public.apply_report_threshold() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_catalog
  AS $$
  BEGIN
    IF NEW.post_id IS NOT NULL
       AND (SELECT count(DISTINCT reporter_id) FROM public.content_reports WHERE post_id = NEW.post_id) >= 3 THEN
      UPDATE public.feed_posts SET moderation_status = 'rejected' WHERE id = NEW.post_id;
    ELSIF NEW.comment_id IS NOT NULL
       AND (SELECT count(DISTINCT reporter_id) FROM public.content_reports WHERE comment_id = NEW.comment_id) >= 3 THEN
      DELETE FROM public.post_comments WHERE id = NEW.comment_id;
    END IF;
    RETURN NEW;
  END;
  $$;

DROP TRIGGER IF EXISTS content_reports_threshold ON public.content_reports;
CREATE TRIGGER content_reports_threshold
  AFTER INSERT ON public.content_reports
  FOR EACH ROW EXECUTE FUNCTION public.apply_report_threshold();

-- ─── post_comments: only created by the moderated post-comment function ──────
DROP POLICY IF EXISTS "post_comments: comment on approved posts as yourself" ON public.post_comments;
REVOKE INSERT ON public.post_comments FROM anon, authenticated;

COMMIT;

-- Every 15 minutes, so half-hour timezones (e.g. India) reset close to local midnight.
SELECT cron.schedule('daily-generation-reset', '*/15 * * * *', $$ SELECT public.reset_daily_counters() $$);

-- The morning job now runs every 15 minutes; claim_morning_pushes() only returns
-- users at 07:xx local time who have not been reminded today.
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'morning-outfit-notification'),
  schedule := '*/15 * * * *'
);
