// Supabase Edge Function: generate-outfit
// Builds outfit suggestions from the caller's own closet, using live weather (when the
// phone shares its location), their preferred formality, and their recent swipe ratings.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callGeminiJson, GeminiError } from '../_shared/gemini.ts';
import { AuthError, requireUserId } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENWEATHER_API_KEY = Deno.env.get('OPENWEATHER_API_KEY');
const DAILY_LIMIT = 10;

interface ClosetItem {
  id: string;
  name?: string;
  category: string;
  color: string;
  pattern: string;
  season: string[];
  formality: string;
  is_in_wash: boolean;
}

interface WeatherContext {
  temp_celsius: number;
  condition: string;
  city: string;
}

interface HistoryRow {
  top_id: string | null;
  bottom_id: string | null;
  shoe_id: string | null;
  accessory_id: string | null;
  rating: number | null;
  date_worn: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function fetchWeather(lat: unknown, lon: unknown): Promise<WeatherContext | null> {
  if (!OPENWEATHER_API_KEY || typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${OPENWEATHER_API_KEY}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      temp_celsius: Math.round(data.main.temp),
      condition: data.weather?.[0]?.main ?? 'Clear',
      city: data.name ?? '',
    };
  } catch (e) {
    console.error('[generate-outfit] weather', e);
    return null;
  }
}

function describeHistory(rows: HistoryRow[]): { history: string; recentlyWorn: string[] } {
  const today = new Date();
  const twoDaysAgo = new Date(today.getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const recentlyWorn = new Set<string>();
  const lines: string[] = [];

  for (const r of rows) {
    const ids = [r.top_id, r.bottom_id, r.shoe_id, r.accessory_id].filter(Boolean) as string[];
    if (ids.length === 0 || r.rating == null) continue;
    if (r.rating >= 4 && r.date_worn >= twoDaysAgo) ids.forEach((id) => recentlyWorn.add(id));
    lines.push(`${r.rating >= 4 ? 'LOVED' : 'PASSED'}: ${ids.join(' + ')}`);
  }
  return { history: lines.slice(0, 25).join('\n'), recentlyWorn: [...recentlyWorn] };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  try {
    const userId = await requireUserId(req);
    const body = await req.json().catch(() => ({}));
    const vacationContext = typeof body.vacationContext === 'string' ? body.vacationContext.slice(0, 200) : undefined;
    const count = Math.min(Math.max(Number(body.count) || 3, 1), 3);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const [userRes, closetRes, historyRes] = await Promise.all([
      supabase.from('users').select('daily_generations_used, style_preferences').eq('id', userId).single(),
      supabase
        .from('closet_items')
        .select('id, name, category, color, pattern, season, formality, is_in_wash, image_url, user_id, created_at')
        .eq('user_id', userId),
      supabase
        .from('outfits_history')
        .select('top_id, bottom_id, shoe_id, accessory_id, rating, date_worn')
        .eq('user_id', userId)
        .gte('date_worn', since)
        .order('date_worn', { ascending: false })
        .limit(40),
    ]);
    if (closetRes.error) throw closetRes.error;

    const used = userRes.data?.daily_generations_used ?? 0;
    if (used >= DAILY_LIMIT) {
      return json({ limitReached: true, error: 'Daily limit reached. Come back tomorrow for new outfits.' }, 429);
    }

    const availableItems = (closetRes.data ?? []).filter((i: ClosetItem) => !i.is_in_wash);
    const has = (...cats: string[]) => availableItems.some((i: ClosetItem) => cats.includes(i.category));
    if (!has('top', 'outerwear') || !has('bottom') || !has('shoe')) {
      return json({ error: 'Add at least one top, one bottom and one pair of shoes (not in the wash) to get outfits.' }, 422);
    }

    const weather = await fetchWeather(body.lat, body.lon);
    const preferredFormality = userRes.data?.style_preferences?.preferredFormality;
    const { history, recentlyWorn } = describeHistory((historyRes.data ?? []) as HistoryRow[]);

    let systemPrompt = `You are a professional fashion stylist building outfits from a user's real closet.
Generate exactly ${count} distinct outfit recommendations for today, each with a different style (for example Casual, Office, Trendy).`;

    if (vacationContext) {
      systemPrompt += `\n\nThe user is packing for a trip described as: "${vacationContext}". Prioritise items suited to this trip over today's local weather.`;
    }

    systemPrompt += `\n\nRules:
- Use ONLY items from the provided list, referenced by their "id".
- Every outfit has exactly one top (or outerwear), one bottom and one shoe, plus at most one accessory.
- ${weather ? `Dress for ${weather.temp_celsius}°C and ${weather.condition}${weather.city ? ` in ${weather.city}` : ''}.` : 'The weather is unknown, so favour versatile layers.'}
- Consider colour theory and pattern matching.`;

    if (preferredFormality) {
      systemPrompt += `\n- The user prefers ${String(preferredFormality).replace('_', ' ')} outfits; make ${count > 1 ? 'at least two of the suggestions' : 'the suggestion'} match that.`;
    }
    if (history) {
      systemPrompt += `\n- Past reactions (LOVED = wore it, PASSED = skipped). Favour combinations similar to loved ones and avoid passed combinations:\n${history}`;
    }
    if (recentlyWorn.length) {
      systemPrompt += `\n- Avoid repeating these items worn in the last two days where possible: ${recentlyWorn.join(', ')}`;
    }

    systemPrompt += `\n\nReturn ONLY a JSON array of exactly ${count} objects:
[{ "style": "Casual", "description": "One or two sentences on why it works today.", "topId": "...", "bottomId": "...", "shoeId": "...", "accessoryId": "... or null" }]`;

    const compactItems = availableItems.map(({ id, name, category, color, pattern, season, formality }: ClosetItem) =>
      ({ id, name, category, color, pattern, season, formality }));

    const result = await callGeminiJson<unknown>({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: `Available items: ${JSON.stringify(compactItems)}` }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096, temperature: 0.7 },
    });

    const byId = new Map<string, ClosetItem>(availableItems.map((i: ClosetItem) => [i.id, i]));
    const pick = (id: unknown, ...categories: string[]) => {
      const item = typeof id === 'string' ? byId.get(id) : undefined;
      return item && categories.includes(item.category) ? item : undefined;
    };

    const outfits = (Array.isArray(result) ? result : [])
      .map((o: Record<string, unknown>) => {
        const top = pick(o?.topId, 'top', 'outerwear');
        const bottom = pick(o?.bottomId, 'bottom');
        const shoe = pick(o?.shoeId, 'shoe');
        if (!top || !bottom || !shoe) return null;
        return {
          id: crypto.randomUUID(),
          style: typeof o.style === 'string' ? o.style : 'Casual',
          description: typeof o.description === 'string' ? o.description : '',
          top,
          bottom,
          shoe,
          accessory: pick(o.accessoryId, 'accessory'),
        };
      })
      .filter(Boolean);

    if (outfits.length === 0) {
      throw new GeminiError("The stylist couldn't put outfits together this time. Try again.", 502);
    }

    const generationsUsed = used + 1;
    await supabase.from('users').update({ daily_generations_used: generationsUsed }).eq('id', userId);

    return json({ success: true, weather, outfits, generationsUsed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[generate-outfit]', message);
    const status = err instanceof GeminiError || err instanceof AuthError ? err.status : 500;
    return json({ error: message }, status);
  }
});
