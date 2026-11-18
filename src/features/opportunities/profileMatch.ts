import type { Profile } from '../profiles/types';
import type { Match } from './matcher';
import type { Opportunity } from './types';

export type MatchProfile = Pick<Profile, 'field_of_interest' | 'education_level'> & Partial<Pick<Profile, 'goals'>>;
type Who = MatchProfile | null | undefined;
type Scored = Pick<Opportunity, 'title' | 'summary' | 'kind' | 'fields' | 'levels' | 'status'>;

/**
 * Words that mean each profile field when they appear in an opportunity's title or summary,
 * matched case-insensitively on word boundaries. Scraped opportunities usually arrive with
 * no field tags at all, so this is how "Mastercard Foundation Scholarship in Computer
 * Science" still reaches a Software Engineering student.
 */
const FIELD_WORDS: Record<string, string[]> = {
  'software engineering': ['software', 'computer', 'computing', 'computer science', 'programming', 'coding', 'developers?', 'tech', 'technology', 'ict', 'cyber ?security', 'web'],
  'data & ai': ['data', 'data science', 'artificial intelligence', 'ai', 'machine learning', 'analytics', 'statistics'],
  'medicine & health': ['medicine', 'medical', 'health', 'healthcare', 'nursing', 'pharmacy', 'clinical', 'doctors?', 'public health'],
  'business & entrepreneurship': ['business', 'entrepreneurs?', 'entrepreneurship', 'start-?ups?', 'mba', 'management', 'finance', 'economics'],
  engineering: ['engineering', 'engineers?', 'mechanical', 'electrical', 'civil'],
  agriculture: ['agriculture', 'agricultural', 'agri', 'agribusiness', 'farming', 'food security'],
  'law & policy': ['law', 'legal', 'policy', 'public policy', 'governance', 'human rights'],
  'design & creative': ['design', 'creative', 'arts?', 'film', 'media', 'music', 'fashion'],
};

/** Goals (profiles.goals) and the kinds of opportunity that serve them. */
const GOAL_KINDS: Record<string, Array<Opportunity['kind']>> = {
  scholarship: ['scholarship', 'fellowship'],
  career: ['internship', 'fellowship', 'program'],
  skills: ['program', 'internship'],
};

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const escape = (s: string) => s.replace(/[.*+^${}()|[\]\\]/g, '\\$&');

/** True when the text mentions the field: its own name, or one of its words. */
export function mentionsField(text: string, field: string): boolean {
  const f = norm(field);
  if (!f) return false;
  const words = FIELD_WORDS[f] ?? f.split(/[^a-z]+/).filter((w) => w.length > 3);
  const pattern = new RegExp(`\\b(${[escape(f), ...words].join('|')})\\b`, 'i');
  return pattern.test(text);
}

/** Below this an opportunity is only a default (50%): fine for Home, not a "Matched for you" result. */
export const PERSONAL_MATCH = 60;

/**
 * How well an opportunity fits the student, 50–100, or null when it doesn't fit at all.
 * Every comparison is case-insensitive.
 *   100  tagged for the student's field (opportunities.fields)
 *    80  the title or summary names the field ("…in Computer Science")
 *    60  untagged, but its kind serves one of the student's goals (scholarship → scholarships)
 *    50  untagged and nothing to go on: shown, never hidden (most scraped rows)
 *  null  closed; for other study levels only; or tagged for other fields and never mentions theirs
 */
export function matchScore(o: Scored, who: Who): Match | null {
  if (o.status === 'closed') return null;
  const level = norm(who?.education_level);
  if (level && o.levels.length > 0 && !o.levels.some((l) => norm(l) === level)) return null;

  const field = norm(who?.field_of_interest);
  const fieldLabel = who?.field_of_interest?.trim() ?? '';
  const tagged = o.fields.length > 0;
  const reasons: string[] = [];
  if (o.levels.length > 0 && level) reasons.push(`Fits your level: ${who?.education_level}`);

  if (field && o.fields.some((f) => norm(f) === field)) return { score: 100, reasons: [`Matches your field: ${fieldLabel}`, ...reasons] };
  if (field && mentionsField(`${o.title} ${o.summary}`, field)) return { score: 80, reasons: [`About ${fieldLabel}`, ...reasons] };
  // Tagged for other fields only: a Computer Science student never gets the medical round.
  if (field && tagged) return null;

  const goal = (who?.goals ?? []).find((g) => GOAL_KINDS[norm(g)]?.includes(o.kind));
  if (goal) return { score: 60, reasons: ['Open to every field', `Fits your goal: ${goal === 'scholarship' ? 'win a scholarship' : goal === 'career' ? 'choose a career' : 'learn new skills'}`, ...reasons] };
  return { score: 50, reasons: [tagged ? 'Add your field to your profile for sharper matches' : 'Open to every field', ...reasons] };
}

/** "Matched for you": a real fit (60+), not just a default. */
export function isProfileMatch(o: Scored, who: Who): boolean {
  return (matchScore(o, who)?.score ?? 0) >= PERSONAL_MATCH;
}

/** Enough profile to match on: without a field there is nothing personal to match. */
export const canMatch = (who: Who) => Boolean(who?.field_of_interest?.trim());
