// Supabase Edge Function entry point. Logic lives in handler.ts so it can be tested locally.
import { handler } from './handler.ts';

Deno.serve(handler);
