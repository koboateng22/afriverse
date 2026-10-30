// INTEGRATION: groq — Groq's OpenAI-compatible Chat Completions API.
// Replaces the former Gemini client. `generate()` keeps the same inputs and
// returns the same plain text (or JSON text), so callers did not change shape.
import { optionalEnv, requireEnv } from './env.ts';
import { HttpError } from './http.ts';

/** One turn of conversation. 'model' is accepted as an alias of 'assistant'. */
export type AiContent = { role: 'user' | 'model' | 'assistant'; parts: Array<{ text: string }> };

type GenerateOptions = {
  system: string;
  contents: AiContent[];
  /** Ask for a JSON object shaped like this JSON Schema. */
  json?: { schema: Record<string, unknown> };
  timeoutMs?: number;
  /** Rough cap on the visible answer's length. */
  maxOutputTokens?: number;
};

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

type GroqResponse = {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  error?: { message?: string; code?: string };
};

/**
 * Default model. `llama-3.3-70b-versatile` was retired by Groq on 16 Aug 2026
 * (requests to it now error); Groq names `openai/gpt-oss-120b` as its production
 * replacement. Override without a code change with the GROQ_MODEL secret.
 */
export function aiModel(): string {
  return optionalEnv('GROQ_MODEL') ?? 'openai/gpt-oss-120b';
}

/** gpt-oss models reason before answering; they take reasoning controls the others reject. */
const isReasoningModel = (model: string) => model.startsWith('openai/gpt-oss');

/** Never abort a call sooner than this, whatever a caller passes. */
const MIN_TIMEOUT_MS = 20_000;
const DEFAULT_TIMEOUT_MS = 25_000;
/** Reasoning tokens count toward the completion budget; leave room so the answer isn't cut off. */
const REASONING_HEADROOM_TOKENS = 1_536;

function toMessages(system: string, contents: AiContent[]): ChatMessage[] {
  return [
    { role: 'system', content: system },
    ...contents.map((c): ChatMessage => ({
      role: c.role === 'user' ? 'user' : 'assistant',
      content: c.parts.map((p) => p.text).join('\n'),
    })),
  ];
}

/** JSON mode can still arrive wrapped in a ```json fence; return just the object text. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

export async function generate(opts: GenerateOptions): Promise<string> {
  const key = requireEnv('GROQ_API_KEY'); // Deno.env.get('GROQ_API_KEY'), with a clear error if unset
  const model = aiModel();
  const controller = new AbortController();
  const timeoutMs = Math.max(MIN_TIMEOUT_MS, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // JSON object mode requires the word "JSON" in the prompt; the schema goes in the
  // system message, and the handler still validates and clips every field it uses.
  const system = opts.json
    ? `${opts.system}\n\nRespond with a single JSON object only — no prose, no code fences — matching this JSON Schema:\n${JSON.stringify(opts.json.schema)}`
    : opts.system;

  const answerTokens = opts.maxOutputTokens ?? 800;
  const reasoning = isReasoningModel(model);

  try {
    const base = (optionalEnv('GROQ_API_BASE') ?? 'https://api.groq.com/openai/v1').replace(/\/$/, '');
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: toMessages(system, opts.contents),
        temperature: 0.3,
        max_completion_tokens: reasoning ? answerTokens + REASONING_HEADROOM_TOKENS : answerTokens,
        ...(reasoning ? { reasoning_effort: 'low', include_reasoning: false } : {}),
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    const payload = (await res.json().catch(() => ({}))) as GroqResponse;
    if (!res.ok) {
      const detail = payload.error?.message ?? res.statusText;
      if (res.status === 429) throw new HttpError(503, 'ai_busy', 'The AI service is busy right now — please try again in a moment.');
      throw new HttpError(502, 'ai_error', `AI error: ${detail}`);
    }

    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) throw new HttpError(502, 'ai_empty', 'The AI returned an empty answer');
    return opts.json ? extractJson(text) : text;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new HttpError(504, 'ai_timeout', 'The AI took too long to answer');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
