-- Afriversity seed data. Runs automatically on `supabase db reset`.
-- Opportunity cycle data verified 26 Oct 2026 — re-check before launch and
-- whenever a new cycle opens (admin console edits these in Session 4).
-- Vocabulary used in `fields` / `levels` matches the onboarding options in
-- src/features/onboarding/options.ts. An empty `fields` array = all fields.

-- ── Universities (fees in smallest currency unit: pesewas / kobo) ───────
-- One application fee per university, in GHS (pesewas). Naira fees were
-- converted on 29 Oct 2026 at 1 NGN = 0.008639 GHS and rounded to the cedi.
-- form_fields = what the student must provide after paying (admin-editable).
insert into public.universities (slug, name, short_name, country, city, currency, app_fee_cents, service_fee_cents, fee_notes, website, description, form_fields) values
  ('university-of-ghana', 'University of Ghana', 'UG', 'Ghana', 'Legon, Accra', 'GHS', 25000, 0,
   'Covers the university''s application voucher and Afriversity''s concierge service.', 'https://www.ug.edu.gh',
   'Ghana''s oldest and largest public university, founded in 1948 on the Legon hills in Accra. Offers undergraduate programmes across the humanities, sciences, business, law, health and engineering.',
   '{"high_school": true, "waec_results": true, "guardian_name": true, "guardian_email": true, "guardian_occupation": false, "custom_documents": [{"key": "doc_passport_photo", "label": "Passport photograph"}]}'),
  ('knust', 'Kwame Nkrumah University of Science and Technology', 'KNUST', 'Ghana', 'Kumasi', 'GHS', 27000, 0,
   'Covers the university''s application voucher and Afriversity''s concierge service.', 'https://www.knust.edu.gh',
   'Public university in Kumasi, founded in 1952, best known for engineering, science, architecture, pharmacy and agriculture.',
   '{"high_school": true, "waec_results": true, "guardian_name": true, "guardian_email": false, "guardian_occupation": true, "custom_documents": [{"key": "doc_passport_photo", "label": "Passport photograph"}]}'),
  ('university-of-lagos', 'University of Lagos', 'UNILAG', 'Nigeria', 'Akoka, Lagos', 'GHS', 10800, 0,
   'Covers the application form fee and Afriversity''s concierge service, charged in cedis.', 'https://unilag.edu.ng',
   'Federal university in Lagos, founded in 1962, with large faculties of engineering, law, social sciences, medicine and business.',
   '{"high_school": true, "waec_results": true, "guardian_name": true, "guardian_email": true, "guardian_occupation": true, "custom_documents": [{"key": "doc_birth_certificate", "label": "Birth certificate"}, {"key": "doc_passport_photo", "label": "Passport photograph"}]}'),
  ('covenant-university', 'Covenant University', 'CU', 'Nigeria', 'Ota, Ogun', 'GHS', 10800, 0,
   'Covers the application form fee and Afriversity''s concierge service, charged in cedis.', 'https://covenantuniversity.edu.ng',
   'Private university in Ota, Ogun State, founded in 2002, with programmes in engineering, computing, business and the social sciences.',
   '{"high_school": true, "waec_results": true, "guardian_name": true, "guardian_email": true, "guardian_occupation": true, "custom_documents": [{"key": "doc_passport_photo", "label": "Passport photograph"}]}'),
  ('ashesi-university', 'Ashesi University', 'Ashesi', 'Ghana', 'Berekuso', 'GHS', 20000, 0,
   'Covers the university''s application fee and Afriversity''s concierge service.', 'https://www.ashesi.edu.gh',
   'Private liberal-arts university in Berekuso, founded in 2002, offering computer science, engineering, business administration and economics.',
   '{"high_school": true, "waec_results": true, "guardian_name": true, "guardian_email": true, "guardian_occupation": true, "custom_documents": [{"key": "doc_transcript", "label": "High school transcript"}, {"key": "doc_recommendation", "label": "Recommendation letter"}]}');

