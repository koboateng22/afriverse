import type { Profile } from '../profiles/types';
import type { Opportunity } from './types';

export type MatchProfile = Pick<Profile, 'field_of_interest' | 'education_level'> | null | undefined;

/**
 * "Matched for you" is strict: an opportunity counts only when it is listed for the
 * student's own field (opportunities.fields uses the same values as
 * profiles.field_of_interest), is still open or upcoming, and, if it names study
 * levels, includes the student's. A Computer Science student sees tech rounds, never
 * medical ones; rounds tagged for no field ("any field") are not personal matches.
 */
export function isProfileMatch(o: Pick<Opportunity, 'fields' | 'levels' | 'status'>, who: MatchProfile): boolean {
  const field = who?.field_of_interest;
  if (!field) return false;
  if (o.status === 'closed') return false;
  if (!o.fields.includes(field)) return false;
  const level = who?.education_level;
  if (level && o.levels.length > 0 && !o.levels.includes(level)) return false;
  return true;
}
