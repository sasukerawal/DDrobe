// Supabase Edge Function: create-post
// Receives an imageUrl (existing) or imageBase64 (selfie upload).
// Moderates BOTH the image AND caption via Gemini Vision.
// Inserts into feed_posts with approved/rejected status.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

interface CreatePostBody {
  userId: string;
  imageUrl?: string;
  imageBase64?: string;
  caption: string;
}

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const body: CreatePostBody = await req.json();
    const { userId, caption } = body;
    let { imageUrl, imageBase64 } = body;

    if (!userId || (!imageUrl && !imageBase64)) {
      return new Response(JSON.stringify({ error: 'Missing required parameters.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // If a raw selfie base64 was sent, upload it to storage first
    if (imageBase64 && !imageUrl) {
      const imageBuffer = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
      const fileName = `posts/${userId}/${crypto.randomUUID()}.jpg`;
      const { data: storageData, error: storageError } = await supabase.storage
        .from('lookbook-posts')
        .upload(fileName, imageBuffer, { contentType: 'image/jpeg', upsert: false });
      if (storageError) throw storageError;
      const { data: urlData } = supabase.storage.from('lookbook-posts').getPublicUrl(storageData.path);
      imageUrl = urlData.publicUrl;
    }

    // Fetch the image as base64 for Gemini Vision (if we only have a URL)
    const base64ForModeration = imageBase64 || await fetchImageAsBase64(imageUrl!);

    // Step 1: Moderate content with Gemini Vision (image + caption)
    const systemPrompt = `You are a content moderation AI. Analyze the image and caption for community guideline violations (NSFW, nudity, violence, hate speech, illegal acts).
Return ONLY a JSON object: { "isSafe": boolean, "reason": "short explanation or 'safe'" }`;

    const imageParts: object[] = [{ text: `Caption: ${caption || ''}` }];
    if (base64ForModeration) {
      imageParts.push({ inlineData: { mimeType: 'image/jpeg', data: base64ForModeration } });
    }

    const geminiResponse = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: imageParts }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 100 },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      throw new Error(`Gemini API error: ${errText}`);
    }

    const geminiData = await geminiResponse.json();
    const rawContent: string = geminiData.candidates[0].content.parts[0].text;
    const moderationResult = JSON.parse(rawContent);

    const status = moderationResult.isSafe ? 'approved' : 'rejected';

    // Step 2: Insert into feed_posts
    const { data: newPost, error: insertError } = await supabase
      .from('feed_posts')
      .insert({
        user_id: userId,
        image_url: imageUrl!,
        caption: caption || '',
        moderation_status: status,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ success: true, post: newPost, isSafe: moderationResult.isSafe }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[create-post]', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
