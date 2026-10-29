import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Play } from 'lucide-react';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { Notice } from '../../components/Notice/Notice';
import { errorMessage } from '../../lib/supabase';
import { riseItem, staggerParent } from '../../lib/motion';
import { searchVideos, type Video } from './api';
import { YouTubePlayer } from './YouTubePlayer';
import './VideoCarousel.css';

/** "Day in the life" — 3 real YouTube results in a snap carousel; tap to play in-app. */
export function VideoCarousel({ query }: { query: string }) {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<Video | null>(null);

  useEffect(() => {
    let active = true;
    setVideos(null);
    setError(null);
    setPlaying(null);
    searchVideos(query)
      .then((v) => active && setVideos(v))
      .catch((e) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [query]);

  if (error) return <Notice tone="error">Videos couldn't load: {error}</Notice>;

  return (
    <div className="video-carousel">
      <AnimatePresence>{playing && <YouTubePlayer videoId={playing.id} title={playing.title} autoplay />}</AnimatePresence>
      {!videos ? (
        <div className="video-carousel__track" aria-busy="true" aria-label="Loading videos">
          {[0, 1, 2].map((i) => (
            <div key={i} className="video-carousel__slide">
              <Skeleton shape="block" height="140px" />
              <Skeleton width="80%" height="10px" />
            </div>
          ))}
        </div>
      ) : videos.length === 0 ? (
        <p className="video-carousel__empty">No videos found for “{query}”.</p>
      ) : (
        <motion.ul className="video-carousel__track" role="list" variants={staggerParent} initial="hidden" animate="show">
          {videos.map((v) => (
            <motion.li key={v.id} className="video-carousel__slide" variants={riseItem}>
              <button type="button" className="video-card" data-active={playing?.id === v.id || undefined} onClick={() => setPlaying(v)} aria-label={`Play: ${v.title}`}>
                <span className="video-card__thumb">
                  {v.thumbnail && <img src={v.thumbnail} alt="" loading="lazy" />}
                  <span className="video-card__play" aria-hidden="true">
                    <Play />
                  </span>
                </span>
                <span className="video-card__title">{v.title}</span>
                <span className="video-card__channel">{v.channel}</span>
              </button>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}
