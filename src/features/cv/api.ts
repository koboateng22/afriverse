import { getSupabase } from '../../lib/supabase';
import { FunctionError, invokeFunction, TIMEOUT_CODE } from '../../lib/functions';
import { errorMessage } from '../../lib/supabase';

export type ExperienceKind = 'job' | 'internship' | 'volunteer';
export type CvDetails = {
  personal: { name: string; email: string; phone: string; linkedin: string; location: string };
  education: Array<{ school: string; qualification: string; year: string }>;
  experience: Array<{ kind: ExperienceKind; title: string; organisation: string; period: string; details: string }>;
  skills: { hard: string[]; soft: string[] };
};
export type CvRow = { id: string; target_role: string; details: CvDetails; markdown: string; generated_at: string | null; updated_at: string };
export type Generated = { cv: CvRow; unlocked: boolean; remaining_today: number };

/** 30 s for a whole CV. The function gives the AI 22 s, so it always answers first. */
export const CV_TIMEOUT_MS = 30_000;

/** Writes (or rewrites, with cvId) the CV with AI and saves it. */
export function generateCv(targetRole: string, details: CvDetails, cvId?: string): Promise<Generated> {
  return invokeFunction<Generated>('cv-builder', { target_role: targetRole, ...details, ...(cvId ? { cv_id: cvId } : {}) }, { timeoutMs: CV_TIMEOUT_MS });
}

const COLUMNS = 'id, target_role, details, markdown, generated_at, updated_at';

export async function fetchLatestCv(): Promise<CvRow | null> {
  const { data, error } = await getSupabase().from('cvs').select(COLUMNS).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as CvRow | null;
}

export async function fetchCv(id: string): Promise<CvRow | null> {
  const { data, error } = await getSupabase().from('cvs').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as CvRow | null;
}

/** The "Edit" button: saves the student's own changes to the text. */
export async function saveCvMarkdown(id: string, markdown: string): Promise<void> {
  const { error } = await getSupabase().from('cvs').update({ markdown }).eq('id', id);
  if (error) throw error;
}

/** Pro, or this CV's one-time download was paid for. */
export async function isCvUnlocked(id: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('cv_unlocked', { p_cv: id });
  if (error) throw error;
  return data === true;
}

export const emptyDetails = (): CvDetails => ({
  personal: { name: '', email: '', phone: '', linkedin: '', location: '' },
  education: [{ school: '', qualification: '', year: '' }],
  experience: [{ kind: 'job', title: '', organisation: '', period: '', details: '' }],
  skills: { hard: [], soft: [] },
});

/** "Excel, SQL ,  teamwork" → ['Excel', 'SQL', 'teamwork'] */
export const splitSkills = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 20);

/**
 * What went wrong, in the server's own words whenever it answered ({ error, message }).
 * Only when no answer arrived at all do we say so, with the browser's error text.
 */
export function cvErrorMessage(err: unknown): string {
  if (err instanceof FunctionError) {
    if (err.code === TIMEOUT_CODE) return 'Generation took too long. Please try again. Your details are still here.';
    if (err.code === 'network') {
      const detail = typeof err.body.detail === 'string' ? err.body.detail : 'no response';
      return `The CV service didn’t answer (${detail}). Please try again in a minute. Your details are still here.`;
    }
    return err.message; // exactly what cv-builder sent back
  }
  return errorMessage(err);
}
