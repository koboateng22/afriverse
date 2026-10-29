// INTEGRATION: gemini — Google Gemini REST API (generateContent).
import { optionalEnv, requireEnv } from './env.ts';
import { HttpError } from './http.ts';

export type GeminiPart = { text: string } | { fileData: { fileUri: string } };
export type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

type GenerateOptions = {
  system: string;
  contents: GeminiContent[];
  json?: { schema: Record<string, unknown> };
  lowMediaResolution?: boolean;
  timeoutMs?: number;
  maxOutputTokens?: number;
};

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

/** Model is configurable so you can move to newer releases without a code change. */
export function geminiModel(): string {
  return optionalEnv('GEMINI_MODEL') ?? 'gemini-3.8-flash';
}

export async function generate(opts: GenerateOptions): Promise<string> {
  const key = requireEnv('GEMINI_API_KEY');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 25_000);
  try {
    const base = (optionalEnv('GEMINI_API_BASE') ?? 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
    const res = await fetch(`${base}/v1beta/models/${geminiModel()}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: opts.contents,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: opts.maxOutputTokens ?? 800,
          ...(opts.json ? { responseMimeType: 'application/json', responseSchema: opts.json.schema } : {}),
          ...(opts.lowMediaResolution ? { mediaResolution: 'MEDIA_RESOLUTION_LOW' } : {}),
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      }),
    });
    const payload = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (!res.ok) throw new HttpError(502, 'gemini_error', `Gemini error: ${payload.error?.message ?? res.statusText}`);
    if (payload.promptFeedback?.blockReason) throw new HttpError(422, 'gemini_blocked', 'That message was blocked by the safety filter');
    const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
    if (!text) throw new HttpError(502, 'gemini_empty', 'Gemini returned an empty answer');
    return text;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new HttpError(504, 'gemini_timeout', 'Gemini took too long to answer');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
