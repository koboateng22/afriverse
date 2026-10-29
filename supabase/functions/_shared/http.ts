// Shared HTTP helpers for every edge function.

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** An error that should reach the caller with a specific status code. */
export class HttpError extends Error {
  status: number;
  code: string;
  extra?: Record<string, unknown>;
  constructor(status: number, code: string, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Turns any thrown value into a JSON error response (and logs unexpected ones). */
export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: err.code, message: err.message, ...err.extra }, err.status);
  }
  console.error(err);
  const message = err instanceof Error ? err.message : 'Unexpected server error';
  return json({ error: 'server_error', message }, 500);
}

/** Wraps a handler with CORS preflight, POST-only and uniform error handling. */
export function handle(fn: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed', message: 'Use POST' }, 405);
    try {
      return await fn(req);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'bad_json', 'Request body must be a JSON object');
  }
}
