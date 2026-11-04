/** WASSCE grades and the aggregate rules. Mirrors normalize_profile_results() in migration 0013. */
export const GRADES = ['A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9'] as const;
export type Grade = (typeof GRADES)[number];
export type Curriculum = 'old' | 'new';

export type SubjectGrade = { subject: string; grade: Grade };

/** Shape of profiles.results. `aggregate` is recomputed by the database on save. */
export type WassceResults = {
  curriculum: Curriculum;
  core_subjects: SubjectGrade[];
  elective_subjects: SubjectGrade[];
  aggregate: number;
  source: 'manual' | 'scan';
  slip_path?: string;
  updated_at: string;
};

export const CURRICULA: Record<Curriculum, { label: string; detail: string; cores: string[]; electiveSlots: number; maxElectives: number }> = {
  // Social Studies is on the old slip but isn't counted here, so it has no slot.
  old: {
    label: 'Old curriculum',
    detail: '3 cores + best 3 of up to 5 electives. Social Studies isn’t counted.',
    cores: ['English Language', 'Core Mathematics', 'Integrated Science'],
    electiveSlots: 5,
    maxElectives: 5,
  },
  new: {
    label: 'New curriculum',
    detail: 'Best 3 cores + best 3 of your 6 or 7 electives.',
    cores: ['English Language', 'Mathematics', 'Science'],
    electiveSlots: 6,
    maxElectives: 7,
  },
};

export const CORE_COUNT = 3;
export const BEST_ELECTIVES = 3;

export const isGrade = (g: unknown): g is Grade => typeof g === 'string' && (GRADES as readonly string[]).includes(g);
export const points = (g: Grade) => GRADES.indexOf(g) + 1;

/** Indexes of the `n` best (lowest) grades; ties keep the earlier row. */
export function bestIndexes(grades: Array<Grade | ''>, n: number): number[] {
  return grades
    .map((g, i) => ({ i, p: g ? points(g) : Infinity }))
    .filter((x) => Number.isFinite(x.p))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .slice(0, n)
    .map((x) => x.i);
}

/**
 * Aggregate (lower is better; 6 is perfect). Old: all three cores + best 3 electives.
 * New: best 3 cores + best 3 electives — with three cores, every core counts either way.
 * null until all three cores and at least three electives have grades.
 */
export function aggregateOf(cores: Array<Grade | ''>, electives: Array<Grade | ''>): number | null {
  if (cores.filter(Boolean).length < CORE_COUNT) return null;
  const best = bestIndexes(electives, BEST_ELECTIVES);
  if (best.length < BEST_ELECTIVES) return null;
  const sum = (gs: Array<Grade | ''>, idx: number[]) => idx.reduce((t, i) => t + points(gs[i] as Grade), 0);
  return sum(cores, bestIndexes(cores, CORE_COUNT)) + sum(electives, best);
}

/** Common elective names, offered as suggestions (students can type any subject). */
export const ELECTIVE_SUGGESTIONS = [
  'Elective Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Economics',
  'Geography',
  'Government',
  'History',
  'Literature-in-English',
  'Christian Religious Studies',
  'Islamic Religious Studies',
  'French',
  'Business Management',
  'Financial Accounting',
  'Cost Accounting',
  'Information & Communication Technology',
  'Computing',
  'Agricultural Science',
  'Animal Husbandry',
  'General Agriculture',
  'Food & Nutrition',
  'Management in Living',
  'Clothing & Textiles',
  'Visual Arts',
  'Graphic Design',
  'Technical Drawing',
  'Building Construction',
  'Music',
];
