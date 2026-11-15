#!/usr/bin/env node
/**
 * Uploads the 6-digit-code email templates in supabase/templates/ to the hosted project
 * (the same thing as pasting them into Dashboard → Authentication → Emails), and sets the
 * code length to 6 and the expiry to 1 hour.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx PROJECT_REF=abcdefghijklmnop node scripts/push-email-templates.mjs
 *
 * SUPABASE_ACCESS_TOKEN: a personal access token from https://supabase.com/dashboard/account/tokens
 * PROJECT_REF: the id in your project URL (https://<ref>.supabase.co). Never commit either.
 * Add --dry-run to print what would be sent without sending it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(join(root, 'supabase', 'templates', name), 'utf8');

const body = {
  mailer_otp_length: 6,
  mailer_otp_exp: 3600,
  mailer_subjects_confirmation: 'Your Afriversity confirmation code',
  mailer_templates_confirmation_content: read('confirmation.html'),
  mailer_subjects_magic_link: 'Your Afriversity sign-in code',
  mailer_templates_magic_link_content: read('magic_link.html'),
  mailer_subjects_recovery: 'Your Afriversity password reset code',
  mailer_templates_recovery_content: read('recovery.html'),
};

for (const [k, v] of Object.entries(body)) {
  if (k.endsWith('_content') && !v.includes('{{ .Token }}')) throw new Error(`${k} is missing {{ .Token }}`);
}

if (process.argv.includes('--dry-run')) {
  for (const [k, v] of Object.entries(body)) console.log(k, typeof v === 'string' ? `${v.length} chars` : v);
  process.exit(0);
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.PROJECT_REF;
if (!token || !ref) {
  console.error('Set SUPABASE_ACCESS_TOKEN and PROJECT_REF. See the comment at the top of this file.');
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
if (!res.ok) {
  console.error(`Supabase answered ${res.status}: ${await res.text()}`);
  process.exit(1);
}
console.log('Email templates updated: confirm signup, magic link and reset password now send a 6-digit code.');
