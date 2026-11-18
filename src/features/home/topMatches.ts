import type { Opportunity } from '../opportunities/types';
import type { Match } from '../opportunities/matcher';
import { matchScore, type MatchProfile } from '../opportunities/profileMatch';

/** One card in the Home "Top matches" carousel. */
export type TopItem = { id: string; opportunity: Opportunity; match: Match; reason: string };

const STATUS_SCORE = { open: 3, rolling: 2, upcoming: 1 } as const;

/** Tie-break among equal scores: open rounds first, then the soonest deadline. */
function tieBreak(a: Opportunity, b: Opportunity): number {
  const s = (STATUS_SCORE[b.status as keyof typeof STATUS_SCORE] ?? 0) - (STATUS_SCORE[a.status as keyof typeof STATUS_SCORE] ?? 0);
  if (s !== 0) return s;
  return (a.deadline ?? a.opens_on ?? '9999').localeCompare(b.deadline ?? b.opens_on ?? '9999');
}

/**
 * The 3–5 opportunities that fit the student best, highest match first. Untagged rows
 * count as 50% matches, so Home is empty only when nothing open is listed at all.
 */
export function buildTopMatches(input: { opportunities: Opportunity[]; profile: MatchProfile | null | undefined; max?: number }): TopItem[] {
  const { opportunities, profile, max = 5 } = input;
  return opportunities
    .map((o) => ({ o, match: matchScore(o, profile) }))
    .filter((r): r is { o: Opportunity; match: Match } => r.match !== null)
    .sort((a, b) => b.match.score - a.match.score || tieBreak(a.o, b.o))
    .slice(0, max)
    .map(({ o, match }) => ({ id: o.id, opportunity: o, match, reason: `${match.score}% match` }));
}
