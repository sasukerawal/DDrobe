// Supabase Edge Function: create-post
// Receives an image_url and caption.
// Moderates the content using Gemini API.
// Inserts into feed_posts with approved/rejected status.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

interface CreatePostBody {
  userId: string;
  imageUrl: string;
  caption: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const body: CreatePostBody = await req.json();
    const { userId, imageUrl, caption } = body;

    if (!userId || !imageUrl) {
      return new Response(JSON.stringify({ error: 'Missing required parameters.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Moderate content with Gemini
    const systemPrompt = `You are a content moderation AI. Analyze the provided image and caption. 
Determine if the content violates community guidelines (e.g., NSFW, nudity, violence, hate speech, illegal acts).
Return ONLY a JSON object matching this structure:
{
  "isSafe": boolean,
  "reason": "short explanation if not safe, or 'safe'"
}`;

    const geminiResponse = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          {
            parts: [
              { text: `Caption: ${caption}` }
              // Note: Since we only have imageUrl and not base64 here, we might need to fetch the image to send to Gemini, 
              // but for now, we will moderate the text caption. In a full implementation, we'd fetch the image buffer or send the URL to Gemini if supported.
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 100,
        },
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
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: newPost, error: insertError } = await supabase
      .from('feed_posts')
      .insert({
        user_id: userId,
        image_url: imageUrl,
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
