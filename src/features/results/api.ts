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

/** Saves and returns what the database stored (it recomputes the aggregate). */
export async function saveMyResults(userId: string, input: ResultsInput): Promise<WassceResults> {
  const { data, error } = await getSupabase().from('profiles').update({ results: input }).eq('id', userId).select('results').single();
  if (error) throw error;
  return (data as { results: WassceResults }).results;
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