-- Ownership (0019): documented for these five; anything added later starts unverified.
update public.universities u
   set ownership = v.ownership, ownership_source = v.source
  from (values
    ('university-of-ghana', 'public', 'Public university founded in 1948 (official site: ug.edu.gh)'),
    ('knust', 'public', 'Public university founded in 1952 (official site: knust.edu.gh)'),
    ('university-of-lagos', 'public', 'Federal (public) university founded in 1962 (official site: unilag.edu.ng)'),
    ('covenant-university', 'private', 'Private university founded in 2002 (official site: covenantuniversity.edu.ng)'),
    ('ashesi-university', 'private', 'Private university founded in 2002 (official site: ashesi.edu.gh)')
  ) as v(slug, ownership, source)
 where u.slug = v.slug;

-- ── Opportunities ────────────────────────────────────────────────────────
insert into public.opportunities
  (slug, title, provider, kind, summary, description, eligibility, benefits, fields, levels, host_country, open_to, funding, status, deadline, opens_on, cycle_note, url, is_pro, featured)
values
(
  'mastercard-foundation-scholars-uct',
  'Mastercard Foundation Scholars Program at UCT',
  'Mastercard Foundation × University of Cape Town',
  'scholarship',
  'Comprehensive scholarship for honours, coursework master''s and postgraduate diploma study at the University of Cape Town.',
  'The Mastercard Foundation Scholars Program at UCT supports academically talented young Africans who face financial and social barriers to higher education. Scholars receive financial support alongside mentoring, leadership development and career preparation, and are expected to give back to their communities.',
  array['Citizen of an African country, including South Africa',
        'Applying for an eligible taught postgraduate programme at UCT',
        'Strong academic record and commitment to excellence',
        'Faces significant financial or social barriers to higher education',
        'Young women, people with disabilities and displaced youth are encouraged to apply'],
  array['Comprehensive financial support (confirm the award value on the official page)',
        'Mentoring and leadership development',
        'Career, entrepreneurship and life-skills support',
        'Community-engagement programme'],
  '{}',
  array['Undergraduate', 'Working professional'],
  'South Africa', 'Citizens of any African country', 'full', 'open',
  '2026-10-31', null,
  'Postgraduate round closes 31 Oct 2026. The undergraduate round for 2027 closed on 30 Sep 2026.',
  'https://uct.ac.za/mastercardfdn/apply-mastercard-foundation-scholars-program',
  false, true
),
(
  'mandela-rhodes-scholarship',
  'Mandela Rhodes Scholarship',
  'The Mandela Rhodes Foundation',
  'scholarship',
  'Fully funded honours or master''s study at a South African university, with a leadership development programme.',
  'The Mandela Rhodes Scholarship brings young Africans with leadership potential to study at South African universities. Alongside full funding, scholars join a programme built around reconciliation, education, entrepreneurship and leadership.',
  array['Citizen of any African country',
        'Aged 19 to 29 in the year of application',
        'Undergraduate degree with at least 70% / upper-second-class results',
        'Applying for honours (1 year) or master''s (2 years) at a recognised South African university',
        'Demonstrated leadership and commitment to service'],
  array['Full tuition and registration fees',
        'Accommodation and meals',
        'Study materials, research and medical aid allowances',
        'Personal allowance and economy travel to South Africa',
        'Leadership development workshops'],
  '{}',
  array['Undergraduate', 'Working professional'],
  'South Africa', 'Citizens of any African country', 'full', 'upcoming',
  null, '2027-03-09',
  'Applications for the 2028 class open on 9 March 2027.',
  'https://www.mandelarhodes.org',
  true, true
),
(
  'chevening-scholarships',
  'Chevening Scholarships',
  'UK Foreign, Commonwealth & Development Office',
  'scholarship',
  'Fully funded one-year master''s degree at any UK university for future leaders with work experience.',
  'Chevening is the UK government''s international scholarship programme. Scholars complete a one-year master''s at a UK university of their choice and join a global alumni network of leaders and influencers.',
  array['Citizen of a Chevening-eligible country (most African countries qualify)',
        'Undergraduate degree that gives entry to a UK master''s',
        'At least 2,800 hours (about two years) of work experience',
        'Apply to three eligible UK master''s courses',
        'Return to your home country for at least two years after the award'],
  array['Full tuition for an eligible one-year master''s',
        'Monthly living allowance',
        'Economy return flight to the UK',
        'Visa fee and arrival / departure allowances'],
  '{}',
  array['Working professional'],
  'United Kingdom', 'Citizens of Chevening-eligible countries', 'full', 'upcoming',
  null, null,
  'The 2027/28 round ran from 4 Aug to 6 Oct 2026. The next round usually opens in early August.',
  'https://www.chevening.org/scholarships/',
  true, false
),
(
  'daad-epos',
  'DAAD EPOS Development-Related Postgraduate Courses',
  'DAAD (German Academic Exchange Service)',
  'scholarship',
  'Scholarships for professionals from developing countries to take a development-focused master''s or PhD in Germany.',
  'EPOS funds professionals from developing countries to complete selected development-related postgraduate courses at German universities, in areas such as economics, engineering, public health, agriculture, environment and governance.',
  array['Citizen of a developing (DAC-list) country',
        'At least two years of relevant professional experience after your bachelor''s',
        'Degree completed no more than six years ago, in the upper third of your class',
        'Meets the admission requirements of the chosen EPOS course'],
  array['Monthly stipend (from €992 for master''s students)',
        'Health, accident and liability insurance',
        'Travel allowance',
        'Possible rent subsidy and family allowance'],
  array['Engineering', 'Agriculture', 'Medicine & Health', 'Law & Policy', 'Business & Entrepreneurship'],
  array['Working professional'],
  'Germany', 'Citizens of developing countries', 'stipend', 'upcoming',
  null, null,
  'Most 2027/28 course deadlines fell between August and October 2026. Each course sets its own date — check the course list for the next round.',
  'https://www.daad.de/epos',
  false, false
),
(
  'au-kwame-nkrumah-awards',
  'AU Kwame Nkrumah Awards for Scientific Excellence',
  'African Union Commission',
  'award',
  'Continental and regional prizes recognising African scientists, including a dedicated category for women scientists.',
  'The African Union Kwame Nkrumah Awards for Scientific Excellence recognise African scientists for outstanding achievements and discoveries. Awards are given at continental and regional levels, including prizes for young researchers and women scientists.',
  array['African scientist working in science, technology or innovation',
        'Track record of research output and impact',
        'Regional categories include women and young scientists'],
  array['Cash prize for laureates', 'Continental recognition from the African Union'],
  array['Engineering', 'Medicine & Health', 'Agriculture', 'Data & AI'],
  array['PhD', 'Working professional'],
  'Pan-African', 'African scientists', 'prize', 'closed',
  null, null,
  'No new call has been announced. The African Union publishes each edition on au.int.',
  'https://au.int/en/auknsa',
  false, false
),
(
  'alx-africa',
  'ALX Africa Tech Programmes',
  'ALX Africa',
  'program',
  'Career-focused training in software engineering, data science and AI skills — free for eligible young Africans.',
  'ALX runs intensive, career-focused programmes such as Software Engineering, Data Science and AI Career Essentials. Through its Mastercard Foundation partnership, eligible young Africans can train at no cost, with online learning plus in-person hubs in cities including Accra, Lagos, Nairobi and Kigali.',
  array['Young African, typically aged 18 to 34',
        'Comfortable learning in English',
        'Access to a laptop and a stable internet connection',
        'Able to commit 20–40 hours a week depending on programme'],
  array['Free training for eligible learners',
        'Access to ALX city hubs',
        'Career support and employer network'],
  array['Software Engineering', 'Data & AI', 'Business & Entrepreneurship'],
  array['High school', 'Undergraduate', 'Working professional'],
  'Online + city hubs', 'Young Africans', 'free_training', 'rolling',
  null, null,
  'Cohorts open several times a year. Check the ALX site for the current intake.',
  'https://www.alxafrica.com',
  false, true
),
(
  'mest-ai-startup-program',
  'MEST Africa AI Startup Program',
  'Meltwater Entrepreneurial School of Technology',
  'program',
  'Fully funded training and incubation for software developers building AI startups, with a pitch for up to $100,000.',
  'MEST trains software developers to become tech entrepreneurs. The AI Startup Program runs about eleven months — seven months of training followed by incubation — and ends with teams pitching for pre-seed investment of up to $100,000.',
  array['Aged 21 to 35',
        'Software development experience and a basic understanding of AI',
        'Citizen of a West or East African country',
        'Bachelor''s degree, diploma or equivalent experience',
        'Can commit full-time for up to 12 months'],
  array['Fully funded training programme',
        'Four-month startup incubation',
        'Pitch for up to $100,000 pre-seed investment',
        'Entry into the MEST portfolio network'],
  array['Software Engineering', 'Data & AI', 'Business & Entrepreneurship'],
  array['Undergraduate', 'Working professional'],
  'Ghana, Nigeria, Kenya, Senegal', 'West and East African citizens', 'free_training', 'closed',
  null, null,
  'The Class of 2027 closed on 20 July 2026 and starts in January 2027. New intakes have opened around May.',
  'https://meltwater.org',
  true, false
),
(
  'google-phd-fellowship-africa',
  'Google PhD Fellowship (Africa)',
  'Google Research',
  'fellowship',
  'Funding for outstanding PhD students in computer science and related fields, including a dedicated Africa track.',
  'The Google PhD Fellowship supports graduate students doing exceptional work in computer science and related fields. In Africa, incoming or early-stage PhD students are nominated by their university, and fellows receive funding toward their stipend, research and travel along with a Google Research mentor.',
  array['Incoming or early-stage PhD student in computer science or a related field',
        'Nominated by an eligible university in Africa',
        'Enrolled full-time for the whole fellowship',
        'Not already holding a comparable industry fellowship'],
  array['Funding toward stipend, research and travel (Africa track: US$15,000)',
        'Support for up to three years',
        'Google Research mentor'],
  array['Data & AI', 'Software Engineering'],
  array['Master''s', 'PhD'],
  'Your home university', 'Universities in Africa (by nomination)', 'stipend', 'closed',
  null, null,
  'The 2026 round closed on 30 April 2026. Nominations have typically opened in spring.',
  'https://research.google/programs-and-events/phd-fellowship/',
  false, false
);

