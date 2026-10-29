import { motion } from 'framer-motion';
import './YouTubePlayer.css';

export type YouTubePlayerProps = { videoId: string; title: string; autoplay?: boolean };

/** In-app 16:9 rounded player. Privacy-enhanced domain; no tracking cookies until play. */
export function YouTubePlayer({ videoId, title, autoplay }: YouTubePlayerProps) {
  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1&playsinline=1${autoplay ? '&autoplay=1' : ''}`;
  return (
    <motion.div className="yt-player" key={videoId} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
      <iframe
        src={src}
        title={title}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </motion.div>
  );
}
