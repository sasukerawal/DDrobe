// Supabase Edge Function: parse-receipt
// Triggered by email webhook (SendGrid/Postmark inbound parse).
// Scrapes product image URLs from order confirmation emails.
// Tags each item with Gemini Vision and saves to closet_items.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${GEMINI_API_KEY}`;

interface WebhookPayload {
  from: string;
  to: string;
  subject: string;
  html: string;
  userId: string;
}

interface AITagResult {
  category: 'top' | 'bottom' | 'shoe' | 'outerwear' | 'accessory';
  color: string;
  pattern: string;
  season: string[];
  formality: 'casual' | 'business_casual' | 'formal';
}

/**
 * Extracts product image URLs from the raw HTML of an order confirmation email.
 */
function extractProductImageUrls(html: string): string[] {
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1];
    if (
      src.startsWith('http') &&
      !src.includes('tracking') &&
      !src.includes('pixel') &&
      !src.includes('logo') &&
      !src.includes('icon')
    ) {
      matches.push(src);
    }
  }

  return [...new Set(matches)].slice(0, 20);
}

/**
 * Fetches a remote image and returns it as a base64 string.
 */
async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  } catch {
    return null;
  }
}

/**
 * Tags a single product image via Gemini Vision.
 */
async function tagImageWithGemini(imageBase64: string): Promise<AITagResult | null> {
  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Analyze this clothing item. Return ONLY a valid JSON object with no extra text:
{
  "category": "top" | "bottom" | "shoe" | "outerwear" | "accessory",
  "color": "string",
  "pattern": "string (e.g., solid, striped, floral, plaid, graphic)",
  "season": ["spring" | "summer" | "autumn" | "winter"],
  "formality": "casual" | "business_casual" | "formal"
}
If this is NOT a clothing item (logo, banner, etc.), return: {"skip": true}`,
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
          responseMimeType: 'application/json',
          maxOutputTokens: 200,
        },
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const raw: string = data.candidates[0].content.parts[0].text;
    const parsed = JSON.parse(raw);

    if (parsed.skip) return null;
    return parsed as AITagResult;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const payload: WebhookPayload = await req.json();
    const { html, userId } = payload;

    if (!html || !userId) {
      return new Response(JSON.stringify({ error: 'Missing html or userId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const productImageUrls = extractProductImageUrls(html);

    if (productImageUrls.length === 0) {
      return new Response(
        JSON.stringify({ success: true, itemsAdded: 0, message: 'No product images found in email' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    let itemsAdded = 0;

    for (const imageUrl of productImageUrls) {
      // Fetch the remote stock photo and convert to base64 for Gemini
      const base64 = await fetchImageAsBase64(imageUrl);
      if (!base64) continue;

      const tags = await tagImageWithGemini(base64);
      if (!tags) continue;

      const { error } = await supabase.from('closet_items').insert({
        user_id: userId,
        image_url: imageUrl,
        category: tags.category,
        color: tags.color,
        pattern: tags.pattern,
        season: tags.season,
        formality: tags.formality,
        is_in_wash: false,
      });

      if (!error) itemsAdded++;
    }

    // TODO Sprint 2: Send Expo push notification when items are ready.

    return new Response(JSON.stringify({ success: true, itemsAdded }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[parse-receipt]', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
