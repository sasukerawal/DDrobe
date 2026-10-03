// Supabase Edge Function: delete-item
// Deletes one of the caller's closet items and its photo from storage.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AuthError, requireUserId } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PUBLIC_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/closet-images/`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  try {
    const userId = await requireUserId(req);
    const { itemId } = await req.json();
    if (typeof itemId !== 'string' || !itemId) return json({ error: 'Missing itemId' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: item, error: fetchError } = await supabase
      .from('closet_items')
      .select('id, image_url')
      .eq('id', itemId)
      .eq('user_id', userId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!item) return json({ error: 'Item not found' }, 404);

    const { error: deleteError } = await supabase.from('closet_items').delete().eq('id', item.id);
    if (deleteError) throw deleteError;

    const path = item.image_url.startsWith(PUBLIC_PREFIX) ? item.image_url.slice(PUBLIC_PREFIX.length) : null;
    if (path && path.startsWith(`${userId}/`)) {
      const { error: storageError } = await supabase.storage.from('closet-images').remove([path]);
      if (storageError) console.error('[delete-item] storage cleanup failed', path, storageError.message);
    }

    return json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[delete-item]', message);
    return json({ error: message }, err instanceof AuthError ? err.status : 500);
  }
});
