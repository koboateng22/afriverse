// fetch-scholarships — imports new opportunities from a fixed list of reputable
// RSS feeds into Admin → Opportunities → Pending Review. Nothing reaches
// students until an admin approves it.
//
// For each new feed item it:
//   • keeps only scholarships, fellowships, awards and programmes (no jobs, no list posts)
//   • reads the deadline from the excerpt ("Deadline: December 3, 2026") and
//     skips anything that has already closed
//   • opens the article on the feed's own site to find the link to the provider
//     ("Official website", "Apply here"), so students land on the source
//   • sets is_verified only when that link's domain is the provider's own
//     (its name or acronym), never for application platforms, aggregators or
//     link shorteners.
// Each article is imported once (opportunities.source_url is unique; rejected
// items stay in the table so they never come back).
//
// Runs daily from Supabase Cron with the service-role key, or on demand from the
// admin console ("Check feeds now").
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { requireEnv } from '../_shared/env.ts';
import { handle, HttpError, json } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';

/** The only sources this function reads. Add a feed here after checking it by hand. */
export const FEEDS = [
  { name: 'Opportunity Desk', url: 'https://opportunitydesk.org/feed/' },
  { name: 'Opportunities for Africans', url: 'https://www.opportunitiesforafricans.com/feed/' },
] as const;

const FEED_TIMEOUT_MS = 10_000;
const ARTICLE_TIMEOUT_MS = 8_000;
const MAX_FEED_BYTES = 2_000_000;
const MAX_ARTICLE_BYTES = 600_000;
const MAX_NEW_PER_FEED = 15; // keeps each run well inside the edge function's limits
const USER_AGENT = 'Mozilla/5.0 (compatible; AfriversityBot/1.0; +https://www.afriversity.com)';

// ── Small text helpers ───────────────────────────────────────────────────
const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
export const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
const cdata = (s: string) => s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');
/** Plain text from an HTML fragment, whitespace collapsed. */
export const textOf = (html: string) => decodeEntities(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

// ── RSS ──────────────────────────────────────────────────────────────────
export type FeedItem = { title: string; link: string; description: string; categories: string[] };

/** The items of an RSS 2.0 feed (title, link, excerpt as text, categories). */
export function parseFeed(xml: string): FeedItem[] {
  const tag = (block: string, name: string) => {
    const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
    return m ? cdata(m[1]).trim() : '';
  };
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(([, block]) => ({
    title: textOf(tag(block, 'title')),
    link: decodeEntities(tag(block, 'link')),
    description: textOf(tag(block, 'description')),
    categories: [...block.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)].map((m) => textOf(cdata(m[1]))),
  }));
}

// ── Deadline ─────────────────────────────────────────────────────────────
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';

const isoOf = (y: number, m: number, d: number): string | null => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
};

export type Deadline = { kind: 'date'; date: string; raw: string } | { kind: 'rolling'; raw: string } | { kind: 'unknown'; raw: string | null };

/** The deadline stated in the text ("Deadline: December 3, 2026", "Application Deadline: 19th November 2026"). */
export function parseDeadline(text: string): Deadline {
  const m = text.match(/deadline\s*(?:date)?\s*(?:is|:|–|-)?\s*([^;|\n]{2,60})/i);
  if (!m) return { kind: 'unknown', raw: null };
  const raw = m[1].trim();
  const mdy = raw.match(new RegExp(`${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, 'i'));
  const dmy = raw.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH},?\\s+(\\d{4})`, 'i'));
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  const month = (s: string) => MONTHS.indexOf(s.slice(0, 3).toLowerCase()) + 1;
  const date = mdy ? isoOf(+mdy[3], month(mdy[1]), +mdy[2]) : dmy ? isoOf(+dmy[3], month(dmy[2]), +dmy[1]) : iso ? isoOf(+iso[1], +iso[2], +iso[3]) : null;
  if (date) return { kind: 'date', date, raw };
  if (/^(ongoing|rolling|open until|no deadline|not specified|varies)/i.test(raw)) return { kind: 'rolling', raw };
  return { kind: 'unknown', raw: clip(raw.split(/(?<=\d{4})|\.\s/)[0], 60) };
}

// ── What kind of opportunity is it? ──────────────────────────────────────
type Kind = 'scholarship' | 'fellowship' | 'program' | 'award';

