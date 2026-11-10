# Afriversity

A mobile-first web platform for African students: matched scholarships, YouTube micro-courses with an AI tutor, an AI career counsellor, paid mentors, and a concierge that applies to universities on the student's behalf.

Three surfaces:

| Surface | Routes |
|---|---|
| **Student** | `/`, `/login`, `/signup`, `/onboarding`, `/home`, `/opportunity/:id`, `/career-compass`, `/courses`, `/courses/:id`, `/essay-review`, `/mentors`, `/mentors/:id`, `/apply-university`, `/apply-university/:id`, `/applications`, `/applications/:id/complete`, `/profile`, `/results`, `/ambassador` (ambassadors), `/paywall`, `/checkout` |
| **Mentor** | `/mentor/login` (quiet link at the bottom of `/login`), `/mentor/dashboard`, `/mentor/sessions`, `/mentor/earnings` |
| **Admin** | `/admin`, `/admin/universities`, `/admin/opportunities`, `/admin/courses`, `/admin/mentors`, `/admin/ambassadors`, `/admin/applications`, `/admin/plans`, `/admin/settings` — never linked; non-admins are sent to `/` |

Revenue, all in **Ghana cedis (GHS)**:

- **Freemium AI** — Career Compass and the AI Essay Reviewer are free for every signed-in student. The Essay Reviewer is built for applications to universities abroad (US, UK, Canada, Europe, elsewhere): it judges each essay by its destination's rules and essay type (not Ghanaian/WASSCE conventions), scores ten categories with reasons, checks length in code, and reviews rather than rewrites: corrections and optional suggestions, never invented achievements. One daily allowance for everyone (Admin → Settings, default 50) only stops spam.
- **Pro — GHS 40/month**, the only paid tier: human support (direct WhatsApp access to a counsellor, CV & essay strategy sessions, priority support), plus the Scholarship Matcher, full Application Tracker and insider guides.
- **University Concierge** — students pay the university's fee + our service fee (set per university, default GHS 50). We buy the voucher and submit the forms; the student fills in one form built from that university's admin-chosen fields and uploads documents.
- **Campus Ambassadors** — an admin turns a student into an ambassador with a referral code (Admin → Ambassadors). Students enter the code at signup ("Have a referral code?", or the `?ref=` link the ambassador shares). When a referred student first pays for Pro, GH₵ 5 goes to the ambassador's *pending* earnings (renewals earn nothing). Ambassadors see their numbers in the Ambassador Hub (`/ambassador`) but can't cash out: an admin sends MoMo at month end and presses **Mark as Paid**, which moves that amount to *paid* (migration `0018`).
- **Mentor sessions** — mentors propose an hourly rate, an admin approves it, students pay it; 75% to the mentor, 25% to Afriversity.

**Stack:** Vite + React 18 + TypeScript · hand-written CSS (no frameworks) · Framer Motion · Supabase (Postgres, Auth, RLS, Edge Functions) · Paystack · Groq (OpenAI-compatible chat API) · YouTube Data API v3 · Resend.

---

## 1. Setup

You need Node 20+ and a Supabase project.

```bash
npm install
cp .env.example .env      # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev               # http://localhost:5173
```

### Database

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push      # applies supabase/migrations/0001 … 0019
```

Then open the Supabase SQL editor and run **`supabase/seed.sql`** once. It loads the 5 universities (with fees), 8 opportunities, 8 careers, 4 course tracks × 3 lessons, the Pro plan (GHS 40) and the Pro insider guides. Migration `0010` also creates the private `application-documents` storage bucket and its policies. (`npx supabase db reset` runs it automatically on a local stack.)

### Admin account

There is no admin signup.

1. Supabase Dashboard → Authentication → Users → **Add user** (tick "Auto confirm").
2. Put that email into `supabase/admin/seed_admin.sql` and run it in the SQL editor.

### Auth providers (Dashboard → Authentication)

| Provider | What to do |
|---|---|
| Email | On by default. Under URL Configuration add `https://your-domain.com/auth/callback` (and `http://localhost:5173/auth/callback`). |
| Google | Providers → Google → paste a Google Cloud OAuth client ID + secret. |
| Phone | Providers → Phone → connect an SMS provider (Twilio, MessageBird, Vonage or Textlocal). |

