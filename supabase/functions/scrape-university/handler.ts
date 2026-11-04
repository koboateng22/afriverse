// scrape-university — admin "Auto-Fill from Website". Reads a university's
// home page for its logo (apple-touch-icon / icon) and cover (og:image),
// copies each image into the public university_assets bucket and returns
// those URLs, so our pictures never break when the university changes its site.
//
// It fetches URLs an admin typed, so it only talks to public hosts: IP
// literals, internal names and anything resolving to a private address are
// refused, on the first request and on every redirect. Images are checked by
// their bytes, not by what the server claims, and SVG is never stored.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { handle, HttpError, json, readJson } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { str } from '../_shared/validate.ts';

export const BUCKET = 'university_assets';
const PAGE_TIMEOUT_MS = 8_000;
const IMAGE_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 1_000_000; // the <head> is near the top; the rest is ignored
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // matches the bucket limit
const MAX_REDIRECTS = 4;
const MAX_TRIES = 4; // candidates tried per image before giving up
const USER_AGENT = 'Mozilla/5.0 (compatible; AfriversityBot/1.0; +https://www.afriversity.com)';

// ── URL safety ───────────────────────────────────────────────────────────
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.corp', '.intranet'];

/** True for IPv4 addresses no public website lives on. */
export function isPrivateIPv4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
}

/** True for IPv6 loopback, unspecified, unique-local, link-local and v4-mapped private addresses. */
export function isPrivateIPv6(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (s === '::' || s === '::1') return true;
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return /^f[cd]/.test(s) || /^fe[89ab]/.test(s);
}

/** Throws unless the URL is http(s) on a public host name (never an IP literal). */
export async function assertPublicUrl(url: URL, resolve: (host: string) => Promise<string[]> = resolveHost): Promise<void> {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new HttpError(400, 'bad_url', 'Only http and https links can be read');
  if (url.username || url.password) throw new HttpError(400, 'bad_url', 'Links with a username or password are not allowed');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const ipLiteral = /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':') || host.startsWith('[');
  if (ipLiteral || !host.includes('.') || host === 'localhost' || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new HttpError(400, 'blocked_host', 'Use the university’s public website address');
  }
  const addresses = await resolve(host);
  if (addresses.some((a) => (a.includes(':') ? isPrivateIPv6(a) : isPrivateIPv4(a)))) {
    throw new HttpError(400, 'blocked_host', 'That website points to a private network address');
  }
}

/** A and AAAA records. Empty if this runtime can't resolve (the fetch then fails or succeeds on its own). */
async function resolveHost(host: string): Promise<string[]> {
  const out: string[] = [];
  for (const type of ['A', 'AAAA'] as const) {
    try {
      out.push(...(await Deno.resolveDns(host, type)));
    } catch {
      /* no record of this type, or DNS lookups unavailable */
    }
  }
  return out;
}

/** The admin's input as a URL: "ug.edu.gh" becomes https://ug.edu.gh/. */
export function pageUrl(v: unknown): URL {
  const raw = str(v, 'url', { min: 4, max: 500 }).trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new HttpError(400, 'bad_url', 'That doesn’t look like a website address');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new HttpError(400, 'bad_url', 'Only http and https links can be read');
  return url;
}

/** fetch() that re-checks every redirect hop against assertPublicUrl. */
async function safeFetch(start: URL, accept: string, timeoutMs: number): Promise<{ res: Response; url: URL }> {
  let url = start;
  const signal = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(url);
    const res = await fetch(url, { redirect: 'manual', signal, headers: { 'User-Agent': USER_AGENT, Accept: accept } });
    const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!next) return { res, url };
    await res.body?.cancel();
    url = new URL(next, url);
  }
  throw new HttpError(502, 'too_many_redirects', 'The website redirected too many times');
}

