const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
// Retries alternate models so a demand spike on one doesn't stall the request.
const MODELS = ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest'];
const modelUrl = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 6;
const MIN_OUTPUT_TOKENS = 8192;

export class GeminiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// Sends a generateContent request and returns the parsed JSON the model produced.
export async function callGeminiJson<T>(body: Record<string, unknown>): Promise<T> {
  let lastStatus = 0;
  let lastMessage = '';

  // Thinking models spend output tokens on reasoning before answering, so small caps
  // truncate the JSON (gemini-3.5-flash used ~450 tokens thinking for one photo).
  const config = (body.generationConfig ?? {}) as { maxOutputTokens?: number };
  const requestBody = {
    ...body,
    generationConfig: { ...config, maxOutputTokens: Math.max(config.maxOutputTokens ?? 0, MIN_OUTPUT_TOKENS) },
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      const delay = 500 * 2 ** (attempt - 2) + Math.random() * 300;
      await new Promise((r) => setTimeout(r, delay));
    }

    const model = MODELS[attempt % MODELS.length];
    const res = await fetch(modelUrl(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (res.ok) {
      const data = await res.json();
      const candidate = data?.candidates?.[0];
      const text: string | undefined = candidate?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? '')
        .join('');

      if (candidate?.finishReason === 'MAX_TOKENS') {
        lastStatus = 502;
        lastMessage = `${model}: response cut off`;
        continue;
      }

      if (!text) {
        const reason = candidate?.finishReason ?? data?.promptFeedback?.blockReason ?? 'empty response';
        throw new GeminiError(`AI returned no content (${reason})`, 502);
      }

      try {
        return JSON.parse(stripFences(text)) as T;
      } catch {
        console.error('[gemini] unparseable output', model, candidate?.finishReason, text.slice(0, 300));
        throw new GeminiError('AI returned malformed JSON', 502);
      }
    }

    lastStatus = res.status;
    lastMessage = `${model}: ${await res.text()}`;
    if (!RETRYABLE.has(res.status)) break;
  }

  console.error('[gemini]', lastStatus, lastMessage);
  const friendly = lastStatus === 503 || lastStatus === 429
    ? 'The AI is busy right now. Please try again in a minute.'
    : `AI request failed (${lastStatus})`;
  throw new GeminiError(friendly, lastStatus === 429 ? 503 : 502);
}

function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}