### Edge functions

```bash
npx supabase secrets set PAYSTACK_SECRET_KEY=sk_test_... GROQ_API_KEY=... \
  YOUTUBE_API_KEY=... RESEND_API_KEY=re_... SITE_URL=https://your-domain.com

npx supabase functions deploy paystack-init
npx supabase functions deploy paystack-verify
npx supabase functions deploy paystack-webhook --no-verify-jwt
npx supabase functions deploy gemini-chat
npx supabase functions deploy youtube-search
npx supabase functions deploy admin-api
npx supabase functions deploy subscription-cron
npx supabase functions deploy paystack-subscription
npx supabase functions deploy application-submit
npx supabase functions deploy scan-results
npx supabase functions deploy scrape-university
npx supabase functions deploy fetch-scholarships
```

**After deploying, open Admin → Settings** and set the support WhatsApp number (powers "Need help? Send your documents via WhatsApp." on the application form) and the counsellor WhatsApp number Pro students are given. The admin overview warns until both are set.

**Schedule the renewal job** — Dashboard → Integrations → Cron → new job, every hour, HTTP POST to
`https://<ref>.supabase.co/functions/v1/subscription-cron` with header `Authorization: Bearer <service-role key>`.
It sends the 3-day and 1-day reminders, marks lapsed plans `expired` and emails the student. Access ends at `expires_at` even if the job never runs — `active_plan()` compares against `now()`.

**Schedule the scholarship feed check** — same place, a second job, once a day (e.g. `0 6 * * *`), HTTP POST to
`https://<ref>.supabase.co/functions/v1/fetch-scholarships` with the same header. It reads Opportunity Desk and
Opportunities for Africans and puts new items in Admin → Opportunities → **Pending Review**; nothing reaches students until
an admin approves it. Admins can also press **Check feeds now**.

Expired opportunities hide themselves: migration `0017` schedules a pg_cron job (`expire-opportunities`, midnight UTC)
that unpublishes and closes everything whose deadline has passed.

---

## 2. Environment variables

| Variable | Where | Required | Purpose |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `.env` (client) | yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `.env` (client) | yes | Public anon key — RLS protects the data |
| `VITE_POSTHOG_KEY` | `.env` (client) | no | Analytics (optional) |
| `SUPABASE_SERVICE_ROLE_KEY` | function secret | yes* | Bypasses RLS inside edge functions. *Injected automatically on hosted Supabase. |
| `PAYSTACK_SECRET_KEY` | function secret | yes | Initialize/verify transactions and check webhook signatures |
| `GROQ_API_KEY` | function secret | yes | Career Compass, lesson tutor and essay reviewer (all via the `gemini-chat` function) |
| `YOUTUBE_API_KEY` | function secret | yes | Day-in-the-life video search |
| `RESEND_API_KEY` | function secret | yes | Renewal / expiry emails |
| `SITE_URL` | function secret | recommended | Allowed return URL(s) after Paystack checkout |
| `GROQ_MODEL` | function secret | no | Defaults to `llama-3.3-70b-versatile`, falling back to `openai/gpt-oss-120b` if Groq rejects it as retired |
| `GROQ_VISION_MODEL` | function secret | no | Result-slip scanner (`scan-results`). Defaults to `qwen/qwen3.8-27b`; Groq retired `llama-3.2-11b-vision-preview` in April 2025 |
| `RESEND_FROM` | function secret | no | Verified sender; defaults to Resend's test sender |
| `GROQ_API_BASE` | function secret | no | Only for pointing tests at a local OpenAI-compatible server |
| `PAYSTACK_API_BASE` | function secret | no | Only for CI with an `sk_test_` key; **ignored for live keys**, so production always calls `api.paystack.co` |

