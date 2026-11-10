import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Building2, Landmark, MapPin, Search, ShieldQuestion } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { ListSkeleton } from '../../components/Skeleton/Skeleton';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Notice } from '../../components/Notice/Notice';
import { Field, SelectField } from '../../components/Field/Field';
import { fetchUniversities } from '../../features/universities/api';
import { OwnershipBadge } from '../../features/universities/OwnershipBadge';
import { useAuth } from '../../features/auth/useAuth';
import { ResultsStrip } from '../../features/results/ResultsStrip';
import { useMyResults } from '../../features/results/useMyResults';
import { feeOf, groupOf, matchesSearch, OWNERSHIP_LABEL, type OwnershipGroup, type University } from '../../features/universities/types';
import { formatMoney } from '../../lib/money';
import { errorMessage } from '../../lib/supabase';
import { lift, press, riseItem, staggerParent } from '../../lib/motion';
import './ApplyUniversity.css';

const MotionLink = motion.create(Link);

// Two categories, two tabs. Universities not yet classified are in neither (see below the tabs).
type Tab = 'public' | 'private';
const TABS: Tab[] = ['public', 'private'];
const ALL_COUNTRIES = 'All countries';

const SECTION: Record<OwnershipGroup, { title: string; blurb: string; icon: typeof Landmark }> = {
  public: { title: 'Public universities', blurb: 'Owned and funded by the state.', icon: Landmark },
  private: { title: 'Private universities', blurb: 'Independently owned and run.', icon: Building2 },
  unverified: { title: 'Still being classified', blurb: 'We’re confirming from official sources whether these are public or private. You can still apply.', icon: ShieldQuestion },
};

function UniCard({ u }: { u: University }) {
  const group = groupOf(u);
  const programmes = u.programmes ?? [];
  return (
    <MotionLink to={`/apply-university/${u.slug}`} className="uni-card" variants={riseItem} whileHover={lift} whileTap={press} data-ownership={group}>
      <span className="uni-card__mono" aria-hidden="true">
        {u.logo_url ? <img src={u.logo_url} alt="" loading="lazy" /> : (u.short_name ?? u.name.slice(0, 3))}
      </span>
      <span className="uni-card__text">
        <span className="uni-card__name">{u.name}</span>
        <span className="uni-card__where">
          <MapPin aria-hidden="true" /> {u.city}, {u.country}
        </span>
        <span className="uni-card__tags">
          <OwnershipBadge u={u} />
          {programmes.length > 0 && (
            <span className="uni-card__progs">
              {programmes.slice(0, 2).join(', ')}
              {programmes.length > 2 ? ` +${programmes.length - 2} more` : ''}
            </span>
          )}
        </span>
      </span>
      <span className="uni-card__price">
        <span className="uni-card__total">{formatMoney(feeOf(u), 'GHS')}</span>
        <span className="uni-card__all-in">
          {u.service_fee_cents > 0 ? `University fee + ${formatMoney(u.service_fee_cents, 'GHS')} service` : 'University fee, no service fee'}
        </span>
      </span>
      <ArrowRight className="uni-card__go" aria-hidden="true" />
    </MotionLink>
  );
}

