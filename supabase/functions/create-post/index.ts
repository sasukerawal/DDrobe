// Supabase Edge Function: create-post
// Moderates an image + caption with Gemini BEFORE anything becomes public.
// Accepts either a new photo (imageBase64) or one of the caller's own closet images (imageUrl).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callGeminiJson, GeminiError } from '../_shared/gemini.ts';
import { AuthError, requireUserId } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAX_CAPTION = 200;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

interface CreatePostBody {
  imageUrl?: string;
  imageBase64?: string;
  caption?: string;
}

const MODERATION_PROMPT = `You are a content moderation AI. Analyze the image and caption for community guideline violations (NSFW, nudity, violence, hate speech, illegal acts).
Return ONLY a JSON object: { "isSafe": boolean, "reason": "short explanation or 'safe'" }`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  try {
    const userId = await requireUserId(req);
    const { imageUrl, imageBase64, caption: rawCaption }: CreatePostBody = await req.json();
    const caption = (rawCaption ?? '').trim().slice(0, MAX_CAPTION);

    if (!imageUrl && !imageBase64) return json({ error: 'Missing image' }, 400);

    let base64ForModeration: string;
    if (imageBase64) {
      base64ForModeration = imageBase64;
    } else {
      const ownPrefix = `${SUPABASE_URL}/storage/v1/object/public/closet-images/${userId}/`;
      if (!imageUrl!.startsWith(ownPrefix)) {
        return json({ error: 'You can only share photos from your own wardrobe.' }, 403);
      }
      const res = await fetch(imageUrl!);
      if (!res.ok) return json({ error: 'Could not load that photo.' }, 400);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > MAX_IMAGE_BYTES) return json({ error: 'Photo is too large.' }, 413);
      base64ForModeration = toBase64(bytes);
    }

    const moderation = await callGeminiJson<{ isSafe?: boolean }>({
      system_instruction: { parts: [{ text: MODERATION_PROMPT }] },
      contents: [{
        parts: [
          { text: `Caption: ${caption}` },
          { inlineData: { mimeType: 'image/jpeg', data: base64ForModeration } },
        ],
      }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 100 },
    });

    if (moderation.isSafe !== true) {
      return json({ success: true, isSafe: false });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let publicUrl = imageUrl!;
    let uploadedPath: string | null = null;

    if (imageBase64) {
      const imageBuffer = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
      if (imageBuffer.length > MAX_IMAGE_BYTES) return json({ error: 'Photo is too large.' }, 413);
      const fileName = `posts/${userId}/${crypto.randomUUID()}.jpg`;
      const { data: storageData, error: storageError } = await supabase.storage
        .from('lookbook-posts')
        .upload(fileName, imageBuffer, { contentType: 'image/jpeg', upsert: false });
      if (storageError) throw storageError;
      uploadedPath = storageData.path;
      publicUrl = supabase.storage.from('lookbook-posts').getPublicUrl(storageData.path).data.publicUrl;
    }

    const { data: newPost, error: insertError } = await supabase
      .from('feed_posts')
      .insert({ user_id: userId, image_url: publicUrl, caption, moderation_status: 'approved' })
      .select()
      .single();

    if (insertError) {
      if (uploadedPath) await supabase.storage.from('lookbook-posts').remove([uploadedPath]);
      throw insertError;
    }

    return json({ success: true, post: newPost, isSafe: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[create-post]', message);
    const status = err instanceof GeminiError || err instanceof AuthError ? err.status : 500;
    return json({ error: message }, status);
  }
});
