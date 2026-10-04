// Supabase Edge Function: send-morning-notification
// Invoked every 15 minutes by pg_cron. claim_morning_pushes() returns users for whom it
// is 07:xx local time and who have not been reminded today (and marks them reminded).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Only the scheduled cron job knows this; it must send it as the x-cron-secret header.
const CRON_SECRET = Deno.env.get('CRON_SECRET');
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return json({ error: 'Forbidden' }, 403);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: users, error } = await supabase.rpc('claim_morning_pushes');
    if (error) throw error;

    const messages = ((users ?? []) as { push_token: string }[]).map((u) => ({
      to: u.push_token as string,
      title: 'Your outfits for today are ready',
      body: 'Open DDrobe to see what your stylist picked from your closet.',
      sound: 'default',
      data: { screen: '/(tabs)/' },
    }));

    let sent = 0;
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      });
      if (res.ok) sent += batch.length;
      else console.error('[send-morning-notification] expo push', res.status, await res.text());
    }

    return json({ sent, total: messages.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[send-morning-notification]', message);
    return json({ error: message }, 500);
  }
});
