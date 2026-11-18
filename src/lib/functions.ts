import { getSupabase } from './supabase';

/** Error returned by one of our edge functions, with its JSON body preserved. */
export class FunctionError extends Error {
  status: number;
  code: string;
  body: Record<string, unknown>;
  constructor(status: number, code: string, message: string, body: Record<string, unknown>) {
    super(message);
    this.name = 'FunctionError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/** Thrown when `timeoutMs` passes before the function answers. */
export const TIMEOUT_CODE = 'timeout';

/**
 * Calls a Supabase Edge Function with the signed-in user's JWT.
 * Server secrets never reach the browser — only the function name and body do.
 * With `timeoutMs`, the request is aborted and a FunctionError('timeout') thrown
 * if no answer arrives in time.
 */
export async function invokeFunction<T>(name: string, body: Record<string, unknown>, opts: { timeoutMs?: number } = {}): Promise<T> {
  const controller = opts.timeoutMs ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    if (!controller) return;
    timer = setTimeout(() => {
      controller.abort();
      reject(new FunctionError(0, TIMEOUT_CODE, 'The request took too long.', {}));
    }, opts.timeoutMs);
  });
  let result: Awaited<ReturnType<ReturnType<typeof getSupabase>['functions']['invoke']>>;
  try {
    const call = getSupabase().functions.invoke(name, { body, ...(controller ? { signal: controller.signal } : {}) });
    result = controller ? await Promise.race([call, timeout]) : await call;
  } finally {
    clearTimeout(timer);
  }
  const { data, error } = result;
  if (!error) return data as T;

  // FunctionsHttpError carries the Response; surface the server's JSON message.
  const ctx = (error as { context?: unknown }).context;
  if (ctx instanceof Response) {
    let payload: Record<string, unknown> = {};
    try {
      payload = (await ctx.clone().json()) as Record<string, unknown>;
    } catch {
      /* non-JSON body */
    }
    const message = typeof payload.message === 'string' ? payload.message : `Request failed (${ctx.status})`;
    throw new FunctionError(ctx.status, String(payload.error ?? 'error'), message, payload);
  }
  throw new FunctionError(0, 'network', error.message || 'Could not reach the server. Check your connection.', {});
}
