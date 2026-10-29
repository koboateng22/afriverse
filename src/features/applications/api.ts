import { getSupabase } from '../../lib/supabase';
import { invokeFunction } from '../../lib/functions';
import type { Application } from './types';

export type ApplicationWithUniversity = Application & { university: { name: string; short_name: string | null; city: string; country: string } | null };

export async function fetchMyApplications(): Promise<ApplicationWithUniversity[]> {
  const { data, error } = await getSupabase()
    .from('applications')
    .select('*, university:universities(name, short_name, city, country)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ApplicationWithUniversity[];
}

export async function fetchApplication(id: string): Promise<ApplicationWithUniversity | null> {
  const { data, error } = await getSupabase()
    .from('applications')
    .select('*, university:universities(name, short_name, city, country)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as ApplicationWithUniversity | null;
}

/** The student's unfinished (paid, form not submitted) application for a university, if any. */
export async function fetchOpenApplication(universityId: string): Promise<{ id: string } | null> {
  const { data, error } = await getSupabase()
    .from('applications')
    .select('id')
    .eq('university_id', universityId)
    .eq('status', 'Paid')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string } | null;
}

export const DOCUMENTS_BUCKET = 'application-documents';
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];

/**
 * Uploads one document to the private bucket at <user>/<application>/<field>.<ext>.
 * Storage RLS only allows this while the application is 'Paid' and owned by the caller.
 */
export async function uploadDocument(userId: string, applicationId: string, key: string, file: File): Promise<{ path: string }> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('That file is over 10 MB. Try a smaller scan or photo.');
  if (!ACCEPTED_TYPES.includes(file.type)) throw new Error('Upload a PDF or a photo (JPG, PNG, WEBP or HEIC).');
  const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
  const path = `${userId}/${applicationId}/${key}.${ext}`;
  const { error } = await getSupabase().storage.from(DOCUMENTS_BUCKET).upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return { path };
}

export type SubmitApplicationInput = {
  application_id: string;
  program: string;
  intake?: string;
  answers: Record<string, string>;
  documents: Array<{ key: string; path: string; name: string; size: number; type: string }>;
};

/** Server validates the form against the university's requirements, then marks it Submitted. */
export function submitApplication(input: SubmitApplicationInput): Promise<{ id: string; status: string; submitted_at: string }> {
  return invokeFunction('application-submit', input);
}