No server secret is ever read by the Vite build — only `VITE_` variables reach the browser. A missing secret makes the function fail loudly with `not_configured`; nothing pretends to succeed.

---

## 3. Paystack

**Integration points** (all real HTTP calls to `api.paystack.co`):

1. `src/features/billing/paystack.ts` — the browser says *what* is being bought, then `redirectToCheckout()` does a full-page redirect (MoMo approval prompts fail inside iframes/popups).
2. `paystack-init` — verifies the Supabase JWT, prices the purchase **from the database** (Pro plan, the university's fee, the mentor's *approved* rate), creates pending rows, calls `/transaction/initialize` in `GHS`. Any amount the browser sends is ignored.
   - **Pro by card** → a Paystack **plan** (`interval: monthly`, GHS 10, created automatically on first use) so the card is charged every month. Paystack subscriptions only support cards, so:
   - **Pro by Mobile Money** → a one-off GHS 10 charge that gives one month (stacks on any remaining time). The paywall offers both as one choice.
   - **Mentor booking** → `subaccount` = the mentor's `ACCT_…`, `transaction_charge` = 25% (flat, in pesewas) so the split is exact on every booking whatever the subaccount's own setting, and `bearer: account` so the mentor receives a clean 75%.
5. `paystack-subscription` — cancel auto-renew (`/subscription/disable`) or get Paystack's "update card" link.
3. `paystack-webhook` — verifies `x-paystack-signature` (HMAC-SHA512, constant-time compare; wrong → 401), checks the charged amount, currency (GHS) and metadata against the pending payment, then activates Pro / marks the application **Paid** (unlocking its form) / confirms the mentor session. It also handles monthly card renewals (`charge.success` on the plan), `subscription.create`, `subscription.not_renew`, `subscription.disable` and `invoice.payment_failed`. Nothing unlocks until this (or `paystack-verify`) has confirmed the charge with Paystack.
4. `paystack-verify` — `/checkout` polls this; if the webhook hasn't arrived it calls `/transaction/verify/:reference` and applies the same fulfilment.

**Webhook:** Paystack Dashboard → Settings → API Keys & Webhooks → Webhook URL
`https://<ref>.supabase.co/functions/v1/paystack-webhook`

**Channels:** Settings → Preferences → enable **Mobile Money** (MTN, Telecel, AirtelTigo) and **Card**.

**Currency:** every price is GHS and stored in pesewas. The database refuses non-GHS universities, mentor rates and plans. Changing the Pro price in Admin → Pro plan creates a new Paystack plan at the next card checkout; existing card subscribers keep their price.

**Mentor subaccounts:** for each approved mentor, Paystack Dashboard → Subaccounts → **Create subaccount** with their settlement bank or MoMo wallet (any percentage — the app overrides it per transaction with a flat 25%). Paste the `ACCT_…` code in Admin → Mentors → Review. Bookings stay paused until the code is set **and** the mentor's proposed hourly rate is approved. The mentor's 75% is settled to their bank by Paystack — the app labels payouts as "settled manually".

**Test credentials** (test mode only):

| Method | Details |
|---|---|
| Card | `4084 0840 8408 4081`, CVV `408`, any future expiry, PIN `0000`, OTP `123456` |
| MoMo (Ghana) | MTN `0551234987` · Telecel `0501234987` · AirtelTigo `0271234987`, OTP `123456` |

Amounts are always in pesewas: GH₵10 = `1000`, GH₵250 = `25000`.

**Going live (test → live keys):**

1. Complete Paystack business verification.
2. `npx supabase secrets set PAYSTACK_SECRET_KEY=sk_live_...`
3. Paste the same webhook URL into the **live** webhook field.
4. Recreate each mentor subaccount in live mode and update their codes in Admin → Mentors.
5. Make one small real payment end to end before announcing.

