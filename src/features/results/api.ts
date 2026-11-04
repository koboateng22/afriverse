import { getSupabase } from '../../lib/supabase';
import { invokeFunction } from '../../lib/functions';
import type { Curriculum, SubjectGrade, WassceResults } from './types';

export const RESULTS_BUCKET = 'results_slips';

/** The signed-in student's saved results, or null. Kept out of PROFILE_COLUMNS so sign-in never depends on it. */
export async function fetchMyResults(userId: string): Promise<WassceResults | null> {
  const { data, error } = await getSupabase().from('profiles').select('results').eq('id', userId).maybeSingle();
  if (error) throw error;
  return ((data as { results: WassceResults | null } | null)?.results ?? null);
}

export type ResultsInput = {
  curriculum: Curriculum;
  core_subjects: SubjectGrade[];
  elective_subjects: SubjectGrade[];
  source: 'manual' | 'scan';
  slip_path?: string;
};

/**
 * Saves the signed-in student's results and returns what the database stored
 * (it recomputes the aggregate). Upserts on id; needs migration 0014's grants.
 */
export async function saveMyResults(resultData: ResultsInput): Promise<WassceResults> {
  const supabase = getSupabase();
  const { data: auth, error: authError } = await supabase.auth.getSession();
  const user = auth.session?.user;
  if (authError || !user) {
    console.error('[results] save failed: no signed-in user', authError);
    throw authError ?? new Error('Sign in again to save your results.');
  }

  const { data, error } = await supabase.from('profiles').upsert({ id: user.id, results: resultData }, { onConflict: 'id' });
  if (error) {
    console.error('[results] save failed', { code: error.code, message: error.message, details: error.details, hint: error.hint }, data);
    throw error;
  }

  const saved = await fetchMyResults(user.id);
  if (!saved) throw new Error('Your results did not save. Please try again.');
  return saved;
}

/** Keeps one slip per student (replaced on each scan), at <user>/result-slip.jpg. */
export async function uploadSlip(userId: string, image: Blob): Promise<string> {
  const path = `${userId}/result-slip.jpg`;
  const { error } = await getSupabase().storage.from(RESULTS_BUCKET).upload(path, image, { upsert: true, contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}

export type ScanResponse = { core_subjects: Array<{ subject: string; grade: string }>; elective_subjects: Array<{ subject: string; grade: string }> };

// INTEGRATION: groq vision — scan-results reads the slip; nothing is saved until the student confirms.
export function scanSlip(imageDataUrl: string): Promise<ScanResponse> {
  return invokeFunction<ScanResponse>('scan-results', { image: imageDataUrl });
}
