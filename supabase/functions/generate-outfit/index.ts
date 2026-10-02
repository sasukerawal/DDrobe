// Supabase Edge Function: generate-outfit
// Receives user latitude, longitude, and closet_items.
// Fetches weather from OpenWeatherMap, then calls Gemini API to generate 3 outfits.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENWEATHER_API_KEY = Deno.env.get('OPENWEATHER_API_KEY')!;

const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

interface ClosetItem {
  id: string;
  category: string;
  color: string;
  pattern: string;
  season: string[];
  formality: string;
  is_in_wash: boolean;
}

interface GenerateOutfitBody {
  userId: string;
  lat: number;
  lon: number;
  closetItems: ClosetItem[];
}

interface WeatherContext {
  temp_celsius: number;
  condition: string;
  city: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const body: any = await req.json();
    const { userId, lat, lon, closetItems, count = 3, vacationContext } = body;

    if (!userId || !closetItems || closetItems.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing required parameters or empty closet.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Fetch Weather
    let weatherContext: WeatherContext = { temp_celsius: 20, condition: 'Clear', city: 'Unknown' };
    if (OPENWEATHER_API_KEY && OPENWEATHER_API_KEY !== 'your_openweather_api_key_here') {
      try {
        const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${OPENWEATHER_API_KEY}`;
        const weatherRes = await fetch(weatherUrl);
        if (weatherRes.ok) {
          const weatherData = await weatherRes.json();
          weatherContext = {
            temp_celsius: Math.round(weatherData.main.temp),
            condition: weatherData.weather[0]?.main || 'Clear',
            city: weatherData.name,
          };
        }
      } catch (e) {
        console.error('Weather fetch error:', e);
      }
    }

    // Filter available items
    const availableItems = closetItems.filter((i) => !i.is_in_wash);

    // Step 2: Call Gemini API
    let systemPrompt = `You are a professional fashion stylist. You will be given a list of clothing items in a user's closet and the current weather context.
Your task is to generate exactly ${count} outfit recommendations for today:
1. Casual
2. Office
3. Trendy (or alternate styles if more than 3)`;

    if (vacationContext) {
      systemPrompt += `\n\nCRITICAL OVERRIDE: The user is packing for a vacation/trip with this constraint: "${vacationContext}". 
PRIORITIZE items suitable for this constraint over the local daily weather. Create ${count} outfits that fit this vibe perfectly.`;
    }

    systemPrompt += `\n\nConstraints:
- You MUST only use items from the provided list.
- An outfit MUST have exactly one 'top' and one 'bottom' (or 'outerwear' if appropriate, but standard is top+bottom), and one 'shoe'.
- You may include up to one 'accessory' if it matches.
- Consider the weather: Temperature is ${weatherContext.temp_celsius}C and condition is ${weatherContext.condition} in ${weatherContext.city}.
- Consider color theory and matching patterns.
- Occasionally (about 50% of the time), inject a "sponsored" or "trending" item (e.g., a cool jacket, hat, or shoes) that IS NOT in the user's closet, but pairs perfectly with their items. For this sponsored item, add an \`affiliateLink\` property with a fake URL (e.g., "https://amazon.com/dp/fake").

Return ONLY a JSON array of 3 objects matching this exact structure, with no markdown, no extra text:
[
  {
    "id": "generate-a-unique-uuid-here",
    "style": "Casual",
    "description": "Short explanation of why this works together and suits the weather.",
    "top": { item object exactly as provided },
    "bottom": { item object exactly as provided },
    "shoe": { item object exactly as provided },
    "accessory": { item object exactly as provided, or null },
    "sponsoredItem": { "category": "...", "color": "...", "pattern": "...", "affiliateLink": "..." } // Optional
  }
]`;

    const promptText = `
Weather: ${weatherContext.temp_celsius}C, ${weatherContext.condition}, ${weatherContext.city}
Available Items: ${JSON.stringify(availableItems)}
`;

    const geminiResponse = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          {
            parts: [{ text: promptText }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 1500,
          temperature: 0.7,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      throw new Error(`Gemini API error: ${errText}`);
    }

    const geminiData = await geminiResponse.json();
    const rawContent: string = geminiData.candidates[0].content.parts[0].text;
    const outfits = JSON.parse(rawContent);

    return new Response(JSON.stringify({ success: true, weather: weatherContext, outfits }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[generate-outfit]', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
