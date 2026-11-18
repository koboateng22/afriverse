import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutGrid, Lock, RotateCcw, SearchX, Sparkles, UserRoundPen } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Chip } from '../../components/Chip/Chip';
import { BentoSkeleton } from '../../components/Skeleton/Skeleton';
import { Button } from '../../components/Button/Button';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Notice } from '../../components/Notice/Notice';
import { OpportunityCard } from '../../features/opportunities/OpportunityCard';
import { fetchOpportunities } from '../../features/opportunities/api';
import type { Match } from '../../features/opportunities/matcher';
import { canMatch, isProfileMatch, matchScore, PERSONAL_MATCH, type MatchProfile } from '../../features/opportunities/profileMatch';
import { useSaved } from '../../features/opportunities/saved';
import { packBento, useGridColumns } from '../../features/opportunities/bento';
import type { Opportunity } from '../../features/opportunities/types';
import { usePlan } from '../../features/billing/PlanProvider';
import { usePaywall } from '../../features/billing/PaywallModal';
import { useAuth } from '../../features/auth/useAuth';
import { errorMessage } from '../../lib/supabase';
import { staggerParent } from '../../lib/motion';
import './Discover.css';

type FilterId = 'matched' | 'all' | 'open' | 'saved' | 'scholarship' | 'internship' | 'program';

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'matched', label: 'Matched for you' },
  { id: 'open', label: 'Open now' },
  { id: 'saved', label: 'Saved' },
  { id: 'scholarship', label: 'Scholarships' },
  { id: 'internship', label: 'Internships' },
  { id: 'program', label: 'Programmes' },
];

type Row = Opportunity & { match?: Match };

function applyFilter(list: Row[], f: FilterId, saved: Set<string>, who: MatchProfile | null | undefined): Row[] {
  switch (f) {
    case 'matched':
      // Real fits only (60%+: their field, named in the text, or their goal), best first.
      // Untagged 50% defaults stay in "All", so this is never the same list.
      return list.filter((o) => isProfileMatch(o, who)).sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0));
    case 'open':
      return list.filter((o) => o.status === 'open' || o.status === 'rolling');
    case 'saved':
      return list.filter((o) => saved.has(o.id));
    case 'scholarship':
      return list.filter((o) => o.kind === 'scholarship' || o.kind === 'fellowship');
    case 'internship':
      return list.filter((o) => o.kind === 'internship');
    case 'program':
      return list.filter((o) => o.kind === 'program' || o.kind === 'award');
    default:
      return list;
  }
}

const EMPTY_COPY: Record<Exclude<FilterId, 'matched'>, string> = {
  all: 'No opportunities are published yet.',
  open: 'Nothing is open this week — check "All" for upcoming rounds.',
  saved: 'Tap the heart on any opportunity to keep it here.',
  scholarship: 'No scholarships are listed right now.',
  internship: 'No internships are listed right now.',
  program: 'No programmes are listed right now.',
};

/** /discover — every opportunity, with filters. Home shows only the student's top matches. */
export default function Discover() {
  const { profile } = useAuth();
  const { isPro, loading: planLoading } = usePlan();
  const { openPaywall } = usePaywall();
  const [items, setItems] = useState<Opportunity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>('all');
  const { saved, toggle, error: saveError } = useSaved(profile?.id);
  const [stuck, setStuck] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
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

  const rows = useMemo<Row[]>(() => (items ?? []).map((o) => ({ ...o, match: matchScore(o, profile) ?? undefined })), [items, profile]);
  const visible = useMemo(() => applyFilter(rows, filter, saved, profile), [rows, filter, saved, profile]);
  const spotlightId = visible.find((o) => o.status === 'open')?.id ?? null;
  // The featured tile is the spotlight (first open round); it moves to the top-left of the bento.
  const ordered = useMemo(() => {
    if (!spotlightId) return visible;
    const hero = visible.find((o) => o.id === spotlightId);
    return hero ? [hero, ...visible.filter((o) => o.id !== spotlightId)] : visible;
  }, [visible, spotlightId]);
  const sizes = useMemo(() => packBento(ordered.length, cols, ordered.length ? 0 : null), [ordered.length, cols]);
  const profileReady = canMatch(profile);

  const choose = (f: FilterId) => {
    if (f === 'matched' && !isPro) {
      openPaywall('The Scholarship Matcher shows only the opportunities made for your field and level, ranked by how well you fit, and tells you why. It’s part of Pro.');
      return;
    }
    pickedFilter.current = true;
    setFilter(f);
  };

  return (
    <PageTransition label="Discover opportunities">
      <div className="container discover" data-wide>
        <PageHeader eyebrow="Discover" title="All opportunities" lede="Scholarships, internships and programmes open to African students, with real deadlines." />

        <div ref={sentinel} className="discover__sentinel" aria-hidden="true" />
        <div className="discover__filters" data-stuck={stuck || undefined}>
          <div className="discover__filters-scroll" role="radiogroup" aria-label="Filter opportunities">
            {FILTERS.map((f) => (
              <Chip
                key={f.id}
                kind="radio"
                selected={filter === f.id}
                onToggle={() => choose(f.id)}
                icon={f.id === 'matched' ? isPro ? <Sparkles aria-hidden="true" /> : <Lock aria-hidden="true" /> : undefined}
              >
                {f.label}
                {f.id === 'saved' && saved.size > 0 ? ` · ${saved.size}` : ''}
              </Chip>
            ))}
          </div>
        </div>

        {saveError && <Notice tone="error">Couldn't update your saved list: {saveError}</Notice>}

        {error && (
          <Notice tone="error" action={<Button variant="secondary" size="sm" icon={<RotateCcw aria-hidden="true" />} onClick={load}>Retry</Button>}>
            We couldn't load opportunities: {error}
          </Notice>
        )}

        {!error && !items && (
          <div className="discover__feed">
            <BentoSkeleton label="Loading opportunities" />
          </div>
        )}

        {items && (
          <div className="discover__feed">
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
                    // Chips only for real fits; a wall of "50% match" defaults would be noise.
                    match={o.match && o.match.score >= PERSONAL_MATCH ? o.match : undefined}
                    size={sizes[i]}
                    showReasons={filter === 'matched'}
                    spotlight={o.id === spotlightId}
                    saved={saved.has(o.id)}
                    onToggleSave={toggle}
                  />
                ))}
                {ordered.length === 0 &&
                  (filter === 'matched' ? (
                    profileReady ? (
                      // A complete profile is not the problem: point at everything instead.
                      <EmptyState
                        icon={Sparkles}
                        title="No perfect matches today"
                        action={
                          <Button variant="primary" icon={<LayoutGrid aria-hidden="true" />} onClick={() => choose('all')}>
                            Explore all opportunities
                          </Button>
                        }
                      >
                        <p>Nothing is tagged for your field right now. Explore all opportunities; new ones arrive every week.</p>
                      </EmptyState>
                    ) : (
                      <EmptyState
                        icon={Sparkles}
                        title="We are finding more opportunities for you"
                        action={
                          <Link className="btn" data-variant="primary" to="/profile">
                            <UserRoundPen aria-hidden="true" /> Update your profile
                          </Link>
                        }
                      >
                        <p>Add your field of interest to your profile to get personal matches!</p>
                      </EmptyState>
                    )
                  ) : (
                    <EmptyState icon={SearchX} title="Nothing here yet">
                      <p>{EMPTY_COPY[filter]}</p>
                    </EmptyState>
                  ))}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
