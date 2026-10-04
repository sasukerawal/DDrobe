// Supabase Edge Function: post-comment
// The only way to add a Lookbook comment: checks the post is visible, applies a daily
// cap, and moderates the text with Gemini before saving.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callGeminiJson, GeminiError } from '../_shared/gemini.ts';
import { AuthError, requireUserId } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAX_LENGTH = 300;
const DAILY_COMMENT_LIMIT = 50;

const MODERATION_PROMPT = `You moderate comments on a friendly fashion community app.
Reject harassment, hate, sexual content, threats, spam, scams, links to other sites, and sharing of personal contact details.
Allow honest fashion opinions, including mild criticism of an outfit.
Return ONLY JSON: { "isSafe": boolean, "reason": "short reason" }`;

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
    const { postId, body } = await req.json().catch(() => ({}));
    const text = typeof body === 'string' ? body.trim() : '';
    if (typeof postId !== 'string' || !postId) return json({ error: 'Missing postId' }, 400);
    if (!text) return json({ error: 'Write something first.' }, 400);
    if (text.length > MAX_LENGTH) return json({ error: `Keep comments under ${MAX_LENGTH} characters.` }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const since = new Date(Date.now() - 86400000).toISOString();
    const [postRes, countRes] = await Promise.all([
      supabase.from('feed_posts').select('id, moderation_status').eq('id', postId).maybeSingle(),
      supabase.from('post_comments').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since),
    ]);
    if (postRes.error) throw postRes.error;
    if (!postRes.data || postRes.data.moderation_status !== 'approved') return json({ error: 'This post is no longer available.' }, 404);
    if ((countRes.count ?? 0) >= DAILY_COMMENT_LIMIT) {
      return json({ error: "You've reached today's comment limit. Try again tomorrow." }, 429);
    }

    const verdict = await callGeminiJson<{ isSafe?: boolean }>({
      system_instruction: { parts: [{ text: MODERATION_PROMPT }] },
      contents: [{ parts: [{ text: `Comment: ${text}` }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    });
    if (verdict.isSafe !== true) {
      return json({ error: "This comment can't be posted because it may break the community guidelines." }, 422);
    }

    const { data: comment, error: insertError } = await supabase
      .from('post_comments')
      .insert({ post_id: postId, user_id: userId, body: text })
      .select('id, post_id, user_id, body, created_at')
      .single();
    if (insertError) throw insertError;

    return json({ success: true, comment });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[post-comment]', message);
    const status = err instanceof GeminiError || err instanceof AuthError ? err.status : 500;
    return json({ error: message }, status);
  }
});
