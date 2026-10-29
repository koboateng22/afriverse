// Saves a student's completed application form after the fee is paid.
// The required fields come from the form the university had AT PAYMENT TIME
// (applications.form_snapshot). Every uploaded file must already sit in the
// student's own folder in the private bucket.
import { handle, HttpError, json, readJson } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { optStr, str, uuid } from '../_shared/validate.ts';

const BUCKET = 'application-documents';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type FormFields = {
  high_school?: boolean;
  waec_results?: boolean;
  guardian_name?: boolean;
  guardian_email?: boolean;
  guardian_occupation?: boolean;
  custom_documents?: Array<{ key: string; label: string }>;
};

type Doc = { key: string; label: string; path: string; name: string; size: number; type: string };

export const handler = handle(async (req) => {
  const svc = serviceClient();
  const caller = await requireUser(req, svc);
  const body = await readJson(req);
  const applicationId = uuid(body.application_id, 'application_id');

  const { data: app, error } = await svc
    .from('applications')
    .select('id, user_id, status, form_snapshot, university_id')
    .eq('id', applicationId)
    .maybeSingle();
  if (error) throw error;
  if (!app || app.user_id !== caller.user.id) throw new HttpError(404, 'not_found', 'Application not found');
  if (app.status !== 'Paid') {
    throw new HttpError(409, 'not_editable', app.status === 'Pending Payment' ? 'Pay the application fee first' : 'This application has already been submitted');
  }
  const form = (app.form_snapshot ?? {}) as FormFields;

  // ── Text answers ────────────────────────────────────────────────────────
  const answers = (body.answers && typeof body.answers === 'object' ? body.answers : {}) as Record<string, unknown>;
  const formData: Record<string, string> = {
    full_name: str(answers.full_name, 'full_name', { min: 2, max: 120 }),
    email: str(answers.email, 'email', { min: 5, max: 160 }),
    phone: str(answers.phone, 'phone', { min: 9, max: 32 }),
  };
  if (!EMAIL.test(formData.email)) throw new HttpError(400, 'invalid_input', 'email: enter a valid email address', { field: 'email' });
  const program = str(body.program, 'program', { min: 2, max: 140 });
  const intake = optStr(body.intake, 'intake', 40);

  if (form.high_school) formData.high_school = str(answers.high_school, 'high_school', { min: 2, max: 160 });
  if (form.guardian_name) formData.guardian_name = str(answers.guardian_name, 'guardian_name', { min: 2, max: 120 });
  if (form.guardian_email) {
    formData.guardian_email = str(answers.guardian_email, 'guardian_email', { min: 5, max: 160 });
    if (!EMAIL.test(formData.guardian_email)) throw new HttpError(400, 'invalid_input', "guardian_email: enter a valid email address", { field: 'guardian_email' });
  }
  if (form.guardian_occupation) formData.guardian_occupation = str(answers.guardian_occupation, 'guardian_occupation', { min: 2, max: 120 });

  // ── Documents ───────────────────────────────────────────────────────────
  const required: Array<{ key: string; label: string }> = [];
  if (form.waec_results) required.push({ key: 'waec_results', label: 'WAEC / WASSCE results' });
  for (const d of form.custom_documents ?? []) required.push({ key: d.key, label: d.label });

  const given = Array.isArray(body.documents) ? (body.documents as Array<Record<string, unknown>>) : [];
  const folder = `${caller.user.id}/${app.id}`;
  const { data: stored, error: listErr } = await svc.storage.from(BUCKET).list(folder, { limit: 100 });
  if (listErr) throw listErr;
  const storedNames = new Set((stored ?? []).map((o) => o.name));

  const documents: Doc[] = required.map((r) => {
    const d = given.find((g) => g.key === r.key);
    const path = typeof d?.path === 'string' ? d.path : '';
    if (!path) throw new HttpError(400, 'invalid_input', `${r.key}: upload your ${r.label}`, { field: r.key });
    if (!path.startsWith(`${folder}/`) || path.slice(folder.length + 1).includes('/') || !storedNames.has(path.slice(folder.length + 1))) {
      throw new HttpError(400, 'invalid_input', `${r.key}: the ${r.label} upload wasn't found — please upload it again`, { field: r.key });
    }
    return {
      key: r.key,
      label: r.label,
      path,
      name: typeof d?.name === 'string' ? d.name.slice(0, 160) : path.split('/').pop() ?? '',
      size: typeof d?.size === 'number' ? d.size : 0,
      type: typeof d?.type === 'string' ? d.type.slice(0, 80) : '',
    };
  });

  const { data: updated, error: upErr } = await svc
    .from('applications')
    .update({ program, intake, form_data: formData, documents, status: 'Submitted', submitted_at: new Date().toISOString() })
    .eq('id', app.id)
    .eq('status', 'Paid')
    .select('id, status, submitted_at')
    .maybeSingle();
  if (upErr) throw upErr;
  if (!updated) throw new HttpError(409, 'not_editable', 'This application has already been submitted');

  // Keep the student's contact details in sync for next time.
  await svc.from('profiles').update({ phone: formData.phone }).eq('id', caller.user.id).is('phone', null);

  return json(updated);
});
