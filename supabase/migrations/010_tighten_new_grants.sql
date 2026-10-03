-- Migration 010: Tighten grants Supabase adds by default to new tables
-- (new public tables get full privileges for anon/authenticated; RLS still applies,
-- but column-level intent must be enforced with explicit REVOKEs).

BEGIN;

-- trip_items: clients may only flip `packed`.
REVOKE UPDATE ON public.trip_items FROM anon, authenticated;
GRANT UPDATE (packed) ON public.trip_items TO anon, authenticated;

-- Likes and comments are never edited.
REVOKE UPDATE ON public.post_likes FROM anon, authenticated;
REVOKE UPDATE ON public.post_comments FROM anon, authenticated;

-- Replace the public_profiles view with a function that only answers signed-in
-- callers and only for the ids asked for (works whichever role Clerk tokens map to).
DROP VIEW IF EXISTS public.public_profiles;

CREATE OR REPLACE FUNCTION public.display_names(ids TEXT[])
  RETURNS TABLE (id TEXT, display_name TEXT)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
  AS $$
    SELECT u.id, u.display_name
    FROM public.users u
    WHERE requesting_user_id() IS NOT NULL
      AND u.id = ANY (ids[1:200]);
  $$;

REVOKE ALL ON FUNCTION public.display_names(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.display_names(TEXT[]) TO anon, authenticated;

COMMIT;
