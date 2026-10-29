import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock, RotateCcw, SearchX, Sparkles } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { Chip } from '../../components/Chip/Chip';
import { BentoSkeleton } from '../../components/Skeleton/Skeleton';
import { Button } from '../../components/Button/Button';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Notice } from '../../components/Notice/Notice';
import { HeaderArt, useHeaderParallax } from '../../components/PageHeader/HeaderArt';
import { OpportunityCard } from '../../features/opportunities/OpportunityCard';
import { fetchOpportunities } from '../../features/opportunities/api';
import { useMatches, type Match } from '../../features/opportunities/matcher';
import { useSaved } from '../../features/opportunities/saved';
import { packBento, useGridColumns } from '../../features/opportunities/bento';
import type { Opportunity } from '../../features/opportunities/types';
import { RenewalBanner } from '../../features/billing/RenewalBanner';
import { usePlan } from '../../features/billing/PlanProvider';
import { usePaywall } from '../../features/billing/PaywallModal';
import { useAuth } from '../../features/auth/useAuth';
import { errorMessage } from '../../lib/supabase';
import { riseItem, staggerParent } from '../../lib/motion';
import './Home.css';

type FilterId = 'matched' | 'all' | 'open' | 'saved' | 'scholarship' | 'program';

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'matched', label: 'Matched for you' },
  { id: 'open', label: 'Open now' },
  { id: 'saved', label: 'Saved' },
  { id: 'scholarship', label: 'Scholarships' },
  { id: 'program', label: 'Programmes' },
];

type Row = Opportunity & { match?: Match };

function applyFilter(list: Row[], f: FilterId, saved: Set<string>): Row[] {
  switch (f) {
    case 'matched':
      // Pro: ranked by scholarship_matches(); only rows the RPC returned (open + upcoming).
      return list.filter((o) => o.match && o.match.score >= 50).sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0));
    case 'open':
      return list.filter((o) => o.status === 'open' || o.status === 'rolling');
    case 'saved':
      return list.filter((o) => saved.has(o.id));
    case 'scholarship':
      return list.filter((o) => o.kind === 'scholarship' || o.kind === 'fellowship');
    case 'program':
      return list.filter((o) => o.kind === 'program' || o.kind === 'award');
    default:
      return list;
  }
}

function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const EMPTY_COPY: Record<FilterId, string> = {
  matched: 'Nothing open fits your field and level closely right now. "All" shows what opens next.',
  all: 'No opportunities are published yet.',
  open: 'Nothing is open this week — check "All" for upcoming rounds.',
  saved: 'Tap the heart on any opportunity to keep it here.',
  scholarship: 'No scholarships are listed right now.',
  program: 'No programmes are listed right now.',
};

