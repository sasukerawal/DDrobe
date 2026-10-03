// Supabase Edge Function: stylist-chat
// Conversational stylist that answers from the caller's own wardrobe.
// Body: { messages: [{ role: 'user' | 'assistant', content: string }] }
// Returns: { reply, items } where items are closet pieces the reply refers to.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callGeminiJson, GeminiError } from '../_shared/gemini.ts';
import { AuthError, requireUserId } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DAILY_CHAT_LIMIT = 30;
const MAX_TURNS = 12;
const MAX_CHARS = 1000;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

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
    const body = await req.json().catch(() => ({}));
    const messages: ChatMessage[] = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m: ChatMessage) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-MAX_TURNS)
      .map((m: ChatMessage) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      return json({ error: 'Send a message first.' }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const [userRes, closetRes] = await Promise.all([
      supabase.from('users').select('daily_chat_used, style_preferences').eq('id', userId).single(),
      supabase
        .from('closet_items')
        .select('id, name, category, color, pattern, season, formality, is_in_wash, image_url')
        .eq('user_id', userId),
    ]);
    if (closetRes.error) throw closetRes.error;

    const used = userRes.data?.daily_chat_used ?? 0;
    if (used >= DAILY_CHAT_LIMIT) {
      return json({ limitReached: true, error: "That's today's chat limit. It resets at midnight (UTC)." }, 429);
    }

    const closet = closetRes.data ?? [];
    const compact = closet.map(({ id, name, category, color, pattern, season, formality, is_in_wash }) =>
      ({ id, name, category, color, pattern, season, formality, in_wash: is_in_wash }));
    const prefs = userRes.data?.style_preferences ?? {};

    const systemPrompt = `You are DDrobe's personal stylist: direct and warm, like a stylish friend. Never corporate.
You know the user's real wardrobe (below). When suggesting outfits, use ONLY their items and avoid items marked in_wash.
If they lack something important, say so plainly and describe what to look for (no brands, no links, no pushing to shop).
Keep replies under 120 words. Use short paragraphs or a short list. No markdown headings.
Their preferences: ${JSON.stringify({
      style: prefs.vibes ?? [],
      dressCode: prefs.preferredFormality ?? null,
      favouriteColours: prefs.favoriteColors ?? [],
      fit: prefs.fit ?? null,
    })}
Their wardrobe: ${JSON.stringify(compact)}
Return ONLY JSON: { "reply": "your message", "itemIds": ["ids of wardrobe items you recommend in this reply, max 6"] }`;

    const result = await callGeminiJson<{ reply?: unknown; itemIds?: unknown }>({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
    });

    const reply = typeof result.reply === 'string' ? result.reply.trim().slice(0, 2000) : '';
    if (!reply) throw new GeminiError("The stylist didn't answer this time. Try again.", 502);

    const byId = new Map(closet.map((i) => [i.id, i]));
    const ids = Array.isArray(result.itemIds) ? result.itemIds : [];
    const items = [...new Set(ids.filter((id): id is string => typeof id === 'string' && byId.has(id)))]
      .slice(0, 6)
      .map((id) => {
        const i = byId.get(id)!;
        return { id: i.id, name: i.name, category: i.category, image_url: i.image_url };
      });

    await supabase.from('users').update({ daily_chat_used: used + 1 }).eq('id', userId);
    return json({ success: true, reply, items, remaining: DAILY_CHAT_LIMIT - used - 1 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[stylist-chat]', message);
    const status = err instanceof GeminiError || err instanceof AuthError ? err.status : 500;
    return json({ error: message }, status);
  }
});
