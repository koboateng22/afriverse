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

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
/**
 * Groq's deprecations page lists DEFAULT_MODEL with a 16 Aug 2026 shutdown and
 * names this as its replacement. Used only when Groq rejects the chosen model.
 */
const FALLBACK_MODEL = 'openai/gpt-oss-120b';

/** Override without a code change with the GROQ_MODEL secret. */
export function aiModel(): string {
  return optionalEnv('GROQ_MODEL') ?? DEFAULT_MODEL;
}

/** True when Groq refused the request because the model itself is retired or unknown. */
function isModelUnavailable(status: number, payload: GroqResponse): boolean {
  if (status !== 400 && status !== 404) return false;
  const detail = `${payload.error?.code ?? ''} ${payload.error?.message ?? ''}`;
  return /model_(decommissioned|not_found)|model\b.*(decommissioned|does not exist|not found)/i.test(detail);
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
  const base = (optionalEnv('GROQ_API_BASE') ?? 'https://api.groq.com/openai/v1').replace(/\/$/, '');

  const request = async (name: string) => {
    const reasoning = isReasoningModel(name);
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: name,
        messages: toMessages(system, opts.contents),
        temperature: 0.3,
        max_completion_tokens: reasoning ? answerTokens + REASONING_HEADROOM_TOKENS : answerTokens,
        ...(reasoning ? { reasoning_effort: 'low', include_reasoning: false } : {}),
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    return { res, payload: (await res.json().catch(() => ({}))) as GroqResponse };
  };

  try {
    let { res, payload } = await request(model);
    if (!res.ok && model !== FALLBACK_MODEL && isModelUnavailable(res.status, payload)) {
      console.warn(`groq: model ${model} unavailable, using ${FALLBACK_MODEL}: ${payload.error?.message ?? res.statusText}`);
      ({ res, payload } = await request(FALLBACK_MODEL));
    }
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

// ── Vision ───────────────────────────────────────────────────────────────
/**
 * Groq retired llama-3.2-11b-vision-preview (and the 90b) on 14 Apr 2025, and the
 * Llama 4 vision models since. qwen/qwen3.8-27b is the vision model Groq's docs
 * list today. Override without a code change with the GROQ_VISION_MODEL secret.
 */
const DEFAULT_VISION_MODEL = 'qwen/qwen3.8-27b';

export function visionModel(): string {
  return optionalEnv('GROQ_VISION_MODEL') ?? DEFAULT_VISION_MODEL;
}

type VisionOptions = {
  prompt: string;
  /** data:image/...;base64,... */
  imageDataUrl: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
};

/** One image + one instruction → a JSON object's text (JSON mode). */
export async function readImageJson(opts: VisionOptions): Promise<string> {
  const key = requireEnv('GROQ_API_KEY');
  const model = visionModel();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(MIN_TIMEOUT_MS, opts.timeoutMs ?? 45_000));
  const base = (optionalEnv('GROQ_API_BASE') ?? 'https://api.groq.com/openai/v1').replace(/\/$/, '');

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        // Text and image in one user turn: the most widely supported vision request shape.
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: opts.prompt },
              { type: 'image_url', image_url: { url: opts.imageDataUrl } },
            ],
          },
        ],
        temperature: 0,
        max_completion_tokens: opts.maxOutputTokens ?? 1_000,
        response_format: { type: 'json_object' },
        // Qwen 3.x: 'none' = instruct mode. Reading a slip needs no reasoning, and it's faster.
        ...(model.startsWith('qwen/') ? { reasoning_effort: 'none' } : {}),
      }),
    });
    const payload = (await res.json().catch(() => ({}))) as GroqResponse;
    if (!res.ok) {
      const detail = payload.error?.message ?? res.statusText;
      if (res.status === 429) throw new HttpError(503, 'ai_busy', 'The scanner is busy right now — please try again in a moment.');
      if (isModelUnavailable(res.status, payload)) {
        console.error(`groq vision: model ${model} unavailable: ${detail}`);
        throw new HttpError(502, 'ai_model_unavailable', 'The scanner is being updated. Enter your grades by hand for now.');
      }
      throw new HttpError(502, 'ai_error', `AI error: ${detail}`);
    }
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) throw new HttpError(502, 'ai_empty', 'The scanner returned nothing. Try a clearer photo.');
    return extractJson(text);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new HttpError(504, 'ai_timeout', 'The scan took too long. Try again, or enter your grades by hand.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
