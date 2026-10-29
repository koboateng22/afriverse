import { HttpError } from './http.ts';

// Tiny hand-rolled validators: every edge function validates its input
// before touching the database or calling a paid API.

const bad = (field: string, msg: string) => new HttpError(400, 'invalid_input', `${field}: ${msg}`, { field });

export function str(v: unknown, field: string, opts: { min?: number; max?: number; optional?: boolean } = {}): string {
  if (v === undefined || v === null || v === '') {
    if (opts.optional) return '';
    throw bad(field, 'is required');
  }
  if (typeof v !== 'string') throw bad(field, 'must be text');
  const s = v.trim();
  if (opts.min !== undefined && s.length < opts.min) throw bad(field, `must be at least ${opts.min} characters`);
  if (opts.max !== undefined && s.length > opts.max) throw bad(field, `must be at most ${opts.max} characters`);
  return s;
}

export function optStr(v: unknown, field: string, max: number): string | null {
  const s = str(v, field, { max, optional: true });
  return s === '' ? null : s;
}

export function int(v: unknown, field: string, opts: { min?: number; max?: number } = {}): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw bad(field, 'must be a whole number');
  if (opts.min !== undefined && v < opts.min) throw bad(field, `must be ≥ ${opts.min}`);
  if (opts.max !== undefined && v > opts.max) throw bad(field, `must be ≤ ${opts.max}`);
  return v;
}

export function oneOf<T extends string>(v: unknown, field: string, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    throw bad(field, `must be one of: ${allowed.join(', ')}`);
  }
  return v as T;
}

export function uuid(v: unknown, field: string): string {
  if (typeof v !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    throw bad(field, 'must be a valid id');
  }
  return v;
}

export function bool(v: unknown, field: string): boolean {
  if (typeof v !== 'boolean') throw bad(field, 'must be true or false');
  return v;
}

export function strArray(v: unknown, field: string, opts: { maxItems?: number; maxLen?: number } = {}): string[] {
  if (!Array.isArray(v)) throw bad(field, 'must be a list');
  if (opts.maxItems !== undefined && v.length > opts.maxItems) throw bad(field, `may have at most ${opts.maxItems} items`);
  return v.map((x, i) => str(x, `${field}[${i}]`, { min: 1, max: opts.maxLen ?? 500 }));
}

export function isoDate(v: unknown, field: string, optional = false): string | null {
  if ((v === null || v === undefined || v === '') && optional) return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw bad(field, 'must be a date (YYYY-MM-DD)');
  return v;
}

export function httpsUrl(v: unknown, field: string, optional = false): string | null {
  if ((v === null || v === undefined || v === '') && optional) return null;
  const s = str(v, field, { max: 500 });
  if (!/^https:\/\/[^\s]+$/.test(s)) throw bad(field, 'must start with https://');
  return s;
}

export function slug(v: unknown, field: string): string {
  const s = str(v, field, { min: 2, max: 80 });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) throw bad(field, 'use lowercase letters, numbers and dashes');
  return s;
}

export const CURRENCIES = ['GHS', 'NGN', 'USD', 'KES', 'ZAR'] as const;
export type Currency = (typeof CURRENCIES)[number];
