# Afriversity: fixes so far and how to ship them

Last updated: 27 November 2026.

Most errors reported from the live site come from one thing: **the code is committed but the
Supabase side was not deployed**. Pushing to GitHub/Vercel updates the website only. Database
migrations and Edge Functions must be deployed separately (section 2).

| Live error | Cause | Fix |
|---|---|---|
| VIP review payment: `type: must be one of: subscription, application, mentor` | Old `paystack-init` is live (it predates one-time purchases) | Deploy `paystack-init` |
| CV Builder: "We couldn't reach Afriversity's servers" | `cv-builder` not deployed (or migration 0024 missing) | Run migrations, deploy `cv-builder` |
| Promo showed GH₵ 3.50, Paystack charged GH₵ 35 | Old `paystack-init` ignored promo codes | Deploy `paystack-init`; refund the student GH₵ 31.50 |
| "The AI counsellor isn't available right now" | Old `gemini-chat`; Groq shut down `llama-3.3-70b-versatile` on 16 Aug 2026 for non-Enterprise keys | Deploy `gemini-chat` (falls back to `openai/gpt-oss-120b`) |

## 1. What was fixed

### Payments and pricing
- **Promo codes:** `promo_codes` table, WAITLIST20 at 20% off, an admin Promo Codes tab, and Pro at GH₵ 35.
- **Promo overcharge hardening:**
  - The app sends the exact price shown, in whole pesewas (GH₵ 3.50 = 350). `paystack-init` refuses any checkout whose price differs, and rejects decimals.
  - The server returns the amount it will charge, and the app won't open Paystack unless it matches the screen.
  - The server checks each card plan's real amount at Paystack and replaces any that don't match.
- **Pay-as-you-go:** CV download GH₵ 10 and VIP Essay Review GH₵ 15, as one-time payments by MoMo or card. Paystack metadata carries `product`: `cv_download`, `essay_review` or `pro_subscription`. Pro students are never charged for what Pro includes.
- **Free human review:** every free student can claim one free review on WhatsApp, recorded server-side.
- **University Concierge:**
  - The service fee is GH₵ 20 for all universities (migration 0024).
  - The "Applying to university is stressful…" banner appears on the universities page.
  - Each card has a "Pay GH₵ 20 Service Fee" button that shows the university's form fee and the total.
- **Paywall:**
  - Full-screen modal on phones.
  - Social proof from the real student count ("Join 200+ students…").
  - The "Stop paying GH₵ 15 per review…" value stack.
  - A pay-as-you-go list on `/paywall`.
- **Admin:** the revenue table has a pay-as-you-go column.

### AI
- **Model:** asks `llama-3.3-70b-versatile` first and switches to `openai/gpt-oss-120b` when Groq refuses it.
- **Fallback:** only on real errors. Chat waits up to 25 s on the server and 30 s in the app, and the fallback reply comes with a Retry button.
- **AI CV Builder (`/cv-builder`):**
  - A form, then an AI-written, ATS-friendly CV in Markdown.
  - On-screen editing and a clean A4 PDF via print.
  - Free users unlock the PDF for GH₵ 10; Pro gets it included.
  - Limits: 3 generations a day free, 10 on Pro.
- **CV Builder reliability:**
  - Logs `Starting CV generation for: …` and `Groq Error: …` in the function logs.
  - Always answers with JSON `{ error, message }`. A slow AI gets "Generation took too long. Please try again."
  - The AI has 22 s; the app waits 30 s.
  - The app shows the server's exact message, or the raw network error when nothing answered.

### Sign-in and accounts
- **Email codes:** sign-in and sign-up use emailed codes, not links, so they work on any device.
  - Sign-up calls `signInWithOtp({ shouldCreateUser: true })`, then `verifyOtp({ type: 'email' })`, and saves the password after the code is verified.
  - Codes are **8 digits**, entered in a numbers-only box.
- **Phone sign-in removed.** The phone number is still collected in onboarding.
- **Mentor applications** use the same code flow. An existing student email can't apply as a mentor by mistake.

