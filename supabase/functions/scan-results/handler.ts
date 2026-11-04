// INTEGRATION: groq (vision) — reads a photo of a WASSCE result slip.
// The browser sends the image as base64; this returns the subjects and grades
// it found. Nothing is saved here: the student reviews the grades in the
// Result Calculator and saves them, and the database recomputes the aggregate.
// Limits: SCANS_PER_DAY per student (result_scans), separate from AI chat.
import { handle, HttpError, json, readJson } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { readImageJson } from '../_shared/groq.ts';
import { oneOf } from '../_shared/validate.ts';

const SCANS_PER_DAY = 10;
const SCANS_PER_MINUTE = 3;
/** Decoded bytes. The client shrinks photos to ~1600px JPEG, well under this. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_SUBJECTS = 12;

export const PROMPT =
  "Extract the subject names and grades (A1-F9) from this WASSCE result slip. Return ONLY a valid JSON object with 'core_subjects' and 'elective_subjects'. " +
  'Each is an array of objects shaped {"subject": "<subject name as printed>", "grade": "<A1|B2|B3|C4|C5|C6|D7|E8|F9>"}. ' +
  'Core subjects are English Language, Mathematics (Core), Integrated or General Science and Social Studies; every other subject is an elective. ' +
  'Copy grades exactly as printed. If a grade is unreadable use an empty string. If the image is not a result slip, return both arrays empty.';

type Subject = { subject: string; grade: string };
const GRADES = ['A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9'];

/** "a1", "A 1", "Al" (l for 1), "B-3" → "A1"/"B3"; anything else → "". */
export function normalizeGrade(v: unknown): string {
  if (typeof v !== 'string') return '';
  const g = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2).replace(/^([A-F])[IL]$/, '$11');
  return GRADES.includes(g) ? g : '';
}

export function subjects(v: unknown): Subject[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, MAX_SUBJECTS)
    .map((x) => {
      const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
      const subject = typeof o.subject === 'string' ? o.subject.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
      return { subject, grade: normalizeGrade(o.grade) };
    })
    .filter((s) => s.subject.length > 0);
}

/** Accepts a data URL or bare base64; returns a data URL Groq can read. */
function imageDataUrl(body: Record<string, unknown>): string {
  const raw = typeof body.image === 'string' ? body.image.trim() : '';
  if (!raw) throw new HttpError(400, 'invalid_input', 'image: send the photo as a base64 string');
  const m = raw.match(/^data:(image\/[a-z+]+);base64,(.*)$/s);
  const mime = m ? m[1] : oneOf(body.mime ?? 'image/jpeg', 'mime', ['image/jpeg', 'image/png', 'image/webp'] as const);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new HttpError(400, 'invalid_input', 'Upload a JPG, PNG or WEBP photo of your result slip.');
  const b64 = (m ? m[2] : raw).replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new HttpError(400, 'invalid_input', 'image: not valid base64');
  if (Math.floor((b64.length * 3) / 4) > MAX_IMAGE_BYTES) throw new HttpError(413, 'image_too_large', 'That photo is too large. Try again — the app shrinks photos before sending.');
  return `data:${mime};base64,${b64}`;
}

export const handler = handle(async (req) => {
  const svc = serviceClient();
  const caller = await requireUser(req, svc);
  if (caller.role !== 'student') throw new HttpError(403, 'students_only', 'Only student accounts can scan result slips');

  const image = imageDataUrl(await readJson(req));

  const count = async (ms: number) => {
    const { count, error } = await svc
      .from('result_scans')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', caller.user.id)
      .gte('created_at', new Date(Date.now() - ms).toISOString());
    if (error) throw error;
    return count ?? 0;
  };
  if ((await count(86_400_000)) >= SCANS_PER_DAY) throw new HttpError(429, 'daily_limit', `You've used today's ${SCANS_PER_DAY} scans. Enter your grades by hand, or scan again tomorrow.`);
  if ((await count(60_000)) >= SCANS_PER_MINUTE) throw new HttpError(429, 'slow_down', 'Too many scans in a minute — wait a moment and try again.');
  // Counted before the call, so failing or repeated scans can't run up the AI bill.
  const { error: logError } = await svc.from('result_scans').insert({ user_id: caller.user.id });
  if (logError) throw logError;

  const text = await readImageJson({ prompt: PROMPT, imageDataUrl: image });
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new HttpError(502, 'ai_bad_json', "We couldn't read that slip. Try a sharper, well-lit photo, or enter your grades by hand.");
  }

  const core_subjects = subjects(parsed.core_subjects);
  const elective_subjects = subjects(parsed.elective_subjects);
  if (core_subjects.length + elective_subjects.length === 0) {
    throw new HttpError(422, 'nothing_found', "We couldn't find any grades in that photo. Make sure the whole slip is in frame and in focus.");
  }
  return json({ core_subjects, elective_subjects });
});
