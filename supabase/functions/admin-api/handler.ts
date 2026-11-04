// Admin console backend. Every admin read and write goes through here using
// the service role, but only after the caller's JWT is verified AND their
// profile role is 'admin'.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { handle, HttpError, json, readJson } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { bool, httpsUrl, int, isoDate, oneOf, optStr, slug, str, strArray, uuid } from '../_shared/validate.ts';

type Payload = Record<string, unknown>;
type Action = (svc: SupabaseClient, p: Payload, adminId: string) => Promise<unknown>;

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) {
    const e = error as { code?: string; message?: string };
    if (e.code === '23505') throw new HttpError(409, 'duplicate', 'Something with that slug or reference already exists');
    if (e.code === '23503') throw new HttpError(409, 'in_use', 'This record is referenced by other data');
    if (e.code === '23514') throw new HttpError(400, 'invalid_input', e.message ?? 'A value is out of range');
    throw error;
  }
  return data;
}

const FIELDS = ['Software Engineering', 'Data & AI', 'Medicine & Health', 'Business & Entrepreneurship', 'Engineering', 'Agriculture', 'Law & Policy', 'Design & Creative'] as const;
const LEVELS = ['High school', 'Undergraduate', "Master's", 'PhD', 'Working professional'] as const;
const APP_STATUSES = ['Pending Payment', 'Paid', 'Submitted', 'In Review', 'Offer', 'Rejected', 'Withdrawn', 'Failed'] as const;
const BUCKET = 'application-documents';
const RESULTS_BUCKET = 'results_slips';

// ── Universities ─────────────────────────────────────────────────────────
const slugify = (t: string) =>
  t.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

/** Validates the per-university application form builder. */
function formFieldsInput(v: unknown) {
  const f = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  const flag = (k: string) => (f[k] === undefined ? false : bool(f[k], `form_fields.${k}`));
  const docs = Array.isArray(f.custom_documents) ? f.custom_documents : [];
  if (docs.length > 8) throw new HttpError(400, 'invalid_input', 'form_fields.custom_documents: at most 8 custom documents');
  const seen = new Set<string>();
  const custom = docs.map((d, i) => {
    const label = str((d as Record<string, unknown>)?.label, `form_fields.custom_documents[${i}].label`, { min: 2, max: 60 });
    let key = `doc_${slugify(label).replace(/-/g, '_')}`.slice(0, 44);
    while (seen.has(key)) key = `${key}_${i}`;
    seen.add(key);
    return { key, label };
  });
  return {
    high_school: flag('high_school'),
    waec_results: flag('waec_results'),
    guardian_name: flag('guardian_name'),
    guardian_email: flag('guardian_email'),
    guardian_occupation: flag('guardian_occupation'),
    custom_documents: custom,
  };
}

function universityInput(p: Payload) {
  const name = str(p.name, 'name', { min: 2, max: 160 });
  return {
    slug: p.slug ? slug(p.slug, 'slug') : slugify(name),
    name,
    short_name: optStr(p.short_name, 'short_name', 40),
    country: str(p.country, 'country', { min: 2, max: 80 }),
    city: str(p.city, 'city', { min: 2, max: 80 }),
    currency: 'GHS',
    // One application fee, entered in GHS, stored in pesewas.
    app_fee_cents: int(p.app_fee_cents, 'app_fee_cents', { min: 100, max: 100_000_000 }),
    service_fee_cents: 0,
    fee_notes: optStr(p.fee_notes, 'fee_notes', 400),
    website: httpsUrl(p.website, 'website', true),
    cutoff_link: httpsUrl(p.cutoff_link, 'cutoff_link', true),
    // Usually our own university_assets copies, filled in by scrape-university.
    logo_url: httpsUrl(p.logo_url, 'logo_url', true),
    cover_image_url: httpsUrl(p.cover_image_url, 'cover_image_url', true),
    description: optStr(p.description, 'description', 2000),
    form_fields: formFieldsInput(p.form_fields),
    active: p.active === undefined ? true : bool(p.active, 'active'),
  };
}

