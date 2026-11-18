/**
 * A match between the student's profile and one opportunity: a 50–100 score and the
 * reasons behind it. Computed in the app by matchScore() (profileMatch.ts), the same
 * way for every page, so Home, Discover and the detail page never disagree.
 */
export type Match = { score: number; reasons: string[] };

/** From here a match is shown as strong (filled chip). */
export const MATCH_STRONG = 70;
