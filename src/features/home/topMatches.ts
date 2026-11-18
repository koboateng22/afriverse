import type { Opportunity } from '../opportunities/types';
import type { Match } from '../opportunities/matcher';
import { isProfileMatch, type MatchProfile } from '../opportunities/profileMatch';

/** One card in the Home "Top matches" carousel. */
export type TopItem = { id: string; opportunity: Opportunity; match?: Match; reason: string };

const STATUS_SCORE = { open: 40, rolling: 30, upcoming: 10 } as const;
const DAY_MS = 86_400_000;

/**
 * Order among strict profile matches. Pro students' scholarship_matches() score wins
 * outright; otherwise open rounds first, then the closing-soon ones, then featured.
 */
export function scoreOpportunity(o: Opportunity, match?: Match, now = Date.now()): number {
  if (o.status === 'closed') return Number.NEGATIVE_INFINITY;
  if (match) return 1000 + match.score;
  let score: number = STATUS_SCORE[o.status];
  if (o.deadline) {
    const days = (new Date(`${o.deadline}T23:59:59Z`).getTime() - now) / DAY_MS;
    if (days >= 0 && days <= 30) score += 8;
  }
  if (o.featured) score += 5;
  return score;
}

/**
 * The 3–5 opportunities that fit the student best: only strict profile matches
 * (isProfileMatch), highest match first. Empty when nothing fits yet.
 */
export function buildTopMatches(input: { opportunities: Opportunity[]; matches?: Map<string, Match> | null; profile: MatchProfile; max?: number; now?: number }): TopItem[] {
  const { opportunities, matches, profile, max = 5, now = Date.now() } = input;
  return opportunities
    .filter((o) => isProfileMatch(o, profile))
    .map((o) => ({ o, match: matches?.get(o.id) }))
    .sort((a, b) => scoreOpportunity(b.o, b.match, now) - scoreOpportunity(a.o, a.match, now))
    .slice(0, max)
    .map(({ o, match }) => ({
      id: o.id,
      opportunity: o,
      match,
      reason: match ? `${match.score}% match` : `Fits ${profile?.field_of_interest ?? 'your field'}`,
    }));
}
