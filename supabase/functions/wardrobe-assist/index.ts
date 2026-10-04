// Supabase Edge Function: wardrobe-assist
// AI helpers that work on the caller's own closet:
//   { action: 'packing', tripId }  -> fills the trip's packing list (trip_items + extras)
//   { action: 'gaps' }             -> suggests up to 5 pieces the wardrobe is missing
// Both count toward the shared daily AI limit.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callGeminiJson, GeminiError } from '../_shared/gemini.ts';
import { AuthError, requireUserId } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DAILY_LIMIT = 10;
const CATEGORIES = ['top', 'bottom', 'shoe', 'outerwear', 'accessory'];

type Supabase = SupabaseClient;

interface Item {
  id: string;
  name: string;
  category: string;
  color: string;
  pattern: string;
  season: string[];
  formality: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function packing(supabase: Supabase, userId: string, tripId: unknown, items: Item[]) {
  if (typeof tripId !== 'string') return json({ error: 'Missing tripId' }, 400);

  const { data: trip, error } = await supabase
    .from('trips')
    .select('id, name, destination, purpose, start_date, nights')
    .eq('id', tripId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!trip) return json({ error: 'Trip not found' }, 404);
  if (items.length === 0) return json({ error: 'Add some clothes to your wardrobe first.' }, 422);

  const month = new Date(`${trip.start_date}T12:00:00Z`).toLocaleString('en', { month: 'long' });
  const result = await callGeminiJson<{ items?: { id?: string; reason?: string }[]; extras?: unknown[] }>({
    system_instruction: {
      parts: [{
        text: `You are a practical packing assistant. Choose clothes ONLY from the user's wardrobe list (by "id") for a trip.
Pack light: enough to mix into an outfit for each day, re-wearing bottoms, shoes and outerwear where sensible.
Use what you know about the destination's typical weather in that month.
Also list up to 8 short non-clothing reminders (e.g. "Phone charger", "Sunscreen").
Return ONLY JSON: { "items": [{ "id": "...", "reason": "max 8 words" }], "extras": ["..."] }`,
      }],
    },
    contents: [{
      parts: [{
        text: `Trip: ${trip.name}
Destination: ${trip.destination || 'not specified'}
Dates: ${trip.nights} night(s) starting ${trip.start_date} (${month})
Plans: ${trip.purpose || 'not specified'}
Wardrobe: ${JSON.stringify(items)}`,
      }],
    }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
  });

  const owned = new Set(items.map((i) => i.id));
  const seen = new Set<string>();
  const picks = (Array.isArray(result.items) ? result.items : [])
    .filter((p) => typeof p?.id === 'string' && owned.has(p.id) && !seen.has(p.id) && seen.add(p.id))
    .slice(0, 40)
    .map((p) => ({
      user_id: userId,
      trip_id: trip.id,
      item_id: p.id as string,
      reason: typeof p.reason === 'string' ? p.reason.slice(0, 160) : '',
    }));
  const extras = (Array.isArray(result.extras) ? result.extras : [])
    .filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
    .map((e) => e.trim().slice(0, 60))
    .slice(0, 8);

  if (picks.length === 0) throw new GeminiError("Couldn't build a packing list this time. Try again.", 502);

  // Regenerating replaces the list but keeps what was already ticked as packed.
  const { data: existing } = await supabase.from('trip_items').select('item_id, packed').eq('trip_id', trip.id);
  const packed = new Set((existing ?? []).filter((r) => r.packed).map((r) => r.item_id));
  await supabase.from('trip_items').delete().eq('trip_id', trip.id);
  const { error: insertError } = await supabase
    .from('trip_items')
    .insert(picks.map((p) => ({ ...p, packed: packed.has(p.item_id) })));
  if (insertError) throw insertError;
  const { error: updateError } = await supabase.from('trips').update({ extras }).eq('id', trip.id);
  if (updateError) throw updateError;

  return json({ success: true, count: picks.length });
}

async function gaps(items: Item[]) {
  if (items.length < 3) {
    return json({ error: 'Add a few more clothes first so the stylist can see what you have.' }, 422);
  }
  const result = await callGeminiJson<{ gaps?: Record<string, unknown>[] }>({
    system_instruction: {
      parts: [{
        text: `You are a thoughtful personal stylist who values buying less.
Review the user's wardrobe and suggest at most 5 versatile pieces that would unlock the most new outfits with what they already own.
Do not suggest something they already have. No brands, no links.
Return ONLY JSON: { "gaps": [{ "title": "e.g. White leather sneakers", "category": "top|bottom|shoe|outerwear|accessory", "color": "...", "reason": "one sentence on which owned pieces it pairs with" }] }`,
      }],
    },
    contents: [{ parts: [{ text: `Wardrobe: ${JSON.stringify(items)}` }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.5 },
  });

  const list = (Array.isArray(result.gaps) ? result.gaps : [])
    .filter((g) => typeof g?.title === 'string')
    .slice(0, 5)
    .map((g) => ({
      title: String(g.title).slice(0, 80),
      category: CATEGORIES.includes(String(g.category)) ? String(g.category) : null,
      color: typeof g.color === 'string' ? g.color.slice(0, 40) : '',
      reason: typeof g.reason === 'string' ? g.reason.slice(0, 200) : '',
    }));
  if (list.length === 0) throw new GeminiError("Couldn't find suggestions this time. Try again.", 502);
  return json({ success: true, gaps: list });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  try {
    const userId = await requireUserId(req);
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const [userRes, closetRes] = await Promise.all([
      supabase.from('users').select('daily_generations_used').eq('id', userId).single(),
      supabase
        .from('closet_items')
        .select('id, name, category, color, pattern, season, formality')
        .eq('user_id', userId),
    ]);
    if (closetRes.error) throw closetRes.error;

    const used = userRes.data?.daily_generations_used ?? 0;
    if (used >= DAILY_LIMIT) {
      return json({ limitReached: true, error: "You've used today's AI requests. They reset at midnight (UTC)." }, 429);
    }

    const items = (closetRes.data ?? []) as Item[];
    let response: Response;
    if (body.action === 'packing') response = await packing(supabase, userId, body.tripId, items);
    else if (body.action === 'gaps') response = await gaps(items);
    else return json({ error: 'Unknown action' }, 400);

    if (response.ok) {
      await supabase.from('users').update({ daily_generations_used: used + 1 }).eq('id', userId);
    }
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[wardrobe-assist]', message);
    const status = err instanceof GeminiError || err instanceof AuthError ? err.status : 500;
    return json({ error: message }, status);
  }
});