-- ── Careers ──────────────────────────────────────────────────────────────
insert into public.careers (slug, title, field, summary, day_to_day, core_skills, pathways) values
('software-engineer', 'Software Engineer', 'Software Engineering',
 'Designs, builds and maintains the software behind apps, websites, payments and services people use every day.',
 array['Write and review code', 'Break features into tasks with product teams', 'Fix bugs and improve performance', 'Ship and monitor releases'],
 array['A programming language such as Python, JavaScript or Java', 'Data structures and algorithms', 'Git and collaboration', 'Testing and debugging'],
 array['BSc Computer Science / Computer Engineering', 'Bootcamps such as ALX Software Engineering', 'Open-source contributions and internships']),
('data-engineer', 'Data Engineer', 'Data & AI',
 'Builds the pipelines and storage that turn raw data into something analysts and AI systems can use.',
 array['Design data pipelines', 'Model and clean data', 'Maintain databases and warehouses', 'Work with analysts and ML engineers'],
 array['SQL', 'Python', 'Data modelling', 'Cloud platforms and orchestration tools'],
 array['BSc in Computer Science, Statistics or Engineering', 'Data science or data engineering programmes', 'Analyst roles that grow into engineering']),
('doctor', 'Medical Doctor', 'Medicine & Health',
 'Diagnoses and treats illness, and helps patients and communities stay healthy.',
 array['See and examine patients', 'Order and interpret tests', 'Prescribe treatment', 'Work in teams with nurses and specialists'],
 array['Biology and chemistry foundations', 'Clinical reasoning', 'Communication and empathy', 'Working under pressure'],
 array['Medical degree (MBChB / MBBS)', 'Housemanship / internship', 'Specialist residency']),