// ── Opportunities ────────────────────────────────────────────────────────
function opportunityInput(p: Payload) {
  const status = oneOf(p.status, 'status', ['open', 'rolling', 'upcoming', 'closed'] as const);
  const deadline = isoDate(p.deadline, 'deadline', true);
  if (status === 'open' && !deadline) throw new HttpError(400, 'invalid_input', 'deadline: open opportunities need a deadline');
  const fields = strArray(p.fields ?? [], 'fields', { maxItems: 8 });
  const levels = strArray(p.levels ?? [], 'levels', { maxItems: 5 });
  fields.forEach((f, i) => oneOf(f, `fields[${i}]`, FIELDS));
  levels.forEach((l, i) => oneOf(l, `levels[${i}]`, LEVELS));
  return {
    slug: slug(p.slug, 'slug'),
    title: str(p.title, 'title', { min: 3, max: 160 }),
    provider: str(p.provider, 'provider', { min: 2, max: 160 }),
    kind: oneOf(p.kind, 'kind', ['scholarship', 'fellowship', 'program', 'award'] as const),
    summary: str(p.summary, 'summary', { min: 10, max: 300 }),
    description: str(p.description, 'description', { min: 10, max: 3000 }),
    eligibility: strArray(p.eligibility ?? [], 'eligibility', { maxItems: 12, maxLen: 300 }),
    benefits: strArray(p.benefits ?? [], 'benefits', { maxItems: 12, maxLen: 300 }),
    pro_insights: strArray(p.pro_insights ?? [], 'pro_insights', { maxItems: 10, maxLen: 400 }),
    fields,
    levels,
    host_country: str(p.host_country, 'host_country', { min: 2, max: 80 }),
    open_to: str(p.open_to, 'open_to', { min: 2, max: 160 }),
    funding: oneOf(p.funding, 'funding', ['full', 'partial', 'stipend', 'free_training', 'prize'] as const),
    status,
    deadline,
    opens_on: isoDate(p.opens_on, 'opens_on', true),
    cycle_note: optStr(p.cycle_note, 'cycle_note', 400),
    url: httpsUrl(p.url, 'url') as string,
    is_pro: bool(p.is_pro ?? false, 'is_pro'),
    featured: bool(p.featured ?? false, 'featured'),
    published: bool(p.published ?? true, 'published'),
    verified_on: new Date().toISOString().slice(0, 10),
  };
}

// ── Courses + lessons ────────────────────────────────────────────────────
function courseInput(p: Payload) {
  return {
    slug: slug(p.slug, 'slug'),
    title: str(p.title, 'title', { min: 3, max: 140 }),
    field: oneOf(p.field, 'field', FIELDS),
    summary: str(p.summary, 'summary', { min: 10, max: 400 }),
    level: oneOf(p.level ?? 'Beginner', 'level', ['Beginner', 'Intermediate', 'Advanced'] as const),
    published: bool(p.published ?? true, 'published'),
  };
}

function lessonInput(p: Payload) {
  let youtube = str(p.youtube_id, 'youtube_id', { min: 11, max: 200 });
  // Accept a pasted URL and keep only the 11-character id.
  const m = youtube.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) youtube = m[1];
  if (!/^[A-Za-z0-9_-]{11}$/.test(youtube)) throw new HttpError(400, 'invalid_input', 'youtube_id: paste a YouTube link or the 11-character video id');
  return {
    course_id: uuid(p.course_id, 'course_id'),
    position: int(p.position, 'position', { min: 1, max: 200 }),
    title: str(p.title, 'title', { min: 3, max: 160 }),
    youtube_id: youtube,
    channel: optStr(p.channel, 'channel', 80),
    summary: optStr(p.summary, 'summary', 400),
  };
}

