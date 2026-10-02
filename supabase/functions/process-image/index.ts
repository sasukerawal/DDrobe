// Supabase Edge Function: process-image
// Receives a base64 image, calls Gemini Vision for tagging, saves to closet_items.
// Uses gemini-2.0-flash via the Gemini REST API (no SDK needed in Deno).
// Cost: Gemini free tier covers 1,500 requests/day = ~$0.00 for typical usage.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

interface ProcessImageBody {
  imageBase64: string;
  userId: string;
}

interface AITagResult {
  category: 'top' | 'bottom' | 'shoe' | 'outerwear' | 'accessory';
  color: string;
  pattern: string;
  season: string[];
  formality: 'casual' | 'business_casual' | 'formal';
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const body: ProcessImageBody = await req.json();
    const { imageBase64, userId } = body;

    if (!imageBase64 || !userId) {
      return new Response(JSON.stringify({ error: 'Missing imageBase64 or userId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Upload image to Supabase Storage
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const imageBuffer = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
    const fileName = `${userId}/${crypto.randomUUID()}.jpg`;

    const { data: storageData, error: storageError } = await supabase.storage
      .from('closet-images')
      .upload(fileName, imageBuffer, { contentType: 'image/jpeg', upsert: false });

    if (storageError) throw storageError;

    const { data: urlData } = supabase.storage
      .from('closet-images')
      .getPublicUrl(storageData.path);
    const imageUrl = urlData.publicUrl;

    // Step 2: Call Gemini Vision API with the base64 image
    const geminiResponse = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Analyze this clothing item. Return ONLY a valid JSON object matching this exact structure, with no markdown, no code fences, no extra text:
{
  "category": "top" | "bottom" | "shoe" | "outerwear" | "accessory",
  "color": "string (primary color name)",
  "pattern": "string (e.g., solid, striped, floral, plaid, graphic)",
  "season": ["spring" | "summer" | "autumn" | "winter"],
  "formality": "casual" | "business_casual" | "formal"
}`,
              },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json', // Force JSON output from Gemini
          maxOutputTokens: 200,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      throw new Error(`Gemini API error: ${errText}`);
    }

    const geminiData = await geminiResponse.json();
    const rawContent: string = geminiData.candidates[0].content.parts[0].text;
    const tags: AITagResult = JSON.parse(rawContent);

    // Step 3: Insert into closet_items
    const { data: newItem, error: insertError } = await supabase
      .from('closet_items')
      .insert({
        user_id: userId,
        image_url: imageUrl,
        category: tags.category,
        color: tags.color,
        pattern: tags.pattern,
        season: tags.season,
        formality: tags.formality,
        is_in_wash: false,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ success: true, item: newItem }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[process-image]', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
