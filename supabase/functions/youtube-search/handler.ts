// INTEGRATION: youtube — YouTube Data API v3 search.list, cached 24h in
// public.youtube_cache to protect the daily quota.
import { handle, HttpError, json, readJson } from '../_shared/http.ts';
import { requireEnv } from '../_shared/env.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { str } from '../_shared/validate.ts';

type Video = { id: string; title: string; channel: string; thumbnail: string; published_at: string };
type SearchItem = {
  id?: { videoId?: string };
  snippet?: { title?: string; channelTitle?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> };
};

const TTL_MS = 24 * 3_600_000;

// YouTube returns HTML entities in titles.
const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export const handler = handle(async (req) => {
  const svc = serviceClient();
  await requireUser(req, svc);
  const body = await readJson(req);
  const query = str(body.query, 'query', { min: 2, max: 120 });
  const key = query.toLowerCase().replace(/\s+/g, ' ');

  const { data: cached } = await svc.from('youtube_cache').select('results, fetched_at').eq('query_key', key).maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at as string).getTime() < TTL_MS) {
    return json({ videos: cached.results as Video[], cached: true });
  }

  const apiKey = requireEnv('YOUTUBE_API_KEY');
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.search = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    maxResults: '3',
    q: query,
    videoEmbeddable: 'true',
    safeSearch: 'strict',
    relevanceLanguage: 'en',
    key: apiKey,
  }).toString();

  const res = await fetch(url);
  const payload = (await res.json().catch(() => ({}))) as { items?: SearchItem[]; error?: { message?: string } };
  if (!res.ok) throw new HttpError(502, 'youtube_error', `YouTube error: ${payload.error?.message ?? res.statusText}`);

  const videos: Video[] = (payload.items ?? [])
    .filter((i) => i.id?.videoId)
    .map((i) => ({
      id: i.id!.videoId!,
      title: decode(i.snippet?.title ?? ''),
      channel: decode(i.snippet?.channelTitle ?? ''),
      thumbnail: i.snippet?.thumbnails?.high?.url ?? i.snippet?.thumbnails?.medium?.url ?? i.snippet?.thumbnails?.default?.url ?? '',
      published_at: i.snippet?.publishedAt ?? '',
    }));

  await svc.from('youtube_cache').upsert({ query_key: key, results: videos, fetched_at: new Date().toISOString() });
  return json({ videos, cached: false });
});
