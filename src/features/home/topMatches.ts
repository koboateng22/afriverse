import type { Opportunity } from '../opportunities/types';
import type { Match } from '../opportunities/matcher';
import type { Mentor } from '../mentors/types';
import type { University } from '../universities/types';
import type { Profile } from '../profiles/types';

/** One card in the Home "Top matches" carousel. */
export type TopItem =
  | { type: 'opportunity'; id: string; opportunity: Opportunity; match?: Match; reason: string | null }
  | { type: 'mentor'; id: string; mentor: Mentor }
  | { type: 'university'; id: string; university: University };

type Who = Pick<Profile, 'field_of_interest' | 'education_level' | 'country'> | null | undefined;

const STATUS_SCORE = { open: 40, rolling: 30, upcoming: 10 } as const;
const DAY_MS = 86_400_000;

/**
 * How well an opportunity suits this student today. Pro students' scholarship_matches()
 * score wins outright; otherwise: open first, then their field and level, then urgency.
 * Closed rounds never make the list.
 */
export function scoreOpportunity(o: Opportunity, who: Who, match?: Match, now = Date.now()): number {
  if (o.status === 'closed') return Number.NEGATIVE_INFINITY;
  if (match) return 1000 + match.score;
  let score: number = STATUS_SCORE[o.status];
  if (who?.field_of_interest && o.fields.includes(who.field_of_interest)) score += 30;
  if (who?.education_level && o.levels.includes(who.education_level)) score += 20;
  if (o.deadline) {
    const days = (new Date(`${o.deadline}T23:59:59Z`).getTime() - now) / DAY_MS;
    if (days >= 0 && days <= 30) score += 8;
  }
  if (o.featured) score += 5;
  return score;
}

/** The one-line "why" on the card, when there is one. */
function reasonFor(o: Opportunity, who: Who, match?: Match): string | null {
  if (match) return `${match.score}% match`;
  if (who?.field_of_interest && o.fields.includes(who.field_of_interest)) return `Fits ${who.field_of_interest}`;
  if (who?.education_level && o.levels.includes(who.education_level)) return `For ${who.education_level.toLowerCase()} students`;
  return null;
}

/** A different pick each day ("for today"), preferring items that suit the student. */
export function pickForToday<T>(list: T[], prefer: (item: T) => boolean, now = Date.now()): T | null {
  if (list.length === 0) return null;
  const preferred = list.filter(prefer);
  const pool = preferred.length > 0 ? preferred : list;
  return pool[Math.floor(now / DAY_MS) % pool.length];
}

const words = (s: string | null | undefined) => (s ?? '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);

/**
 * Up to `max` opportunities ranked for the student, with one mentor (2nd slot after
 * the first two) and one university (after the fourth) mixed in, Spotify-shelf style.
 */
export function buildTopMatches(input: {
  opportunities: Opportunity[];
  matches?: Map<string, Match> | null;
  profile: Who;
  mentors?: Mentor[];
  universities?: University[];
  max?: number;
  now?: number;
}): TopItem[] {
  const { opportunities, matches, profile, mentors = [], universities = [], max = 5, now = Date.now() } = input;

  const ranked = opportunities
    .map((o) => ({ o, match: matches?.get(o.id), score: scoreOpportunity(o, profile, matches?.get(o.id), now) }))
    .filter((r) => Number.isFinite(r.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map<TopItem>(({ o, match }) => ({ type: 'opportunity', id: `o:${o.id}`, opportunity: o, match, reason: reasonFor(o, profile, match) }));

  const fieldWords = words(profile?.field_of_interest);
  const mentor = pickForToday(
    mentors.filter((m) => m.status === 'approved' && (m.rate_cents ?? 0) > 0),
    (m) => fieldWords.length > 0 && m.expertise.some((e) => words(e).some((w) => fieldWords.includes(w))),
    now,
  );
  const university = pickForToday(
    universities.filter((u) => u.active),
    (u) => Boolean(profile?.country) && u.country === profile?.country,
    now,
  );

  const out = [...ranked];
  if (mentor) out.splice(Math.min(2, out.length), 0, { type: 'mentor', id: `m:${mentor.id}`, mentor });
  if (university) out.splice(Math.min(4, out.length), 0, { type: 'university', id: `u:${university.id}`, university });
  return out;
}
