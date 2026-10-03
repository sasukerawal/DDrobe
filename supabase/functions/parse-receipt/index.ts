// Supabase Edge Function: parse-receipt
// Reads one order-confirmation email and returns the clothing items it contains.
// Extract-only: nothing is written to the database; the app adds items the user picks.

import { callGeminiJson, GeminiError } from '../_shared/gemini.ts';
import { AuthError, requireUserId } from '../_shared/auth.ts';

const CATEGORIES = ['top', 'bottom', 'shoe', 'outerwear', 'accessory'];
const MAX_IMAGES = 40;
const MAX_TEXT_CHARS = 12000;

interface ParseReceiptBody {
  emailHtml: string;
  emailSubject?: string;
  fromAddress?: string;
}

interface ExtractedItem {
  name: string;
  category: string;
  imageIndex: number | null;
}

interface ImageCandidate {
  url: string;
  alt: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function extractImages(html: string): ImageCandidate[] {
  const out: ImageCandidate[] = [];
  const seen = new Set<string>();
  const imgRegex = /<img\b[^>]*>/gi;
  let tag: RegExpExecArray | null;

  while ((tag = imgRegex.exec(html)) !== null && out.length < MAX_IMAGES) {
    const src = tag[0].match(/\ssrc=["']([^"']+)["']/i)?.[1];
    if (!src) continue;
    const url = decodeEntities(src);
    if (!url.startsWith('https://') || seen.has(url)) continue;
    if (/pixel|tracking|beacon|spacer|logo|icon|social|badge|1x1/i.test(url)) continue;
    const width = Number(tag[0].match(/\swidth=["']?(\d+)/i)?.[1] ?? '0');
    if (width > 0 && width < 60) continue;
    seen.add(url);
    const alt = decodeEntities(tag[0].match(/\salt=["']([^"']*)["']/i)?.[1] ?? '').slice(0, 120);
    out.push({ url, alt });
  }
  return out;
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

const SYSTEM_PROMPT = `You read online-shopping order confirmation emails and list the clothing items that were bought.
Only include wearable items: tops, bottoms, dresses (category "top"), shoes, outerwear, and accessories like bags, hats, belts, jewelry, scarves.
Ignore non-clothing products, shipping lines, discounts, recommendations ("you may also like"), and marketing.
For each item, pick the product photo from the numbered image list that matches it, or null if none matches.
Return ONLY a JSON array (empty if there are no clothing items):
[{ "name": "short product name", "category": "top" | "bottom" | "shoe" | "outerwear" | "accessory", "imageIndex": number | null }]`;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  try {
    await requireUserId(req);
    const { emailHtml, emailSubject = '', fromAddress = '' }: ParseReceiptBody = await req.json();
    if (!emailHtml) return json({ error: 'Missing emailHtml' }, 400);

    const images = extractImages(emailHtml);
    const text = htmlToText(emailHtml);
    if (!text) return json({ success: true, items: [] });

    const imageList = images.length
      ? images.map((img, i) => `[${i}] ${img.alt || '(no alt text)'} — ${img.url}`).join('\n')
      : '(no product images)';

    const result = await callGeminiJson<unknown>({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{
        parts: [{
          text: `From: ${fromAddress}\nSubject: ${emailSubject}\n\nImages:\n${imageList}\n\nEmail text:\n${text}`,
        }],
      }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1200, temperature: 0.1 },
    });

    const extracted: ExtractedItem[] = Array.isArray(result) ? result : [];
    const items = extracted
      .filter((it) => it && typeof it.name === 'string' && CATEGORIES.includes(it.category))
      .slice(0, 20)
      .map((it) => {
        const idx = typeof it.imageIndex === 'number' ? it.imageIndex : -1;
        return {
          name: it.name.trim().slice(0, 120),
          category: it.category,
          imageUrl: idx >= 0 && idx < images.length ? images[idx].url : '',
        };
      });

    return json({ success: true, items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[parse-receipt]', message);
    const status = err instanceof GeminiError || err instanceof AuthError ? err.status : 500;
    return json({ error: message }, status);
  }
});
