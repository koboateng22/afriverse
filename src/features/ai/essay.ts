// International essay reviewer: options, labels and the checks the form makes
// before sending. Keep keys in sync with supabase/functions/gemini-chat/essay.ts.

export type Destination = 'us' | 'uk' | 'canada' | 'europe' | 'other';
export type EssayType =
  | 'personal_statement' | 'common_app' | 'coalition' | 'supplemental' | 'short_answer' | 'ucas' | 'canada_profile' | 'sop'
  | 'motivation_letter' | 'scholarship' | 'academic_interest' | 'activity' | 'community' | 'research';
export type Criterion =
  | 'authenticity' | 'storytelling' | 'clarity_structure' | 'reflection' | 'intellectual_curiosity'
  | 'impact_initiative' | 'prompt_relevance' | 'specificity' | 'language' | 'overall_effectiveness';
export type LimitUnit = 'words' | 'characters';
export type MissingInfo = 'prompt' | 'university' | 'programme' | 'limit' | 'essay_type';

export const DESTINATIONS: Array<{ id: Destination; label: string; system: string }> = [
  { id: 'us', label: 'United States', system: 'Common App, supplements' },
  { id: 'uk', label: 'United Kingdom', system: 'UCAS' },
  { id: 'canada', label: 'Canada', system: 'University-specific' },
  { id: 'europe', label: 'Europe', system: 'Motivation letters, SOPs' },
  { id: 'other', label: 'Another country', system: 'Tell us where' },
];

export const TYPE_LABEL: Record<EssayType, string> = {
  personal_statement: 'Personal statement',
  common_app: 'Common App personal essay',
  coalition: 'Coalition Application essay',
  supplemental: 'University supplemental essay',
  short_answer: 'Short-answer response',
  ucas: 'UCAS personal statement',
  canada_profile: 'Personal profile / supplementary application',
  sop: 'Statement of Purpose (SOP)',
  motivation_letter: 'Motivation letter',
  scholarship: 'Scholarship essay',
  academic_interest: 'Academic interest essay',
  activity: 'Extracurricular / leadership essay',
  community: 'Personal background / diversity essay',
  research: 'Research or programme-specific statement',
};

/** Most likely types first for each destination; every type stays available. */
const FIRST: Record<Destination, EssayType[]> = {
  us: ['common_app', 'coalition', 'supplemental', 'short_answer', 'activity', 'community', 'scholarship'],
  uk: ['ucas', 'scholarship', 'sop'],
  canada: ['canada_profile', 'short_answer', 'personal_statement', 'scholarship'],
  europe: ['motivation_letter', 'sop', 'research', 'scholarship'],
  other: ['personal_statement', 'motivation_letter', 'sop', 'scholarship'],
};
export const typesFor = (d: Destination): EssayType[] => [...FIRST[d], ...(Object.keys(TYPE_LABEL) as EssayType[]).filter((t) => !FIRST[d].includes(t))];

export const AUTO_TYPE = 'Not sure, let the reviewer identify it';

/** Limits fixed by the application system. Anything else must come from the prompt. */
export const DEFAULT_LIMIT: Partial<Record<EssayType, { value: number; unit: LimitUnit; note: string }>> = {
  common_app: { value: 650, unit: 'words', note: 'Common App personal essay: 250–650 words.' },
  ucas: { value: 4000, unit: 'characters', note: 'UCAS: 4,000 characters including spaces across the three questions (at least 350 each).' },
};

export const CRITERION_LABEL: Record<Criterion, string> = {
  authenticity: 'Authenticity & personal voice',
  storytelling: 'Storytelling',
  clarity_structure: 'Clarity & structure',
  reflection: 'Depth of reflection',
  intellectual_curiosity: 'Intellectual curiosity',
  impact_initiative: 'Impact & initiative',
  prompt_relevance: 'Relevance to the prompt',
  specificity: 'Specificity',
  language: 'Language & grammar',
  overall_effectiveness: 'Overall effectiveness',
};
/** Label for a stored criterion key (falls back to the key itself). */
export const criterionLabel = (k: string) => CRITERION_LABEL[k as Criterion] ?? k.replace(/_/g, ' ');