('agribusiness-entrepreneur', 'Agribusiness Entrepreneur', 'Agriculture',
 'Builds businesses across the food chain — farming, processing, logistics or agri-tech.',
 array['Plan production and sourcing', 'Manage cash flow and buyers', 'Run operations and staff', 'Raise funding and partnerships'],
 array['Business planning and finance', 'Agricultural value chains', 'Sales and negotiation', 'Basic data and record-keeping'],
 array['BSc Agriculture or Agribusiness', 'Incubators and accelerators', 'Starting small and scaling with partners']),
('policy-analyst', 'Policy Analyst', 'Law & Policy',
 'Researches problems and recommends how governments and organisations should act on them.',
 array['Research and analyse evidence', 'Write briefs and reports', 'Consult stakeholders', 'Evaluate programmes'],
 array['Research methods', 'Clear writing', 'Economics or public-policy foundations', 'Data analysis'],
 array['BA / BSc in Economics, Political Science or related', 'Master''s in Public Policy', 'Think tanks, NGOs and government fellowships']),
('product-designer', 'Product Designer', 'Design & Creative',
 'Shapes how digital products look, feel and work by understanding users and prototyping solutions.',
 array['Interview and observe users', 'Sketch flows and wireframes', 'Prototype and test designs', 'Work with engineers on delivery'],
 array['User research', 'Interaction and visual design', 'Prototyping tools', 'Communicating design decisions'],
 array['Degree in design, computing or psychology', 'Design programmes and portfolios', 'Junior design or UX research roles']),
