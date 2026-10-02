-- Migration 002: Storage buckets + pg_cron schedule
-- Run in Supabase Dashboard → SQL Editor

-- ─── Storage Buckets ──────────────────────────────────────────────────────────

-- Closet item images (already exists; idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('closet-images', 'closet-images', true)
ON CONFLICT (id) DO NOTHING;

-- Lookbook post images
INSERT INTO storage.buckets (id, name, public)
VALUES ('lookbook-posts', 'lookbook-posts', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: allow authenticated users to upload to their own folder in closet-images
CREATE POLICY "Users can upload their own closet images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'closet-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Public can read closet images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'closet-images');

-- RLS: allow authenticated users to upload to lookbook-posts
CREATE POLICY "Users can upload lookbook posts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'lookbook-posts');

CREATE POLICY "Public can read lookbook posts"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'lookbook-posts');

-- ─── pg_cron: Morning Notification + Daily Counter Reset ──────────────────────
-- Requires the pg_cron extension to be enabled in Supabase Dashboard:
--   Settings → Extensions → pg_cron → Enable
-- Requires pg_net (usually pre-installed on Supabase).
-- Replace <project-ref> and <service-role-key> with your real values.

-- SELECT cron.schedule(
--   'morning-outfit-notification',
--   '30 6 * * *',   -- 06:30 UTC daily
--   $$
--     SELECT net.http_post(
--       url        := 'https://<project-ref>.supabase.co/functions/v1/send-morning-notification',
--       headers    := '{"Authorization":"Bearer <service-role-key>","Content-Type":"application/json"}',
--       body       := '{}'::jsonb
--     )
--   $$
-- );
