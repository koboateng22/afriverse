import { Award, Briefcase, Building2, GraduationCap, Medal, UsersRound, type LucideIcon } from 'lucide-react';
import type { OpportunityKind } from './types';
import './category.css';

/**
 * Home feed accents. Every card keeps the dark glass surface; only the accent
 * changes: icon, its glowing circle, a 2px edge and a 10% wash behind the media.
 *   scholarship  emerald     scholarships + fellowships
 *   internship   terracotta  internships
 *   mentorship   purple      mentors, plus programmes and awards (cohort programmes)
 *   university   gold        university applications (the concierge)
 */
export type Category = 'scholarship' | 'internship' | 'mentorship' | 'university';

export const CATEGORY_LABEL: Record<Category, string> = {
  scholarship: 'Scholarship',
  internship: 'Internship',
  mentorship: 'Mentorship',
  university: 'University application',
};

export const CATEGORY_ICON: Record<Category, LucideIcon> = {
  scholarship: GraduationCap,
  internship: Briefcase,
  mentorship: UsersRound,
  university: Building2,
};

/** Matches the feed filters: Scholarships = scholarship + fellowship, Programmes = program + award. */
export function categoryOf(kind: OpportunityKind): Category {
  if (kind === 'internship') return 'internship';
  if (kind === 'program' || kind === 'award') return 'mentorship';
  return 'scholarship';
}

/** What the card calls it: the opportunity's own kind, so a colour never stands alone. */
export const KIND_LABEL: Record<OpportunityKind, string> = {
  scholarship: 'Scholarship',
  fellowship: 'Fellowship',
  internship: 'Internship',
  program: 'Programme',
  award: 'Award',
};

export const KIND_ICON: Record<OpportunityKind, LucideIcon> = {
  scholarship: GraduationCap,
  fellowship: Award,
  internship: Briefcase,
  program: UsersRound,
  award: Medal,
};