('civil-engineer', 'Civil Engineer', 'Engineering',
 'Plans, designs and supervises roads, bridges, buildings, water and drainage systems.',
 array['Design structures and systems', 'Review drawings and calculations', 'Supervise construction sites', 'Check safety and standards'],
 array['Mathematics and mechanics', 'Structural and geotechnical analysis', 'CAD tools', 'Project management'],
 array['BSc Civil Engineering', 'Graduate engineer roles', 'Professional engineer registration']),
('lawyer', 'Lawyer', 'Law & Policy',
 'Advises clients, drafts agreements and represents people and organisations in legal matters.',
 array['Research the law', 'Draft contracts and opinions', 'Advise clients', 'Represent clients in negotiations or court'],
 array['Legal research and reasoning', 'Writing and argument', 'Negotiation', 'Attention to detail'],
 array['LLB degree', 'Professional law school / bar course', 'Pupillage or chambers placement']);

-- ── Courses (tracks) ─────────────────────────────────────────────────────
insert into public.courses (slug, title, field, summary, level) values
('data-engineering-foundations', 'Data Engineering Foundations', 'Data & AI',
 'How data moves from source to warehouse: what data engineers do, SQL, and the core skills of the job.', 'Beginner'),
('software-engineering-foundations', 'Software Engineering Foundations', 'Software Engineering',
 'Computer science fundamentals, your first language (Python) and version control with Git.', 'Beginner'),
('medicine-pathway', 'Your Path into Medicine', 'Medicine & Health',
 'The human-body foundations every future doctor starts with: how the body is organised, the nervous system and immunity.', 'Beginner'),
('business-foundations', 'Business & Startup Foundations', 'Business & Entrepreneurship',
 'Finding and testing a startup idea, talking to customers, and building a first product.', 'Beginner');


