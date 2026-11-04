import { CORE_COUNT, CURRICULA, isGrade, type Curriculum, type Grade } from './types';
import type { ScanResponse } from './api';

export type ElectiveRow = { subject: string; grade: Grade | '' };

/** Core slots, in CURRICULA order: English, Mathematics, Science. */
const CORE_MATCH: Array<(name: string) => boolean> = [
  (n) => /english/i.test(n) && !/literature/i.test(n),
  (n) => /math/i.test(n) && !/elective|further|additional/i.test(n),
  (n) => /science/i.test(n) && !/social|agric|computer|home|elective|health/i.test(n),
];
/** A core the scanner filed under electives: only exact-looking core names are moved. */
const STRICT_CORE: RegExp[] = [/^english( language)?$/i, /^(core |general )?math(ematic)?s?( \(core\))?$/i, /^(integrated |general )?science$/i];
const SOCIAL = /social/i;

const gradeOf = (g: string): Grade | '' => (isGrade(g) ? g : '');

export type AppliedScan = {
  cores: Array<Grade | ''>;
  electives: ElectiveRow[];
  /** Subjects read from the slip that were placed in a slot. */
  filled: number;
  /** Subjects left out (Social Studies, or more electives than the curriculum allows). */
  dropped: string[];
  /** Placed subjects whose grade couldn't be read. */
  unreadable: number;
};

/** Places the scanner's subjects into the calculator's core slots and elective rows. */
export function applyScan(curriculum: Curriculum, scan: ScanResponse): AppliedScan {
  const { electiveSlots, maxElectives } = CURRICULA[curriculum];
  const cores: Array<Grade | ''> = Array(CORE_COUNT).fill('');
  const coreTaken = Array(CORE_COUNT).fill(false);
  const electives: ElectiveRow[] = [];
  const dropped: string[] = [];

  const placeCore = (name: string, grade: string, match: Array<(n: string) => boolean>) => {
    const slot = match.findIndex((m, i) => !coreTaken[i] && m(name));
    if (slot < 0) return false;
    coreTaken[slot] = true;
    cores[slot] = gradeOf(grade);
    return true;
  };

  for (const s of scan.core_subjects ?? []) {
    if (SOCIAL.test(s.subject)) {
      dropped.push(s.subject);
      continue;
    }
    if (!placeCore(s.subject, s.grade, CORE_MATCH)) electives.push({ subject: s.subject, grade: gradeOf(s.grade) });
  }
  for (const s of scan.elective_subjects ?? []) {
    if (SOCIAL.test(s.subject)) {
      dropped.push(s.subject);
      continue;
    }
    if (!placeCore(s.subject, s.grade, STRICT_CORE.map((re) => (n: string) => re.test(n.trim())))) {
      electives.push({ subject: s.subject, grade: gradeOf(s.grade) });
    }
  }

  const kept = electives.slice(0, maxElectives);
  dropped.push(...electives.slice(maxElectives).map((e) => e.subject));
  const rows = [...kept, ...Array.from({ length: Math.max(0, electiveSlots - kept.length) }, () => ({ subject: '', grade: '' as const }))];
  const placed = coreTaken.filter(Boolean).length + kept.length;
  const unreadable = cores.filter((g, i) => coreTaken[i] && !g).length + kept.filter((e) => !e.grade).length;
  return { cores, electives: rows, filled: placed, dropped, unreadable };
}
