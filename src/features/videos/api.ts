// INTEGRATION: youtube — searches go through the youtube-search edge function
// (API key stays on the server; results cached for 24h).
import { invokeFunction } from '../../lib/functions';

export type Video = { id: string; title: string; channel: string; thumbnail: string; published_at: string };

export async function searchVideos(query: string): Promise<Video[]> {
  const { videos } = await invokeFunction<{ videos: Video[]; cached: boolean }>('youtube-search', { query });
  return videos;
}