-- ── Course lessons (YouTube IDs verified against the publishers' own pages) ──
insert into public.course_lessons (course_id, position, title, youtube_id, channel, summary)
select c.id, l.position, l.title, l.youtube_id, l.channel, l.summary
from (values
  ('data-engineering-foundations', 1, 'How data engineering works', 'qWru-b6m030', 'AltexSoft',
   'A short tour of the data engineer''s job: sources, pipelines, warehouses and who uses the data.'),
  ('data-engineering-foundations', 2, 'SQL for data storage and retrieval', '-fW2X7fh7Yg', 'freeCodeCamp.org',
   'A full SQL course: creating tables, querying, joining and aggregating data.'),
  ('data-engineering-foundations', 3, 'The essentials of data engineering', 'PHsC_t0j1dU', 'freeCodeCamp.org',
   'Databases, Docker, SQL, data pipelines and orchestration — the core toolkit, end to end.'),
  ('software-engineering-foundations', 1, 'Introduction to computer science (Harvard CS50)', 'F0WoVEr0-44', 'freeCodeCamp.org',
   'How computers represent information and how to think algorithmically.'),
  ('software-engineering-foundations', 2, 'Python programming for beginners', 'eWRfhZUzrAc', 'freeCodeCamp.org',
   'Variables, control flow, functions and data structures in Python.'),
  ('software-engineering-foundations', 3, 'Git and GitHub crash course', 'RGOj5yH7evk', 'freeCodeCamp.org',
   'Tracking changes with Git, branching, and collaborating through GitHub.'),
  ('medicine-pathway', 1, 'Introduction to anatomy and physiology', 'uBGl2BujkPQ', 'CrashCourse',
   'How the body is organised, from cells to organ systems, and why structure explains function.'),
  ('medicine-pathway', 2, 'The nervous system, part 1', 'qPix_X-9t7E', 'CrashCourse',
   'How the nervous system is organised and how neurons carry signals.'),
  ('medicine-pathway', 3, 'The immune system, part 1', 'GIJK3dwCWCw', 'CrashCourse',
   'Innate defences: barriers, inflammation and the cells that respond first.'),
  ('business-foundations', 1, 'How to get and test startup ideas', 'vDXkpJw16os', 'Y Combinator',
   'Michael Seibel on where good ideas come from and how to test them quickly.'),
  ('business-foundations', 2, 'How to talk to users', 'MT4Ig2uqjTc', 'Y Combinator',
   'Eric Migicovsky on running customer conversations that tell you the truth.'),
  ('business-foundations', 3, 'How to build product as a small startup', 'kzVvjKLdAbk', 'Y Combinator',
   'Michael Seibel on shipping a first version, talking to users and iterating.')
) as l(course_slug, position, title, youtube_id, channel, summary)
join public.courses c on c.slug = l.course_slug;

-- ── Plan (single Pro tier; paystack-init reads the price from here) ──────
insert into public.plans (code, name, tagline, amount_cents, currency, period_days, ai_daily_limit, features) values
  ('pro', 'Pro', 'A real counsellor in your corner', 4000, 'GHS', 30, null,
   array['Direct WhatsApp access to a Human Counselor', 'CV & Essay Strategy Sessions', 'Priority Support',
         'Scholarship Matcher — ranked by how well you fit', 'Application Tracker with full timeline', 'Insider application guides'])
-- Migration 0013 already creates the Pro row, so update it rather than failing on the duplicate.
on conflict (code) do update
  set name = excluded.name, tagline = excluded.tagline, amount_cents = excluded.amount_cents, currency = excluded.currency,
      period_days = excluded.period_days, ai_daily_limit = excluded.ai_daily_limit, features = excluded.features;

-- free_ai_daily_limit (50 since 0016; the same for every plan) and the WhatsApp settings come from migrations.

-- ── Pro insider guides (drawn from each programme's published rules) ────
update public.opportunities set pro_insights = array[
  'Your application centres on four essays — leadership and influence, networking, studying in the UK, and your career plan. Draft all four before the portal opens.',
  'Apply to three different eligible UK master''s courses. You must hold an unconditional offer from one of them by the offer deadline, usually in July.',
  'Count your 2,800 hours carefully: full-time, part-time, voluntary and internship work all count, across up to 15 roles.',
  'Shortlisted candidates are interviewed at the British Embassy or High Commission in their country, so prepare to defend every essay in person.',
  'You need two references — brief your referees early and share your essays with them.'
] where slug = 'chevening-scholarships';

update public.opportunities set pro_insights = array[
  'Frame your story around the Foundation''s principles — reconciliation, education, entrepreneurship and leadership — with one concrete example for each.',
  'Start your South African university application in parallel; the scholarship funds an honours or master''s place you still have to win.',
  'The academic bar is an upper-second (70%) average or better — request official transcripts as soon as the window opens on 9 March 2027.',
  'Age is checked strictly: you must be 19 to 29 in the year you apply.'
] where slug = 'mandela-rhodes-scholarship';

update public.opportunities set pro_insights = array[
  'Show shipped code. A GitHub profile or a deployed project is the strongest proof of the software-development requirement.',
  'Shortlisted applicants attend an in-person interview and group challenge in Ghana, Nigeria, Senegal or Kenya; applicants from other countries pay their own travel.',
  'Plan for a full-time commitment of up to 12 months starting in January.',
  'Applications are reviewed on a rolling basis — applying early gets you a faster decision.'
] where slug = 'mest-ai-startup-program';
