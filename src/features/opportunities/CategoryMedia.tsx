import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';

/** The large category icon on its glowing circle. */
export function CategoryIcon({ icon: Icon, size }: { icon: LucideIcon; size?: 'sm' | 'lg' }) {
  return (
    <span className="cat-icon" data-size={size} aria-hidden="true">
      <Icon />
    </span>
  );
}

/**
 * Top-of-card media: the cover image (object-fit: cover) when there is one and it loads,
 * otherwise a soft 10% wash of the category colour with the large icon in the centre.
 * A dark gradient at the bottom blends either into the card. Decorative: the card's
 * text carries the meaning.
 */
export function CategoryMedia({ image, icon, className }: { image?: string | null; icon: LucideIcon; className?: string }) {
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(image) && !broken;
  return (
    <div className={className ? `cat-media ${className}` : 'cat-media'} aria-hidden="true">
      {showImage ? (
        <>
          <img className="cat-media__img" src={image as string} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
          <span className="cat-media__badge">
            <CategoryIcon icon={icon} size="sm" />
          </span>
        </>
      ) : (
        <CategoryIcon icon={icon} size="lg" />
      )}
    </div>
  );
}