export default function Home() {
  const { profile } = useAuth();
  const { isPro, loading: planLoading } = usePlan();
  const { openPaywall } = usePaywall();
  const { matches, error: matchError } = useMatches();
  const [items, setItems] = useState<Opportunity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>('all');
  const { saved, toggle, error: saveError } = useSaved(profile?.id);
  const [stuck, setStuck] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const parallax = useHeaderParallax();
  // Callback ref: the grid remounts per filter, so the hook needs the live element.
  const [grid, setGrid] = useState<HTMLDivElement | null>(null);
  const cols = useGridColumns(grid);
  const pickedFilter = useRef(false);

  const load = useCallback(() => {
    setError(null);
    setItems(null);
    fetchOpportunities()
      .then(setItems)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(load, [load]);

  // Pro students land on their matches; free students on everything.
  useEffect(() => {
    if (!planLoading && isPro && !pickedFilter.current) setFilter('matched');
  }, [isPro, planLoading]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const rows = useMemo<Row[]>(() => (items ?? []).map((o) => ({ ...o, match: matches?.get(o.id) })), [items, matches]);
  const visible = useMemo(() => applyFilter(rows, filter, saved), [rows, filter, saved]);
  const spotlightId = visible.find((o) => o.status === 'open')?.id ?? null;
  // The featured tile is the spotlight (first open round); it moves to the top-left of the bento.
  const ordered = useMemo(() => {
    if (!spotlightId) return visible;
    const hero = visible.find((o) => o.id === spotlightId);
    return hero ? [hero, ...visible.filter((o) => o.id !== spotlightId)] : visible;
  }, [visible, spotlightId]);
  const sizes = useMemo(() => packBento(ordered.length, cols, ordered.length ? 0 : null), [ordered.length, cols]);
  const firstName = profile?.full_name?.split(' ')[0];

  const choose = (f: FilterId) => {
    if (f === 'matched' && !isPro) {
      openPaywall('The Scholarship Matcher ranks every open opportunity by how well it fits your field, level and goals — and tells you why. It’s part of Pro.');
      return;
    }
    pickedFilter.current = true;
    setFilter(f);
  };

  return (
    <PageTransition label="Discover opportunities">
      <div className="container home" data-wide>
        <motion.header ref={parallax.ref} className="home__header" variants={staggerParent} initial="hidden" animate="show">
          <HeaderArt y={parallax.artY} scale={parallax.artScale} />
          <motion.div className="home__header-text" style={{ y: parallax.textY, opacity: parallax.textOpacity }}>
            <motion.p className="eyebrow" variants={riseItem}>
              {greeting()}
              {firstName ? `, ${firstName}` : ''}
            </motion.p>
            <motion.h1 className="home__title" variants={riseItem}>
              Opportunities worth your next move
            </motion.h1>
          </motion.div>
        </motion.header>

        <RenewalBanner />

        <div ref={sentinel} className="home__sentinel" aria-hidden="true" />
        <div className="home__filters" data-stuck={stuck || undefined}>
          <div className="home__filters-scroll" role="radiogroup" aria-label="Filter opportunities">
            {FILTERS.map((f) => (
              <Chip
                key={f.id}
                kind="radio"
                selected={filter === f.id}
                onToggle={() => choose(f.id)}
                layoutGroup="home-filter"
                icon={f.id === 'matched' ? isPro ? <Sparkles aria-hidden="true" /> : <Lock aria-hidden="true" /> : undefined}
              >
                {f.label}
                {f.id === 'saved' && saved.size > 0 ? ` · ${saved.size}` : ''}
              </Chip>
            ))}
          </div>
        </div>

        {saveError && <Notice tone="error">Couldn't update your saved list: {saveError}</Notice>}
        {matchError && <Notice tone="error">The matcher couldn't load: {matchError}</Notice>}

        {error && (
          <Notice tone="error" action={<Button variant="secondary" size="sm" icon={<RotateCcw aria-hidden="true" />} onClick={load}>Retry</Button>}>
            We couldn't load opportunities: {error}
          </Notice>
        )}

        {!error && (!items || (filter === 'matched' && !matches)) && (
          <div className="home__feed">
            <BentoSkeleton label="Loading opportunities" />
          </div>
        )}

        {items && (filter !== 'matched' || matches) && (
          <div className="home__feed">
            <AnimatePresence mode="wait">
              <motion.div
                key={filter}
                ref={setGrid}
                className="bento"
                variants={staggerParent}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, scale: 0.985, transition: { duration: 0.14 } }}
              >
                {ordered.map((o, i) => (
                  <OpportunityCard
                    key={o.id}
                    opportunity={o}
                    match={o.match}
                    size={sizes[i]}
                    showReasons={filter === 'matched'}
                    spotlight={o.id === spotlightId}
                    saved={saved.has(o.id)}
                    onToggleSave={() => void toggle(o.id)}
                  />
                ))}
                {ordered.length === 0 && (
                  <EmptyState icon={SearchX} title="Nothing here yet">
                    <p>{EMPTY_COPY[filter]}</p>
                  </EmptyState>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
