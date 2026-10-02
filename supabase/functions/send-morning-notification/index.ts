// Supabase Edge Function: send-morning-notification
// Invoked daily by pg_cron at 06:30 UTC.
// Queries all users with a push_token, resets daily_generations_used,
// and fires an Expo push notification with a weather-personalised message.
//
// pg_cron setup (run once in Supabase SQL editor):
//   SELECT cron.schedule(
//     'morning-outfit-notification',
//     '30 6 * * *',
//     $$SELECT net.http_post(
//       url := 'https://<project-ref>.supabase.co/functions/v1/send-morning-notification',
//       headers := '{"Authorization":"Bearer <service-role-key>","Content-Type":"application/json"}',
//       body := '{}'
//     )$$
//   );
//
// Also resets daily_generations_used to 0 for all users (midnight cadence can
// be a separate cron, but bundling it here keeps ops simple).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENWEATHER_API_KEY = Deno.env.get('OPENWEATHER_API_KEY');
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface PushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: Record<string, unknown>;
}

async function getWeatherForCity(city: string): Promise<string> {
  if (!OPENWEATHER_API_KEY || OPENWEATHER_API_KEY === 'your_openweather_api_key_here') {
    return 'a new day';
  }
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${OPENWEATHER_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return 'a new day';
    const data = await res.json();
    const temp = Math.round(data.main.temp);
    const condition = data.weather[0]?.main ?? 'Clear';
    return `${temp}°C & ${condition}`;
  } catch {
    return 'a new day';
  }
}

Deno.serve(async (req: Request) => {
  // Allow both GET (from cron) and POST (manual trigger)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Reset daily generation counters for all users
    await supabase.from('users').update({ daily_generations_used: 0 }).neq('id', '');

    // 2. Fetch all users with a push token
    const { data: users, error } = await supabase
      .from('users')
      .select('id, push_token')
      .not('push_token', 'is', null);

    if (error) throw error;
    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Build push messages
    const weather = await getWeatherForCity('London'); // default city; extend per-user timezone later

    const messages: PushMessage[] = users
      .filter((u) => u.push_token)
      .map((u) => ({
        to: u.push_token as string,
        title: '🌤️ Your Daily Outfits Are Ready',
        body: `It's ${weather} today — your AI Stylist has picked the perfect looks for you.`,
        sound: 'default',
        data: { screen: '/(tabs)/' },
      }));

    // 4. Send in batches of 100 (Expo limit)
    let sent = 0;
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      });
      if (res.ok) sent += batch.length;
    }

    return new Response(JSON.stringify({ sent, total: messages.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[send-morning-notification]', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
