// The 11-character video id from anything an admin might paste. Keep in sync
// with supabase/functions/_shared/youtube.ts (the server re-checks with the same rules).
//   https://www.youtube.com/watch?v=ID   (any other query params, any order)
//   https://m.youtube.com/watch?v=ID, https://music.youtube.com/watch?v=ID
//   https://youtu.be/ID?si=…             https://www.youtube.com/embed/ID
//   https://www.youtube.com/shorts/ID    https://www.youtube.com/live/ID
//   https://www.youtube.com/v/ID         https://www.youtube-nocookie.com/embed/ID
//   links without https://, and the bare id itself
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PATH_KINDS = new Set(['embed', 'shorts', 'live', 'v', 'e']);

export function youtubeId(input: string): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  if (VIDEO_ID.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  let candidate: string | undefined;
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    candidate = url.pathname.split('/').filter(Boolean)[0];
  } else if (/(^|\.)youtube\.com$/.test(host) || /(^|\.)youtube-nocookie\.com$/.test(host)) {
    const parts = url.pathname.split('/').filter(Boolean);
    candidate = url.searchParams.get('v') ?? (PATH_KINDS.has(parts[0] ?? '') ? parts[1] : undefined);
    // Old share links: /attribution_link?u=/watch?v=ID
    if (!candidate && parts[0] === 'attribution_link') {
      const inner = url.searchParams.get('u');
      return inner ? youtubeId(`https://www.youtube.com${inner.startsWith('/') ? '' : '/'}${inner}`) : null;
    }
  }
  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}