const ACTIONS: Record<string, Action> = {
  // ── Overview + revenue ────────────────────────────────────────────────
  'overview': async (svc) => {
    const tables = ['profiles', 'mentors', 'opportunities', 'universities', 'courses', 'applications'] as const;
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const { count, error } = await svc.from(t).select('id', { count: 'exact', head: true });
      if (error) throw error;
      counts[t] = count ?? 0;
    }
    const { count: pendingMentors } = await svc.from('mentors').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    const { count: openApps } = await svc.from('applications').select('id', { count: 'exact', head: true }).in('status', ['Submitted', 'In Review']);
    const { count: refunds } = await svc.from('payments').select('id', { count: 'exact', head: true }).like('failure_reason', '%refund_required%');
    const { count: ratesPending } = await svc.from('mentors').select('id', { count: 'exact', head: true }).eq('rate_review', 'pending');
    // Distinct students: a card renewal or a stacked MoMo month adds rows for the same person.
    const proRows = (await must(svc.from('subscriptions').select('user_id').eq('status', 'active').gt('expires_at', new Date().toISOString()))) as Array<{ user_id: string }>;
    const activePro = new Set(proRows.map((r) => r.user_id)).size;
    const settings = (await must(svc.from('app_settings').select('key, value'))) as Array<{ key: string; value: unknown }>;
    const setting = (k: string) => String(settings.find((r) => r.key === k)?.value ?? '');
    const warnings = [
      !setting('support_whatsapp') && 'Set the WhatsApp support number (Settings) so students can send documents.',
      !setting('counselor_whatsapp') && 'Set the counsellor WhatsApp number (Settings) — Pro students are promised human counsellor access.',
    ].filter(Boolean);
    const revenue = await must(svc.rpc('revenue_summary'));
    return {
      counts,
      pending_mentors: pendingMentors ?? 0,
      rates_pending: ratesPending ?? 0,
      active_pro: activePro,
      open_applications: openApps ?? 0,
      refunds_needed: refunds ?? 0,
      warnings,
      revenue,
    };
  },
  'revenue': async (svc) => must(svc.rpc('revenue_summary')),

  // ── Universities ──────────────────────────────────────────────────────
  'universities.list': async (svc) => must(svc.from('universities').select('*').order('name')),
  'universities.create': async (svc, p) => must(svc.from('universities').insert(universityInput(p)).select('*').single()),
  'universities.update': async (svc, p) =>
    must(svc.from('universities').update(universityInput(p)).eq('id', uuid(p.id, 'id')).select('*').single()),
  'universities.delete': async (svc, p) => {
    const id = uuid(p.id, 'id');
    const { count } = await svc.from('applications').select('id', { count: 'exact', head: true }).eq('university_id', id);
    if ((count ?? 0) > 0) {
      // Keep history intact: universities with applications are hidden, not deleted.
      return must(svc.from('universities').update({ active: false }).eq('id', id).select('*').single());
    }
    await must(svc.from('universities').delete().eq('id', id));
    return { deleted: id };
  },

  // ── Opportunities ─────────────────────────────────────────────────────
  'opportunities.list': async (svc) => must(svc.from('opportunities').select('*').order('created_at', { ascending: false })),
  'opportunities.create': async (svc, p) => must(svc.from('opportunities').insert(opportunityInput(p)).select('*').single()),
  'opportunities.update': async (svc, p) =>
    must(svc.from('opportunities').update(opportunityInput(p)).eq('id', uuid(p.id, 'id')).select('*').single()),
  'opportunities.delete': async (svc, p) => {
    await must(svc.from('opportunities').delete().eq('id', uuid(p.id, 'id')));
    return { deleted: p.id };
  },

  // ── Courses + lessons ─────────────────────────────────────────────────
  'courses.list': async (svc) => must(svc.from('courses').select('*, lessons:course_lessons(*)').order('field').order('title')),
  'courses.create': async (svc, p) => must(svc.from('courses').insert(courseInput(p)).select('*').single()),
  'courses.update': async (svc, p) => must(svc.from('courses').update(courseInput(p)).eq('id', uuid(p.id, 'id')).select('*').single()),
  'courses.delete': async (svc, p) => {
    await must(svc.from('courses').delete().eq('id', uuid(p.id, 'id')));
    return { deleted: p.id };
  },
  'lessons.create': async (svc, p) => must(svc.from('course_lessons').insert(lessonInput(p)).select('*').single()),
  'lessons.update': async (svc, p) => must(svc.from('course_lessons').update(lessonInput(p)).eq('id', uuid(p.id, 'id')).select('*').single()),
  'lessons.delete': async (svc, p) => {
    await must(svc.from('course_lessons').delete().eq('id', uuid(p.id, 'id')));
    return { deleted: p.id };
  },

  // ── Mentors ───────────────────────────────────────────────────────────
  'mentors.list': async (svc) => {
    const rows = (await must(svc.from('mentors').select('*').order('created_at', { ascending: false }))) as Array<Record<string, unknown>>;
    const withEmail = [];
    for (const m of rows) {
      const { data } = await svc.auth.admin.getUserById(m.id as string);
      withEmail.push({ ...m, email: data.user?.email ?? null });
    }
    return withEmail;
  },
  'mentors.review': async (svc, p) => {
    const id = uuid(p.id, 'id');
    const decision = oneOf(p.decision, 'decision', ['approved', 'rejected', 'pending'] as const);
    const patch: Record<string, unknown> = { status: decision, approved_at: decision === 'approved' ? new Date().toISOString() : null };
    if (decision === 'approved') {
      const code = str(p.subaccount_code, 'subaccount_code', { min: 6, max: 40 });
      if (!/^ACCT_[A-Za-z0-9]+$/.test(code)) throw new HttpError(400, 'invalid_input', 'subaccount_code: Paystack subaccount codes look like ACCT_xxxxxxxx');
      patch.subaccount_code = code;
    }
    return must(svc.from('mentors').update(patch).eq('id', id).select('*').single());
  },
  // Admin approves (or rejects) the hourly GHS rate the mentor proposed.
  'mentors.rate': async (svc, p) => {
    const id = uuid(p.id, 'id');
    const decision = oneOf(p.decision, 'decision', ['approved', 'rejected'] as const);
    const m = (await must(svc.from('mentors').select('proposed_rate_cents').eq('id', id).single())) as { proposed_rate_cents: number | null };
    if (!m.proposed_rate_cents) throw new HttpError(409, 'no_proposal', 'This mentor has not proposed a rate');
    const patch = decision === 'approved' ? { rate_cents: m.proposed_rate_cents, currency: 'GHS', rate_review: 'approved' } : { rate_review: 'rejected' };
    return must(svc.from('mentors').update(patch).eq('id', id).select('*').single());
  },

  // ── Applications ──────────────────────────────────────────────────────
  'applications.list': async (svc, p) => {
    let q = svc
      .from('applications')
      .select('*, university:universities(name, short_name), student:profiles(full_name, phone, country, results)')
      .order('created_at', { ascending: false })
      .limit(500);
    if (typeof p.status === 'string' && p.status) q = q.eq('status', oneOf(p.status, 'status', APP_STATUSES));
    return must(q);
  },
  'applications.update_status': async (svc, p) => {
    const id = uuid(p.id, 'id');
    const status = oneOf(p.status, 'status', ['Submitted', 'In Review', 'Offer', 'Rejected', 'Withdrawn'] as const);
    const current = (await must(svc.from('applications').select('status').eq('id', id).single())) as { status: string };
    if (current.status === 'Pending Payment' || current.status === 'Failed') {
      throw new HttpError(409, 'unpaid', 'Unpaid applications cannot be moved forward');
    }
    if (current.status === 'Paid') throw new HttpError(409, 'form_pending', "The student hasn't submitted their application form yet");
    return must(svc.from('applications').update({ status, status_note: optStr(p.status_note, 'status_note', 500) }).eq('id', id).select('*').single());
  },

  // Short-lived download links for a student's uploaded documents.
  'applications.documents': async (svc, p) => {
    const id = uuid(p.id, 'id');
    const app = (await must(svc.from('applications').select('documents').eq('id', id).single())) as { documents: Array<{ key: string; label: string; path: string; name: string }> };
    const out = [];
    for (const d of app.documents ?? []) {
      const { data, error } = await svc.storage.from(BUCKET).createSignedUrl(d.path, 600);
      out.push({ ...d, url: error ? null : data?.signedUrl ?? null });
    }
    return out;
  },

  // Short-lived link to the result slip a student uploaded with their WASSCE grades.
  // The path is read from their profile, never taken from the request.
  'students.result_slip': async (svc, p) => {
    const id = uuid(p.user_id, 'user_id');
    const prof = (await must(svc.from('profiles').select('results').eq('id', id).single())) as { results: { slip_path?: string } | null };
    const path = prof.results?.slip_path;
    if (!path) throw new HttpError(404, 'no_slip', 'This student has not uploaded a result slip');
    const { data, error } = await svc.storage.from(RESULTS_BUCKET).createSignedUrl(path, 600);
    if (error || !data?.signedUrl) throw new HttpError(404, 'no_slip', 'The result slip file is missing');
    return { url: data.signedUrl };
  },

  // ── Settings (WhatsApp numbers, free AI limit) ────────────────────────
  'settings.get': async (svc) => {
    const rows = (await must(svc.from('app_settings').select('key, value'))) as Array<{ key: string; value: unknown }>;
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },
  'settings.update': async (svc, p) => {
    const phone = (v: unknown, field: string) => {
      const s = str(v ?? '', field, { max: 20, optional: true }).replace(/[\s-]/g, '');
      if (s && !/^\+?\d{9,15}$/.test(s)) throw new HttpError(400, 'invalid_input', `${field}: use an international number like +233551234987`, { field });
      return s.startsWith('0') ? `+233${s.slice(1)}` : s;
    };
    const rows = [
      { key: 'support_whatsapp', value: phone(p.support_whatsapp, 'support_whatsapp') },
      { key: 'counselor_whatsapp', value: phone(p.counselor_whatsapp, 'counselor_whatsapp') },
      { key: 'counselor_hours', value: str(p.counselor_hours ?? '', 'counselor_hours', { max: 80, optional: true }) },
      { key: 'free_ai_daily_limit', value: int(p.free_ai_daily_limit, 'free_ai_daily_limit', { min: 0, max: 100 }) },
    ];
    await must(svc.from('app_settings').upsert(rows, { onConflict: 'key' }));
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },

  // ── Plans ─────────────────────────────────────────────────────────────
  'plans.list': async (svc) => must(svc.from('plans').select('*').order('amount_cents')),
  'plans.update': async (svc, p) => {
    const amount = int(p.amount_cents, 'amount_cents', { min: 100, max: 100_000_000 });
    const current = (await must(svc.from('plans').select('amount_cents').eq('code', 'pro').single())) as { amount_cents: number };
    const patch: Record<string, unknown> = {
      amount_cents: amount,
      currency: 'GHS',
      ai_daily_limit: p.ai_daily_limit === null || p.ai_daily_limit === '' || p.ai_daily_limit === undefined ? null : int(p.ai_daily_limit, 'ai_daily_limit', { min: 1, max: 100_000 }),
      active: bool(p.active, 'active'),
    };
    // A new price needs a new Paystack plan; existing card subscribers keep their old price.
    if (amount !== current.amount_cents) patch.paystack_plan_code = null;
    return must(svc.from('plans').update(patch).eq('code', 'pro').select('*').single());
  },
};

export const handler = handle(async (req) => {
  const svc = serviceClient();
  const caller = await requireUser(req, svc);
  if (caller.role !== 'admin') throw new HttpError(403, 'forbidden', 'Admins only');

  const body = await readJson(req);
  const action = str(body.action, 'action', { max: 60 });
  const fn = ACTIONS[action];
  if (!fn) throw new HttpError(400, 'unknown_action', `Unknown action: ${action}`);
  const payload = (body.payload && typeof body.payload === 'object' ? body.payload : {}) as Payload;
  return json({ data: await fn(svc, payload, caller.user.id) });
});