/** null for anything that isn't an opportunity we list (jobs, list posts, news). */
export function kindOf(item: Pick<FeedItem, 'title' | 'categories'>): Kind | null {
  const cats = item.categories.join(' | ');
  if (/\bjobs?\b|vacanc|hiring|recruit/i.test(`${item.title} | ${cats}`)) return null;
  if (/^(top|best)\s+\d+|^\d+\s+(hot|best|top)\b|\blist of\b/i.test(item.title) || /\blist of\b/i.test(cats)) return null;
  // Advice posts and calls for judges/mentors are not opportunities for students.
  if (/^how to\b|\btips\b|\bways to\b|\bguide to\b|\bmistakes\b|call for (judges|mentors|reviewers|volunteers|speakers|partners)/i.test(item.title)) return null;
  const pick = (s: string): Kind | null =>
    /scholarship|bursar/i.test(s) ? 'scholarship'
    : /fellowship|fellows\b/i.test(s) ? 'fellowship'
    : /\baward|\bprize|competition|challenge\b/i.test(s) ? 'award'
    : /internship|training|programme|program\b|leadership|exchange|bootcamp|accelerator|incubator|summer school|academy/i.test(s) ? 'program'
    : null;
  return pick(item.title) ?? pick(cats);
}

// ── The provider's link inside the article ───────────────────────────────
/** Sites that list other people's opportunities. Never the official source. */
const AGGREGATORS = ['opportunitydesk.org', 'opportunitiesforafricans.com', 'scholars4dev.com', 'opportunitiescorners.com', 'afterschoolafrica.com', 'scholarshipregion.com', 'youthop.com', 'opportunitiesforyouth.org', 'scholarshipsads.com', 'scholarship-positions.com', 'worldscholarshipforum.com'];
/** Where a link may lead, but whose domain never proves who the provider is. */
const PLATFORMS = ['submittable.com', 'smapply.io', 'smapply.org', 'fluxx.io', 'typeform.com', 'google.com', 'forms.gle', 'jotform.com', 'airtable.com', 'office.com', 'microsoft.com', 'surveymonkey.com', 'wufoo.com', 'formstack.com', 'eventbrite.com', 'zohopublic.com', 'hubspot.com', 'list-manage.com', 'notion.site', 'wixsite.com', 'wordpress.com', 'blogspot.com', 'medium.com', 'github.io', 'linktr.ee', 'bit.ly', 'tinyurl.com', 't.co', 'ow.ly', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'lnkd.in', 'goo.gl'];
const IGNORED_LINKS = /facebook\.|twitter\.|x\.com|linkedin\.|whatsapp|wa\.me|pinterest\.|t\.me|telegram\.|instagram\.|youtube\.|youtu\.be|tiktok\.|reddit\.|tumblr\.|akismet\.|gravatar\.|wordpress\.org|feedburner|amazon\.|cdn-cgi|\/wp-(content|login|admin)/i;
const SUSPICIOUS_TLDS = new Set(['info', 'xyz', 'top', 'click', 'site', 'online', 'buzz', 'tk', 'ml', 'ga', 'cf', 'gq', 'icu', 'live', 'shop', 'loan', 'work', 'rest', 'fun']);
const SECOND_LEVEL = new Set(['co', 'ac', 'gov', 'edu', 'org', 'com', 'net', 'or', 'go', 'ne', 'gob', 'gouv', 'sch', 'mil', 'nic']);

/** "www.cega.berkeley.edu" → { domain: "berkeley.edu", label: "berkeley", tld: "edu" }. */
export function registrable(host: string): { domain: string; label: string; tld: string } {
  const labels = host.toLowerCase().replace(/\.$/, '').split('.');
  const n = labels.length;
  const tld = labels[n - 1];
  const twoPart = n >= 3 && tld.length === 2 && SECOND_LEVEL.has(labels[n - 2]);
  const label = labels[twoPart ? n - 3 : n - 2] ?? '';
  return { domain: labels.slice(twoPart ? n - 3 : n - 2).join('.'), label, tld };
}
const inList = (domain: string, list: string[]) => list.some((d) => domain === d || domain.endsWith(`.${d}`));

