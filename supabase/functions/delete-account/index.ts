// Supabase Edge Function: delete-account
// Deletes everything belonging to the caller (photos, rows), then the Clerk user.
// Data goes first so a Clerk failure can be retried without leaving orphaned data.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AuthError, requireUserId } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLERK_SECRET_KEY = Deno.env.get('CLERK_SECRET_KEY')!;

type Supabase = SupabaseClient;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function removeFolder(supabase: Supabase, bucket: string, folder: string) {
  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 1000 });
    if (error) throw error;
    const paths = (data ?? []).filter((f) => f.id).map((f) => `${folder}/${f.name}`);
    if (paths.length === 0) return;
    const { error: removeError } = await supabase.storage.from(bucket).remove(paths);
    if (removeError) throw removeError;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  try {
    const userId = await requireUserId(req);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    await removeFolder(supabase, 'closet-images', userId);
    await removeFolder(supabase, 'lookbook-posts', `posts/${userId}`);

    // closet_items, outfits_history and feed_posts cascade from users.
    const { error: deleteError } = await supabase.from('users').delete().eq('id', userId);
    if (deleteError) throw deleteError;

    const clerkRes = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
    });
    if (!clerkRes.ok && clerkRes.status !== 404) {
      console.error('[delete-account] clerk', clerkRes.status, await clerkRes.text());
      throw new Error('Your data was deleted, but closing the account failed. Please try again.');
    }

    return json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[delete-account]', message);
    return json({ error: message }, err instanceof AuthError ? err.status : 500);
  }
});