/** Reads at most `max` bytes. truncate: keep the first `max` bytes instead of failing. */
async function readCapped(res: Response, max: number, truncate: boolean): Promise<Uint8Array<ArrayBuffer>> {
  if (!truncate && Number(res.headers.get('content-length') ?? 0) > max) {
    await res.body?.cancel();
    throw new Error('too large');
  }
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      if (!truncate) throw new Error('too large');
      chunks.push(value.subarray(0, value.byteLength - (total - max)));
      total = max;
      break;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

// ── HTML parsing ─────────────────────────────────────────────────────────
const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/** Attributes of every <name …> tag, keys lower-cased, values entity-decoded. */
export function tagsOf(html: string, name: 'meta' | 'link' | 'base'): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = [];
  for (const m of html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'gi'))) {
    const attrs: Record<string, string> = {};
    for (const a of m[1].matchAll(/([^\s=/>"']+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g)) {
      attrs[a[1].toLowerCase()] = decodeEntities((a[2] ?? a[3] ?? a[4] ?? '').trim());
    }
    out.push(attrs);
  }
  return out;
}

const COVER_KEYS = ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'];

/** Largest edge from a sizes attribute ("180x180", "16x16 32x32"); 0 if unknown. */
const sizeOf = (sizes = '') => Math.max(0, ...sizes.split(/\s+/).map((s) => Number(s.toLowerCase().split('x')[0]) || 0));

/**
 * Candidate image URLs, best first.
 *   cover: og:image (then twitter:image)
 *   logo:  apple-touch-icon, then rel="icon", larger sizes first, then /favicon.ico
 */
export function findImages(rawHtml: string, page: URL): { logo: string[]; cover: string[] } {
  const html = rawHtml.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript)\b[\s\S]*?<\/\1\s*>/gi, '');
  const baseHref = tagsOf(html, 'base').find((b) => b.href)?.href;
  let base = page;
  try {
    if (baseHref) base = new URL(baseHref, page);
  } catch {
    /* bad <base>: resolve against the page */
  }
  const abs = (href: string | undefined): string | null => {
    if (!href || href.startsWith('data:')) return null;
    try {
      const u = new URL(href, base);
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
    } catch {
      return null;
    }
  };
  const unique = (xs: Array<string | null>) => [...new Set(xs.filter((x): x is string => Boolean(x)))];

  const metas = tagsOf(html, 'meta');
  const cover = unique(COVER_KEYS.flatMap((k) => metas.filter((m) => (m.property ?? m.name ?? '').toLowerCase() === k).map((m) => abs(m.content))));

  const icons = tagsOf(html, 'link')
    .map((l) => {
      const rel = (l.rel ?? '').toLowerCase().split(/\s+/);
      const svg = (l.type ?? '').toLowerCase().includes('svg') || /\.svg(?:[?#]|$)/i.test(l.href ?? '');
      const rank = rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed') ? 0 : rel.includes('icon') ? 1 : -1;
      return { href: abs(l.href), rank, size: sizeOf(l.sizes), svg };
    })
    .filter((i) => i.rank >= 0 && !i.svg && i.href)
    .sort((a, b) => a.rank - b.rank || b.size - a.size);
  const logo = unique([...icons.map((i) => i.href), new URL('/favicon.ico', page).href]);

  return { logo, cover };
}

// ── Images ───────────────────────────────────────────────────────────────
/** The image type from its first bytes; null for anything we don't store (SVG, HTML, …). */
export function sniffImage(b: Uint8Array): { type: string; ext: string } | null {
  const at = (i: number, ...bytes: number[]) => bytes.every((x, k) => b[i + k] === x);
  const ascii = (i: number, s: string) => at(i, ...[...s].map((c) => c.charCodeAt(0)));
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { type: 'image/png', ext: 'png' };
  if (at(0, 0xff, 0xd8, 0xff)) return { type: 'image/jpeg', ext: 'jpg' };
  if (ascii(0, 'GIF8')) return { type: 'image/gif', ext: 'gif' };
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return { type: 'image/webp', ext: 'webp' };
  if (ascii(4, 'ftypavif') || ascii(4, 'ftypavis')) return { type: 'image/avif', ext: 'avif' };
  if (at(0, 0x00, 0x00, 0x01, 0x00)) return { type: 'image/x-icon', ext: 'ico' };
  return null;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Folder per university site: "www.ug.edu.gh" → "ug.edu.gh". */
export const folderOf = (url: URL) => url.hostname.toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9.-]/g, '').slice(0, 100) || 'site';

type Stored = { url: string; from: string };

/** Downloads the first candidate that is a real image and stores it. Null if none works. */
async function storeFirst(svc: SupabaseClient, candidates: string[], kind: 'logo' | 'cover', folder: string): Promise<Stored | null> {
  for (const href of candidates.slice(0, MAX_TRIES)) {
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      const { res } = await safeFetch(new URL(href), 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8', IMAGE_TIMEOUT_MS);
      if (!res.ok) {
        await res.body?.cancel();
        continue;
      }
      bytes = await readCapped(res, MAX_IMAGE_BYTES, false);
    } catch {
      continue; // unreachable, blocked, too large or timed out: try the next one
    }
    const img = bytes.byteLength >= 64 ? sniffImage(bytes) : null;
    if (!img) continue;

    const path = `${folder}/${kind}-${hex(await crypto.subtle.digest('SHA-256', bytes)).slice(0, 16)}.${img.ext}`;
    const { error } = await svc.storage.from(BUCKET).upload(path, bytes, { contentType: img.type, upsert: true, cacheControl: '31536000' });
    if (error) {
      if (/bucket not found/i.test(error.message)) {
        throw new HttpError(500, 'bucket_missing', 'The university_assets bucket is missing. Run migration 0015.');
      }
      throw error;
    }
    return { url: svc.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, from: href };
  }
  return null;
}

export const handler = handle(async (req) => {
  const svc = serviceClient();
  const caller = await requireUser(req, svc);
  if (caller.role !== 'admin') throw new HttpError(403, 'forbidden', 'Admins only');

  const page = pageUrl((await readJson(req)).url);
  let res: Response, finalUrl: URL;
  try {
    ({ res, url: finalUrl } = await safeFetch(page, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', PAGE_TIMEOUT_MS));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const timedOut = err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new HttpError(502, 'site_unreachable', timedOut ? 'The website took too long to answer. Try again.' : 'We couldn’t open that website. Check the address.');
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new HttpError(502, 'site_error', `The website answered with an error (${res.status}).`);
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType && !/html|xml/i.test(contentType)) {
    await res.body?.cancel();
    throw new HttpError(422, 'not_html', 'That link isn’t a web page. Use the university’s home page.');
  }

  const html = new TextDecoder().decode(await readCapped(res, MAX_HTML_BYTES, true));
  const found = findImages(html, finalUrl);
  const folder = folderOf(finalUrl);
  const [logo, cover] = await Promise.all([storeFirst(svc, found.logo, 'logo', folder), storeFirst(svc, found.cover, 'cover', folder)]);
  if (!logo && !cover) throw new HttpError(422, 'nothing_found', 'No logo or cover image found on that website. Add them by hand.');

  return json({
    logo_url: logo?.url ?? null,
    cover_image_url: cover?.url ?? null,
    source: { logo: logo?.from ?? null, cover: cover?.from ?? null },
  });
});
