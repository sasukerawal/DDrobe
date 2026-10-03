// Supabase Edge Function: process-image
// Receives a base64 image, tags it with Gemini, uploads it, and saves to closet_items.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callGeminiJson, GeminiError } from '../_shared/gemini.ts';
import { AuthError, requireUserId } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CATEGORIES = ['top', 'bottom', 'shoe', 'outerwear', 'accessory'] as const;
const FORMALITIES = ['casual', 'business_casual', 'formal'] as const;
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

interface ProcessImageBody {
  imageBase64: string;
}

interface AITagResult {
  name?: string;
  category: string;
  color: string;
  pattern: string;
  season: string[];
  formality: string;
}

const TAG_PROMPT = `Analyze this clothing item. Return ONLY a JSON object with this structure:
{
  "name": "short descriptive name, 2-5 words, e.g. Black leather slip-on shoes",
  "category": "top" | "bottom" | "shoe" | "outerwear" | "accessory",
  "color": "string (primary color name)",
  "pattern": "string (e.g., solid, striped, floral, plaid, graphic)",
  "season": ["spring" | "summer" | "autumn" | "winter"],
  "formality": "casual" | "business_casual" | "formal"
}`;

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
    const { imageBase64 }: ProcessImageBody = await req.json();
    if (!imageBase64) return json({ error: 'Missing imageBase64' }, 400);

    const tags = await callGeminiJson<AITagResult>({
      contents: [{
        parts: [
          { text: TAG_PROMPT },
          { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
        ],
      }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 200 },
    });

    const category = CATEGORIES.includes(tags.category as typeof CATEGORIES[number]) ? tags.category : null;
    if (!category) {
      return json({ error: "That doesn't look like a clothing item. Try a clearer photo." }, 422);
    }
    const formality = FORMALITIES.includes(tags.formality as typeof FORMALITIES[number]) ? tags.formality : 'casual';
    const season = Array.isArray(tags.season) ? tags.season.filter((s) => SEASONS.includes(s)) : [];

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const imageBuffer = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
    const fileName = `${userId}/${crypto.randomUUID()}.jpg`;

    const { data: storageData, error: storageError } = await supabase.storage
      .from('closet-images')
      .upload(fileName, imageBuffer, { contentType: 'image/jpeg', upsert: false });
    if (storageError) throw storageError;

    const { data: urlData } = supabase.storage.from('closet-images').getPublicUrl(storageData.path);

    const { data: newItem, error: insertError } = await supabase
      .from('closet_items')
      .insert({
        user_id: userId,
        image_url: urlData.publicUrl,
        name: typeof tags.name === 'string' ? tags.name.trim().slice(0, 80) : '',
        category,
        color: tags.color ?? '',
        pattern: tags.pattern ?? '',
        season,
        formality,
        is_in_wash: false,
      })
      .select()
      .single();

    if (insertError) {
      await supabase.storage.from('closet-images').remove([storageData.path]);
      throw insertError;
    }

    return json({ success: true, item: newItem });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[process-image]', message);
    const status = err instanceof GeminiError || err instanceof AuthError ? err.status : 500;
    return json({ error: message }, status);
  }
});
