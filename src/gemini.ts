const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-2.0-flash';

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

export async function askGemini(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const url = `${GEMINI_API}/${MODEL}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
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

export function parseJSON<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`[${label}] JSON parse failed:`, err, '\nRaw:', raw.slice(0, 500));
    throw new Error(`${label} returned invalid JSON: ${String(err)}`);
  }
}
