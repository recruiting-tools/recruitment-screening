const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiResponse {
  candidates: Array<{
    content: { parts: Array<{ text: string }> };
  }>;
}

// Round-robin key rotation — each call picks the next key
let keyIndex = 0;

export function pickKey(commaKeys: string): string {
  const keys = commaKeys.split(',').map(k => k.trim()).filter(Boolean);
  if (!keys.length) throw new Error('No GEMINI_API_KEYS configured');
  const key = keys[keyIndex % keys.length];
  keyIndex++;
  return key;
}

export interface GeminiOptions {
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

const DEFAULTS: Required<GeminiOptions> = {
  model: 'gemini-2.5-flash',
  maxOutputTokens: 2048,
  temperature: 0.3,
  jsonMode: true,
};

/**
 * Call Gemini API. Supports configurable model, token limit, and output mode.
 * For pipeline functions, use model='gemini-2.5-flash' and jsonMode as needed.
 */
export async function askGemini(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  opts?: GeminiOptions,
): Promise<string> {
  const { model, maxOutputTokens, temperature, jsonMode } = { ...DEFAULTS, ...opts };
  const url = `${GEMINI_API}/${model}:generateContent?key=${apiKey}`;

  const generationConfig: Record<string, unknown> = {
    temperature,
    maxOutputTokens,
  };
  if (jsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');
  return text.trim();
}

/**
 * Call Gemini with retry on 429/5xx — rotates through all available keys.
 * Use for pipeline functions where reliability matters.
 */
export async function askGeminiWithRetry(
  commaKeys: string,
  systemPrompt: string,
  userPrompt: string,
  opts?: GeminiOptions,
): Promise<string> {
  const keys = commaKeys.split(',').map(k => k.trim()).filter(Boolean);
  if (!keys.length) throw new Error('No GEMINI_API_KEYS configured');

  const startIdx = Math.floor(Math.random() * keys.length);
  let lastError = '';

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const key = keys[(startIdx + attempt) % keys.length];
    try {
      return await askGemini(key, systemPrompt, userPrompt, opts);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // Retry on rate limit or server error
      if (lastError.includes('429') || lastError.includes(' 5')) {
        console.warn(`[askGemini] key #${(startIdx + attempt) % keys.length} failed: ${lastError.slice(0, 100)}, trying next…`);
        continue;
      }
      throw err; // Non-retryable error
    }
  }

  throw new Error(`All ${keys.length} Gemini keys exhausted. Last error: ${lastError}`);
}

export function parseJSON<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`[${label}] JSON parse failed:`, err, '\nRaw:', raw.slice(0, 500));
    throw new Error(`${label} returned invalid JSON: ${String(err)}`);
  }
}