---

## 4. How the money is protected

- `payments`, `subscriptions`, `applications`, `mentor_sessions`: clients can only **read their own rows**. No client role holds INSERT/UPDATE privileges — only edge functions using the service role can write.
- Pro access is decided by the SQL function `active_plan()`, never a boolean column. The Scholarship Matcher (`scholarship_matches()`), counsellor contact (`counselor_contact()`) and Essay Reviewer (in `gemini-chat`) all check it server-side. Pro insider guides are only returned by `opportunity_pro_insights()`, which checks `active_plan()`; the guide text never reaches a free user's browser.
- University fees and the admin's form fields are snapshotted onto each application when payment starts, so admin edits only affect new applications.
- Documents live in the private `application-documents` bucket under `<student-id>/<application-id>/`. Students can only upload into their own folder, and only while the application is **Paid** (not yet submitted). Admins read them through 10-minute signed links.
- Mentors can't write `rate_cents`; they write `proposed_rate_cents`, which a trigger flags for review. Students only ever see (and pay) the approved rate.
- A double-booked mentor slot is refused and flagged `slot_taken_refund_required`; the admin overview shows a refund alert and revenue excludes it.

---

## 5. Build phases → where they live

| Phase | What | Key files |
|---|---|---|
| 1–2 | Foundation, design system, auth, onboarding, profile | `src/styles/*`, `src/components/*`, `src/features/auth`, `supabase/migrations/0001–0005` |
| 3–5 | Feed + match %, opportunity detail, saves, Career Compass, YouTube, courses + AI tutor | `src/routes/Home`, `OpportunityDetail`, `CareerCompass`, `Courses`, `CourseDetail`, `functions/gemini-chat`, `functions/youtube-search`, `0006–0007` |
| 6–8 | Paystack, plans, paywall/checkout, mentors, concierge, renewal cron | `functions/paystack-*`, `functions/subscription-cron`, `src/features/billing`, `src/routes/Mentor*`, `Applications`, `0008` |
| 9 | Admin console + revenue | `functions/admin-api`, `src/routes/admin/*`, `0009` |
| 10 | Polish: code-splitting, audits | `src/App.tsx` (React.lazy), this README |
| v2 | Pro-only GHS 60 (card auto-renew + MoMo month), 3 free AI messages + paywall modal, Essay Reviewer, mentor rate approval + 75/25 split, admin slide-over with application form builder, Paid → Complete Your Application with uploads, WhatsApp fallback, gradient-orb background, new emblem icon | `0010`, `functions/paystack-subscription`, `functions/application-submit`, `src/features/billing/PaywallModal`, `src/routes/UniversityDetail`, `CompleteApplication`, `EssayReview`, `src/routes/admin/*`, `src/components/Backdrop` |

---

## 6. Known TODOs

- **Google, phone and live Paystack/Groq/YouTube/Resend calls were not exercised end to end in development** (no keys in the build environment). Their code paths, config errors and webhook handling were tested; run one real test-mode payment and one AI chat after adding keys.
- Uploads accept PDF, JPG, PNG, WEBP and HEIC up to 10 MB each.
- Applications started under v1 that were already paid keep their v1 status; only new payments use the form flow.
- Phone-only accounts have no email, so Paystack receipts use a placeholder address (`<user-id>@users.afriversity.app`).
- Opportunity deadlines were verified on 26 Oct 2026. Rounds change every year — keep them current in Admin → Opportunities.
- Mentor sessions don't generate a video-call link; the mentor sends one to the student.
- Refunds (rare double-bookings) are done manually in the Paystack dashboard.

---

## 7. Scripts

```bash
npm run dev        # dev server
npm run build      # type-check + production build (route-level code splitting)
npm run preview    # serve the production build
```