/** The best link out of the article to the provider: an "official" page first, then "apply". */
export function officialLink(html: string, articleUrl: string): { url: string; text: string } | null {
  const start = html.search(/<(div|article|section)[^>]+class=["'][^"']*(entry-content|post-content|td-post-content|article-content|single-content)/i);
  const body = start >= 0 ? html.slice(start, start + 200_000) : html;
  const page = new URL(articleUrl);
  let best: { url: string; text: string; score: number } | null = null;
  for (const [, , href, inner] of body.matchAll(/<a\s[^>]*?href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: URL;
    try {
      url = new URL(decodeEntities(href), page);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
    if (IGNORED_LINKS.test(url.href)) continue;
    const { domain } = registrable(url.hostname);
    if (domain === registrable(page.hostname).domain || inList(domain, AGGREGATORS)) continue;
    const text = textOf(inner);
    const score = /official\s*(web\s*)?(site|page|webpage|link)/i.test(text) ? 3
      : /\bapply\b|application|register/i.test(text) ? 2
      : /\bvisit\b|more (information|details)|learn more|website|click here/i.test(text) ? 1
      : 0;
    if (score > 0 && (!best || score > best.score)) best = { url: url.href, text, score };
  }
  return best && { url: best.url, text: best.text };
}

const GENERIC = new Set(('scholarship scholarships fellowship fellowships fellows program programme programs programmes award awards prize prizes grant grants ' +
  'fully funded funding international students student young youth leaders leadership global world application applications apply open call ' +
  'african africa emerging annual university universities college school institute center centre foundation national research researchers ' +
  'visiting summit conference training course courses online masters master undergraduate postgraduate graduate doctoral development ' +
  'change changemakers future women girls with from into their your this that across').split(' '));
const GENERIC_IN_LABEL = /scholar|apply|grant|fund|opportunit|award|portal|fellowship|bursar|study|admission|career/;

export type ProviderTokens = { words: Set<string>; acronyms: Set<string> };

/** What names the provider: distinctive title words, plus acronyms ("MCW…" in the title, "(NED)" in the article). */
export function providerTokens(title: string, articleText = ''): ProviderTokens {
  const words = new Set<string>();
  const acronyms = new Set<string>();
  for (const w of title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)) {
    if (w.length >= 4 && !GENERIC.has(w) && !/^\d+$/.test(w)) words.add(w);
  }
  for (const m of `${title} ${articleText.slice(0, 6000)}`.matchAll(/\(([A-Z][A-Za-z]{1,9})\)/g)) {
    if (/[A-Z].*[A-Z]/.test(m[1])) acronyms.add(m[1].toLowerCase());
  }
  for (const m of title.matchAll(/\b([A-Z]{2,8})\b/g)) {
    if (!/^(USA?|UK|EU|AI|PHD|MBA|STEM|ICT|NGO)$/.test(m[1])) acronyms.add(m[1].toLowerCase());
  }
  return { words, acronyms };
}

/** Organisation words that may follow an acronym in a domain: mcwglobal, cfainstitute, nedfellowships. */
const ORG_WORDS = new Set(['global', 'institute', 'foundation', 'fdn', 'hq', 'intl', 'international', 'org', 'trust', 'society', 'council', 'network', 'fellowships', 'fellows', 'africa', 'online']);

/**
 * True when the link's own domain is the provider's, by name or acronym:
 *   chevening.org (title word), ned.org (acronym), mcwglobal.org (acronym + org word),
 *   humboldt-foundation.de (contains a distinctive title word).
 * Never for application platforms, aggregators, shorteners, throwaway TLDs, or
 * lookalikes built from generic words (chevening-scholarships.com).
 */
export function isOfficialDomain(link: string, tokens: ProviderTokens): boolean {
  let host: string;
  try {
    host = new URL(link).hostname;
  } catch {
    return false;
  }
  const { domain, label, tld } = registrable(host);
  if (!label || SUSPICIOUS_TLDS.has(tld) || inList(domain, PLATFORMS) || inList(domain, AGGREGATORS)) return false;
  const bare = label.replace(/-/g, '');
  if (tokens.words.has(bare) || tokens.acronyms.has(bare)) return true;
  if (GENERIC_IN_LABEL.test(bare)) return false;
  if (!label.includes('-') && [...tokens.acronyms].some((a) => bare.startsWith(a) && ORG_WORDS.has(bare.slice(a.length)))) return true;
  return [...tokens.words].some((t) => t.length >= 5 && bare.includes(t));
}

// ── Feed item → opportunity row ──────────────────────────────────────────
const slugify = (t: string) =>
  t.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/, '');

async function shortHash(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 3).map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** "Center for Effective Global Action" from the categories, else the title before its kind word. */
export function providerOf(item: FeedItem): string {
  const title = item.title.replace(/^the\s+/i, '');
  const prefixes = item.categories
    .map((c) => c.replace(/^the\s+/i, '').trim())
    // Two words or more, so a region tag ("Kenya", "Africa") is never taken for the provider.
    .filter((c) => c.includes(' ') && !/\d/.test(c) && title.toLowerCase().startsWith(c.toLowerCase()));
  const base = prefixes.sort((a, b) => a.length - b.length)[0] ?? title.split(/\s+(?:scholarships?|fellowships?|programmes?|program|awards?|prize|competition|\d{4})\b|[(:–—|]/i)[0];
  const cleaned = base.replace(/(\s+(scholarships?|fellowships?|programmes?|program|awards?|prize))+\s*$/i, '').trim();
  return clip(cleaned.length >= 2 ? cleaned : title, 160);
}

export type ScrapedRow = Record<string, unknown> & { source_url: string; is_verified: boolean; deadline: string | null };

/** The pending opportunity row for one feed item, or null if it should be skipped. */
export async function toOpportunity(
  item: FeedItem,
  feedName: string,
  article: { html: string } | null,
  today: string,
): Promise<{ row: ScrapedRow | null; skipped?: string }> {
  const kind = kindOf(item);
  if (!kind) return { row: null, skipped: 'not_an_opportunity' };
  let link: URL;
  try {
    link = new URL(item.link);
  } catch {
    return { row: null, skipped: 'bad_link' };
  }
  if (link.protocol !== 'https:') return { row: null, skipped: 'bad_link' };

  const deadline = parseDeadline(item.description);
  if (deadline.kind === 'date' && deadline.date < today) return { row: null, skipped: 'closed' };
  // Real calls state a deadline (or "Deadline: Ongoing"); posts without one are news or advice.
  if (deadline.kind === 'unknown' && !deadline.raw) return { row: null, skipped: 'no_deadline' };

  const official = article ? officialLink(article.html, link.href) : null;
  const tokens = providerTokens(item.title, article ? textOf(article.html.slice(0, 200_000)) : '');
  const officialUrl = official ? official.url.replace(/^http:\/\//i, 'https://') : null;
  const verified = officialUrl ? isOfficialDomain(officialUrl, tokens) : false;

  const excerpt = item.description
    .replace(/^(application\s+)?deadline\s*(date)?\s*(is|:|–|-)?\s*[^.]*?\d{4}(,?\s*\d{1,2}:\d{2}\s*[A-Z]{2,4})?(\s*\([^)]{0,40}\))?\.?\s*/i, '')
    .replace(/\s*The post .*$/i, '')
    .replace(/\s*\[(…|\.\.\.)\]\s*$/, '…')
    .trim();
  const summary = clip(excerpt.length >= 10 ? excerpt : item.title, 300);
  const text = `${item.title} ${item.description}`;

  return {
    row: {
      slug: `${slugify(item.title) || 'opportunity'}-${await shortHash(link.href)}`,
      title: clip(item.title, 160),
      provider: providerOf(item),
      kind,
      summary,
      description: clip(`${excerpt || item.title}\n\nFound on ${feedName}. Check every detail on the official page before applying.`, 3000),
      eligibility: [],
      benefits: [],
      fields: [],
      levels: [],
      host_country: 'See details',
      open_to: feedName === 'Opportunities for Africans' ? 'African applicants (check eligibility)' : 'Check eligibility on the official page',
      funding: /fully[\s-]*funded/i.test(text) ? 'full' : kind === 'award' && /prize|cash/i.test(text) ? 'prize' : /stipend/i.test(text) ? 'stipend' : 'partial',
      status: deadline.kind === 'date' ? 'open' : 'rolling',
      deadline: deadline.kind === 'date' ? deadline.date : null,
      opens_on: null,
      cycle_note: deadline.kind === 'unknown' && deadline.raw ? clip(`Deadline as listed: ${deadline.raw}`, 400) : null,
      url: officialUrl ?? link.href,
      is_pro: false,
      featured: false,
      published: false,
      review_status: 'pending',
      is_verified: verified,
      source_url: clip(link.href, 500),
      source_name: feedName,
      verified_on: today,
    },
  };
}

// ── Fetching ─────────────────────────────────────────────────────────────
async function fetchText(url: string, timeoutMs: number, maxBytes: number): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/html;q=0.9, */*;q=0.5' } });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`HTTP ${res.status}`);
  }
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  const out = new Uint8Array(Math.min(total, maxBytes));
  let at = 0;
  for (const c of chunks) {
    const part = c.subarray(0, out.byteLength - at);
    out.set(part, at);
    at += part.byteLength;
    if (at >= out.byteLength) break;
  }
  return new TextDecoder().decode(out);
}

export type FeedReport = { feed: string; items: number; added: number; verified: number; skipped: Record<string, number>; error?: string };

async function runFeed(svc: SupabaseClient, feed: (typeof FEEDS)[number], today: string): Promise<FeedReport> {
  const report: FeedReport = { feed: feed.name, items: 0, added: 0, verified: 0, skipped: {} };
  const skip = (why: string) => (report.skipped[why] = (report.skipped[why] ?? 0) + 1);
  let items: FeedItem[];
  try {
    items = parseFeed(await fetchText(feed.url, FEED_TIMEOUT_MS, MAX_FEED_BYTES));
  } catch (err) {
    return { ...report, error: err instanceof Error ? err.message : String(err) };
  }
  report.items = items.length;

  // Already imported (pending, approved or rejected): never fetched again.
  const links = items.map((i) => i.link).filter(Boolean);
  const { data: known, error } = await svc.from('opportunities').select('source_url').in('source_url', links);
  if (error) throw error;
  const seen = new Set((known ?? []).map((r) => r.source_url as string));

  let fresh = 0;
  for (const item of items) {
    if (seen.has(item.link)) {
      skip('already_imported');
      continue;
    }
    // Cheap checks first, so we only open articles we'd actually import.
    const kind = kindOf(item);
    const dl = parseDeadline(item.description);
    if (!kind) {
      skip('not_an_opportunity');
      continue;
    }
    if (dl.kind === 'date' && dl.date < today) {
      skip('closed');
      continue;
    }
    if (dl.kind === 'unknown' && !dl.raw) {
      skip('no_deadline');
      continue;
    }
    if (fresh >= MAX_NEW_PER_FEED) {
      skip('next_run');
      continue;
    }
    fresh++;
    let article: { html: string } | null = null;
    try {
      // Only ever the feed's own site (the item link), never a link from inside it.
      if (new URL(item.link).hostname === new URL(feed.url).hostname) article = { html: await fetchText(item.link, ARTICLE_TIMEOUT_MS, MAX_ARTICLE_BYTES) };
    } catch {
      /* no article: the row keeps the listing link and stays unverified */
    }
    const { row, skipped } = await toOpportunity(item, feed.name, article, today);
    if (!row) {
      skip(skipped ?? 'invalid');
      continue;
    }
    const { error: insErr } = await svc.from('opportunities').upsert(row, { onConflict: 'source_url', ignoreDuplicates: true });
    if (insErr) {
      // A slug clash or a value the table refuses: skip this one, keep going.
      console.warn('fetch-scholarships: could not insert', row.source_url, insErr.message);
      skip('db_refused');
      continue;
    }
    report.added++;
    if (row.is_verified) report.verified++;
  }
  return report;
}

export const handler = handle(async (req) => {
  const svc = serviceClient();
  // The daily scheduler sends the service-role key; admins can also run it.
  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${requireEnv('SUPABASE_SERVICE_ROLE_KEY')}`) {
    const caller = await requireUser(req, svc);
    if (caller.role !== 'admin') throw new HttpError(403, 'forbidden', 'Admins only');
  }
  const today = new Date().toISOString().slice(0, 10);
  const feeds: FeedReport[] = [];
  for (const feed of FEEDS) feeds.push(await runFeed(svc, feed, today));
  return json({
    added: feeds.reduce((n, f) => n + f.added, 0),
    verified: feeds.reduce((n, f) => n + f.verified, 0),
    feeds,
  });
});