### Home, Discover and matching
- **Home:** a greeting, a 3–5 card Top Matches carousel and "Explore All Opportunities".
- **`/discover`:** the full list with filters. `/opportunities` redirects there.
- **Matching:**
  - Case-insensitive, by field, title and goals.
  - Untagged opportunities score 50% and still show.
  - A complete profile is never told to update itself.
- **Cards:** category colours, cover images (the admin form auto-fetches `og:image` from the link), and Top Match cards with a large top-left icon and an emerald→gold glow.

### Look and feel
- **Layout:** proper desktop layout with a sidebar; one emerald brand colour (gold only for Pro).
- **Background:** one continuous surface, no seam, with an adinkra-inspired texture at 8%.
- **Chat:** AI bubbles are emerald glass with an emerald border.
- **Mobile:** Explore All and every last item clear the bottom nav bar, and the Ambassador form no longer fights scrolling.

### Credibility and SEO
- **Team:** a `/team` page with the six team members, Person JSON-LD (name, jobTitle, worksFor Afriversity) and a site footer link.
- **Sitemap:** `public/sitemap.xml` lists the nine public routes with `lastmod`.

## 2. Deploy checklist, in this order

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>

# 1. Database: migrations 0022 (promo codes), 0023 (opportunity media), 0024 (pay-as-you-go, CVs)
npx supabase db push

# 2. Every Edge Function (safe to repeat; deploys all of supabase/functions)
npx supabase functions deploy

# 3. Secrets (skip any that are already set)
npx supabase secrets set GROQ_API_KEY=... PAYSTACK_SECRET_KEY=sk_live_... SITE_URL=https://www.afriversity.com
```

Then:

4. **Counsellor WhatsApp:** in the SQL editor:
   `update app_settings set value = '"+233XXXXXXXXX"' where key = 'counselor_whatsapp';`
   Until it's set, the free-review button says "being set up" and doesn't use up the free review.
5. **Auth emails (8-digit codes):**
   - Check that Authentication → Providers → Email → Email OTP Length is **8**.
   - Then run `SUPABASE_ACCESS_TOKEN=... PROJECT_REF=... node scripts/push-email-templates.mjs`, which uploads the Confirm signup, Magic Link and Reset Password templates and sets the length to 8.
6. **Phone sign-in:** turn off the Phone provider in Authentication → Providers.
7. **Frontend:** push to `main` (Vercel). Doing this before steps 1–2 doesn't break existing features, but the new pages show errors until the backend is deployed.
8. **Refund** the student overcharged by the promo bug (GH₵ 31.50) in the Paystack dashboard.
9. **Search:** submit `https://www.afriversity.com/sitemap.xml` in Google Search Console.

### Check after deploying
- **Functions:** in the Supabase dashboard under Edge Functions, `cv-builder`, `paystack-init` and `gemini-chat` should show today's deploy date.
- **CV Builder:** generate a CV. The function logs should show `Starting CV generation for: …`.
- **VIP review:** start the GH₵ 15 checkout. Paystack should show GH₵ 15, and the reference should start with `afv_pur_`.
- **Promo:** apply a test code and pay with MoMo. Paystack must show the discounted amount.

## 3. Known limits and decisions
- **Login-only pages in the sitemap:** `/courses`, `/mentors`, `/apply-university`, `/career-compass`, `/cv-builder`, `/opportunities` and `/paywall` require login. Google is sent to the login page, so they'll index as the login screen. Only `/` and `/team` have public content. Public landing pages for those features would index better.
- **Free review:** it's recorded as used when the student taps the button; the app can't see whether they sent the message.
- **VIP reviews:** they aren't marked "used" yet. Counsellors match payments by the `afv_pur_…` reference.
- **CV lock:** only the PDF is locked; the CV text is readable on screen.
- **Concierge:** checkout charges the university's own form fee on top of the GH₵ 20 service fee, and the button shows both.
- **Priority Concierge:** the Pro copy promises it, but there's no priority queue in the app. The team must honour it by hand.
- **Unused function:** `scholarship_matches` (migration 0010) is no longer used by the app.