export default function ApplyUniversity() {
  const [unis, setUnis] = useState<University[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { profile } = useAuth();
  const { results } = useMyResults(profile?.id);
  // The tab lives in the URL, so back/forward and shared links keep it.
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('type') === 'private' ? 'private' : 'public';
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState(ALL_COUNTRIES);

  useEffect(() => {
    fetchUniversities()
      .then(setUnis)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const countries = useMemo(() => [...new Set((unis ?? []).map((u) => u.country))].sort(), [unis]);
  const filtered = useMemo(
    () => (unis ?? []).filter((u) => matchesSearch(u, query) && (country === ALL_COUNTRIES || u.country === country)),
    [unis, query, country],
  );
  // Each university belongs to exactly one group, so nothing appears twice.
  const groups = useMemo(() => {
    const by: Record<OwnershipGroup, University[]> = { public: [], private: [], unverified: [] };
    for (const u of filtered) by[groupOf(u)].push(u);
    return by;
  }, [filtered]);
  const pick = (t: Tab) => setParams(t === 'public' ? {} : { type: t }, { replace: true });
  const searching = Boolean(query.trim()) || country !== ALL_COUNTRIES;
  const { title, blurb, icon: TabIcon } = SECTION[tab];

  return (
    <PageTransition label="Apply to university">
      <div className="container apply-list">
        <PageHeader
          back={{ to: '/profile', label: 'You' }}
          eyebrow="University concierge"
          title="We'll handle your application"
          lede="Skip the bank queues. We buy the voucher and submit the forms for you."
        />
        <ol className="apply-steps" aria-label="How it works">
          <li><b>1</b> Pick a university and pay online: its fee + our service fee.</li>
          <li><b>2</b> Fill in one short form from your phone.</li>
          <li><b>3</b> We buy the voucher and submit your application.</li>
        </ol>
        <ResultsStrip results={results} />
        {error && <Notice tone="error">{error}</Notice>}

        {unis && unis.length > 0 && (
          <div className="uni-filters">
            <div className="uni-tabs" role="tablist" aria-label="University type">
              {TABS.map((t) => (
                <button key={t} type="button" role="tab" id={`uni-tab-${t}`} aria-selected={tab === t} aria-controls="uni-results" className="uni-tab" onClick={() => pick(t)}>
                  {tab === t && <motion.span layoutId="uni-tab-pill" className="uni-tab__pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                  <span className="uni-tab__label">{OWNERSHIP_LABEL[t]}</span>
                  <span className="uni-tab__count">{groups[t].length}</span>
                </button>
              ))}
            </div>
            <div className="uni-filters__row">
              <Field
                label="Search universities"
                type="search"
                icon={<Search />}
                placeholder="Name, city or programme"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {countries.length > 1 && (
                <SelectField label="Country" options={[ALL_COUNTRIES, ...countries]} value={country} onChange={(e) => setCountry(e.target.value)} />
              )}
            </div>
          </div>
        )}

        {!unis && !error && <ListSkeleton kind="card" count={3} label="Loading universities" className="apply-list__grid" />}
        {unis && unis.length === 0 && (
          <EmptyState icon={Building2} title="No universities open right now">
            <p>The team adds universities as their application windows open.</p>
          </EmptyState>
        )}

        {unis && unis.length > 0 && (
          <div className="uni-groups">
            <section id="uni-results" role="tabpanel" aria-labelledby={`uni-tab-${tab}`} className="uni-group" data-ownership={tab} aria-live="polite">
              <header className="uni-group__head">
                <span className="uni-group__icon" aria-hidden="true"><TabIcon /></span>
                <div>
                  <h2 className="uni-group__title">
                    {title} <span className="uni-group__count">{groups[tab].length}</span>
                  </h2>
                  <p className="uni-group__blurb">{blurb}</p>
                </div>
              </header>
              {groups[tab].length === 0 ? (
                <p className="uni-groups__empty">
                  {searching
                    ? `No ${tab} universities match your search. Try another name, city or programme${groups[tab === 'public' ? 'private' : 'public'].length ? `, or look under ${tab === 'public' ? 'Private' : 'Public'}` : ''}.`
                    : `No ${tab} universities are open through Afriversity right now.`}
                </p>
              ) : (
                <motion.div key={tab} className="apply-list__grid" variants={staggerParent} initial="hidden" animate="show">
                  {groups[tab].map((u) => <UniCard key={u.id} u={u} />)}
                </motion.div>
              )}
            </section>

            {groups.unverified.length > 0 && (
              <details className="uni-pending" data-ownership="unverified">
                <summary>
                  <ShieldQuestion aria-hidden="true" />
                  <span>{SECTION.unverified.title} <span className="uni-group__count">{groups.unverified.length}</span></span>
                </summary>
                <p className="uni-group__blurb">{SECTION.unverified.blurb}</p>
                <div className="apply-list__grid">
                  {groups.unverified.map((u) => <UniCard key={u.id} u={u} />)}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