export const MISSING_LABEL: Record<MissingInfo, string> = {
  prompt: 'the exact essay prompt',
  university: 'the university',
  programme: 'the programme or course',
  limit: 'the word or character limit',
  essay_type: 'the essay type',
};

const NEEDS_PROMPT: EssayType[] = ['common_app', 'coalition', 'supplemental', 'short_answer', 'scholarship', 'academic_interest', 'activity', 'community', 'canada_profile'];
const NEEDS_UNIVERSITY: EssayType[] = ['supplemental', 'motivation_letter', 'sop', 'research', 'canada_profile'];
const NEEDS_PROGRAMME: EssayType[] = ['ucas', 'sop', 'motivation_letter', 'research'];

/** Same rules as the server: what's missing that would change the review. */
export function missingInfo(f: { type: EssayType | 'auto'; prompt: string; university: string; programme: string; hasLimit: boolean }): MissingInfo[] {
  const out: MissingInfo[] = [];
  if (f.type === 'auto') return ['essay_type', ...(f.prompt.trim() ? [] : (['prompt'] as MissingInfo[]))];
  if (!f.prompt.trim() && NEEDS_PROMPT.includes(f.type)) out.push('prompt');
  if (!f.university.trim() && NEEDS_UNIVERSITY.includes(f.type)) out.push('university');
  if (!f.programme.trim() && NEEDS_PROGRAMME.includes(f.type)) out.push('programme');
  if (!f.hasLimit && !DEFAULT_LIMIT[f.type]) out.push('limit');
  return out;
}

export const countWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

// ── Saved review shapes ──────────────────────────────────────────────────
export type LimitCheck = {
  value: number | null;
  unit: LimitUnit;
  source: string | null;
  used: number;
  min: number | null;
  status: 'within' | 'over' | 'under_min' | 'unknown';
};

export type FlagKind = 'generic' | 'repetitive' | 'vague' | 'unnecessary' | 'unsupported';
export type Advice = { assessment: string; recommendation: string };

export type EssayReviewV2 = {
  v: 2;
  context: { destination: Destination; country: string; essay_type: EssayType | 'auto'; detected_type: EssayType; university: string; programme: string; prompt: string };
  type_note: string;
  overall: { score: number | null; summary: string };
  scores: Array<{ key: Criterion; score: number | null; why: string }>;
  strongest: Criterion[];
  weakest: Criterion[];
  strengths: string[];
  weaknesses: string[];
  sections: Array<{ paragraph: number; role: 'opening' | 'body' | 'conclusion'; excerpt: string; assessment: string; suggestion: string }>;
  opening: Advice;
  conclusion: Advice;
  storytelling_reflection: string[];
  /** Most important first. */
  improvements: Array<{ issue: string; why: string; how: string }>;
  flagged: Array<{ quote: string; kind: FlagKind; note: string }>;
  /** Objective errors to fix. */
  corrections: Array<{ original: string; corrected: string; note: string }>;
  prompt_alignment: { verdict: 'answers' | 'partly' | 'misses' | 'no_prompt'; note: string };
  /** Optional rewrites of weak sentences, built from the essay's own facts. */
  suggestions: Array<{ original: string; suggestion: string; why: string; unverified: string[] }>;
  next_steps: string[];
  questions: string[];
  missing: MissingInfo[];
  count: { words: number; characters: number; paragraphs: number };
  limit: LimitCheck;
  dropped_quotes: number;
};

export const isV2 = (r: unknown): r is EssayReviewV2 => Boolean(r && typeof r === 'object' && (r as { v?: number }).v === 2);

/** Where to confirm requirements, by destination. */
export const OFFICIAL_SOURCE: Record<Destination, string> = {
  us: 'Check each university’s admissions page and the Common App for this year’s prompts and limits.',
  uk: 'Check UCAS and each university’s course page; some courses ask for more than the personal statement.',
  canada: 'Check the university’s own admissions page: profiles and supplementary applications differ by school and programme.',
  europe: 'Check the programme’s application page: letter length and format differ by country and university.',
  other: 'Check the university’s official admissions guidance for this year’s requirements.',
};
