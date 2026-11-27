import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Briefcase, Download, FilePlus, GraduationCap, Lock, Pencil, Plus, Sparkles, UserRound, WandSparkles, X } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Button } from '../../components/Button/Button';
import { Field, SelectField, TextAreaField } from '../../components/Field/Field';
import { Notice } from '../../components/Notice/Notice';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { useAuth } from '../../features/auth/useAuth';
import { usePlan } from '../../features/billing/PlanProvider';
import { usePaywall } from '../../features/billing/PaywallModal';
import { startCheckout } from '../../features/billing/paystack';
import { fetchOneTimeProducts, PRODUCT_FALLBACK } from '../../features/billing/api';
import { cvErrorMessage, emptyDetails, fetchCv, fetchLatestCv, generateCv, isCvUnlocked, saveCvMarkdown, splitSkills, type CvDetails, type CvRow, type ExperienceKind } from '../../features/cv/api';
import { Markdown } from '../../features/cv/Markdown';
import { formatMoney } from '../../lib/money';
import { errorMessage } from '../../lib/supabase';
import { riseItem, staggerParent } from '../../lib/motion';
import './CvBuilder.css';

const KIND_OPTIONS = ['Job', 'Internship', 'Volunteer work'] as const;
const KIND_OF: Record<(typeof KIND_OPTIONS)[number], ExperienceKind> = { Job: 'job', Internship: 'internship', 'Volunteer work': 'volunteer' };
const LABEL_OF: Record<ExperienceKind, (typeof KIND_OPTIONS)[number]> = { job: 'Job', internship: 'Internship', volunteer: 'Volunteer work' };
const ROLE_IDEAS = ['Scholarship Applicant', 'Data Analyst', 'Software Developer', 'Nurse', 'Marketing Assistant', 'Internship Applicant'];

type View = 'loading' | 'form' | 'result';


/**
 * /cv-builder — AI CV Builder. Everyone can fill in their details and generate a CV;
 * downloading the PDF needs Pro or a one-time unlock for that CV (GH₵ 10).
 */
export default function CvBuilder() {
  const { profile, session } = useAuth();
  const { isPro } = usePlan();
  const { openPaywall } = usePaywall();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>('loading');
  const [cv, setCv] = useState<CvRow | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [targetRole, setTargetRole] = useState('');
  const [details, setDetails] = useState<CvDetails>(emptyDetails);
  const [hardSkills, setHardSkills] = useState('');
  const [softSkills, setSoftSkills] = useState('');
  const [busy, setBusy] = useState<'generate' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [price, setPrice] = useState(PRODUCT_FALLBACK.cv_download.amount_cents);

  // Load the CV from ?cv= (back from Paystack) or the most recent one; otherwise a fresh form.
  useEffect(() => {
    let active = true;
    const wanted = params.get('cv');
    (wanted ? fetchCv(wanted) : fetchLatestCv())
      .then(async (row) => {
        if (!active) return;
        if (row) {
          loadRow(row);
          setUnlocked(await isCvUnlocked(row.id).catch(() => false));
          setView('result');
        } else {
          setView('form');
        }
      })
      .catch((e) => {
        if (!active) return;
        setError(errorMessage(e));
        setView('form');
      });
    void fetchOneTimeProducts().then((p) => active && setPrice(p.cv_download.amount_cents)).catch(() => undefined);
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A fresh form starts from the profile.
  useEffect(() => {
    if (view !== 'form' || cv) return;
    setDetails((d) =>
      d.personal.name || d.personal.email
        ? d
        : { ...d, personal: { ...d.personal, name: profile?.full_name ?? '', email: session?.user.email ?? '', phone: profile?.phone ?? '', location: profile?.country ?? '' } },
    );
  }, [view, cv, profile, session]);

  // Pro (or a payment) may arrive after the first check.
  useEffect(() => {
    if (isPro) setUnlocked(true);
  }, [isPro]);

  function loadRow(row: CvRow) {
    const d = { ...emptyDetails(), ...row.details };
    setCv(row);
    setTargetRole(row.target_role);
    setDetails({
      personal: { ...emptyDetails().personal, ...d.personal },
      education: d.education?.length ? d.education : emptyDetails().education,
      experience: d.experience?.length ? d.experience.map((e) => ({ ...emptyDetails().experience[0], ...e })) : emptyDetails().experience,
      skills: d.skills ?? { hard: [], soft: [] },
    });
    setHardSkills((d.skills?.hard ?? []).join(', '));
    setSoftSkills((d.skills?.soft ?? []).join(', '));
    setDraft(row.markdown);
  }

  const setPersonal = (k: keyof CvDetails['personal'], v: string) => setDetails((d) => ({ ...d, personal: { ...d.personal, [k]: v } }));
  const setEdu = (i: number, k: keyof CvDetails['education'][number], v: string) =>
    setDetails((d) => ({ ...d, education: d.education.map((e, j) => (j === i ? { ...e, [k]: v } : e)) }));
  const setExp = (i: number, k: keyof CvDetails['experience'][number], v: string) =>
    setDetails((d) => ({ ...d, experience: d.experience.map((e, j) => (j === i ? { ...e, [k]: v } : e)) }));

  const generate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const payload: CvDetails = { ...details, skills: { hard: splitSkills(hardSkills), soft: splitSkills(softSkills) } };
    if (targetRole.trim().length < 2) return setError('Add the role you are targeting, e.g. “Data Analyst” or “Scholarship Applicant”.');
    if (payload.personal.name.trim().length < 2) return setError('Add your full name.');
    if (!/^\S+@\S+\.\S+$/.test(payload.personal.email.trim())) return setError('Add an email address employers can reach you on.');
    if (!payload.education.some((x) => x.school.trim())) return setError('Add at least one school.');
    setBusy('generate');
    try {
      const out = await generateCv(targetRole.trim(), payload, cv?.id);
      loadRow(out.cv);
      setUnlocked(out.unlocked);
      setView('result');
      setEditing(false);
      setNotice(out.remaining_today > 0 ? `Your CV is ready. You can generate ${out.remaining_today} more today.` : 'Your CV is ready. That was your last generation for today; you can still edit the text.');
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(cvErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!cv) return;
    setBusy('save');
    setError(null);
    try {
      await saveCvMarkdown(cv.id, draft);
      setCv({ ...cv, markdown: draft });
      setEditing(false);
      setNotice('Changes saved.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const download = () => {
    if (!cv) return;
    if (unlocked) {
      window.print(); // the print stylesheet prints only the CV, on white A4
      return;
    }
    const cvId = cv.id;
    openPaywall('Your CV is ready. Download it as a clean, ATS-friendly PDF.', {
      offer: {
        title: `Unlock your professional CV for ${formatMoney(price, 'GHS')}`,
        detail: 'One-time payment. Download this CV as a PDF, as often as you like, including after edits.',
        priceCents: price,
        cta: `Unlock for ${formatMoney(price, 'GHS')}`,
        buy: () => startCheckout({ type: 'purchase', product: 'cv_download', cv_id: cvId }, { expectedCents: price }),
      },
    });
  };

  const startNew = () => {
    setCv(null);
    setUnlocked(isPro);
    setTargetRole('');
    setDetails(emptyDetails());
    setHardSkills('');
    setSoftSkills('');
    setNotice(null);
    setError(null);
    setParams({}, { replace: true });
    setView('form');
  };

  return (
    <PageTransition label="AI CV Builder">
      <div className="container cvb" data-wide>
        <PageHeader
          back={{ to: '/profile', label: 'You' }}
          eyebrow="Career tools"
          title="AI CV Builder"
          lede="Add your details and the role you want. Get a clean, ATS-friendly CV for scholarships and jobs in seconds."
        />
        {error && <Notice tone="error">{error}</Notice>}
        {notice && !error && <Notice tone="success">{notice}</Notice>}

        {view === 'loading' && (
          <div className="cvb__loading">
            <Skeleton shape="block" height="420px" label="Loading your CV" />
          </div>
        )}

        {view === 'form' && (
          <motion.form className="cvb__form" onSubmit={generate} noValidate variants={staggerParent} initial="hidden" animate="show">
            <motion.section className="cvb__card cvb__card--target" variants={riseItem} aria-labelledby="cvb-target">
              <h2 id="cvb-target" className="cvb__h2">
                <WandSparkles aria-hidden="true" /> Target role
              </h2>
              <Field label="What role is this CV for?" placeholder="e.g. Data Analyst, Scholarship Applicant" maxLength={80} value={targetRole} onChange={(e) => setTargetRole(e.target.value)} required />
              <div className="cvb__ideas" aria-label="Ideas">
                {ROLE_IDEAS.map((r) => (
                  <button key={r} type="button" className="cvb__idea" data-on={targetRole === r || undefined} onClick={() => setTargetRole(r)}>
                    {r}
                  </button>
                ))}
              </div>
            </motion.section>

            <motion.section className="cvb__card" variants={riseItem} aria-labelledby="cvb-personal">
              <h2 id="cvb-personal" className="cvb__h2">
                <UserRound aria-hidden="true" /> Personal info
              </h2>
              <div className="cvb__grid">
                <Field label="Full name" autoComplete="name" maxLength={120} value={details.personal.name} onChange={(e) => setPersonal('name', e.target.value)} required />
                <Field label="Email" type="email" autoComplete="email" maxLength={200} value={details.personal.email} onChange={(e) => setPersonal('email', e.target.value)} required />
                <Field label="Phone" type="tel" autoComplete="tel" maxLength={40} value={details.personal.phone} onChange={(e) => setPersonal('phone', e.target.value)} />
                <Field label="Location (optional)" placeholder="e.g. Accra, Ghana" maxLength={80} value={details.personal.location} onChange={(e) => setPersonal('location', e.target.value)} />
                <Field label="LinkedIn (optional)" type="url" placeholder="linkedin.com/in/your-name" maxLength={200} value={details.personal.linkedin} onChange={(e) => setPersonal('linkedin', e.target.value)} />
              </div>
            </motion.section>

            <motion.section className="cvb__card" variants={riseItem} aria-labelledby="cvb-edu">
              <h2 id="cvb-edu" className="cvb__h2">
                <GraduationCap aria-hidden="true" /> Education
              </h2>
              {details.education.map((ed, i) => (
                <div key={i} className="cvb__row">
                  <div className="cvb__grid">
                    <Field label="School" placeholder="e.g. KNUST, Achimota School" maxLength={150} value={ed.school} onChange={(e) => setEdu(i, 'school', e.target.value)} />
                    <Field label="Degree or subjects" placeholder="e.g. BSc Statistics, WASSCE Science" maxLength={150} value={ed.qualification} onChange={(e) => setEdu(i, 'qualification', e.target.value)} />
                    <Field label="Year" placeholder="e.g. 2025 or 2022–2026" maxLength={20} value={ed.year} onChange={(e) => setEdu(i, 'year', e.target.value)} />
                  </div>
                  {details.education.length > 1 && (
                    <button type="button" className="cvb__remove" aria-label={`Remove school ${i + 1}`} onClick={() => setDetails((d) => ({ ...d, education: d.education.filter((_, j) => j !== i) }))}>
                      <X aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
              {details.education.length < 6 && (
                <Button variant="quiet" icon={<Plus aria-hidden="true" />} onClick={() => setDetails((d) => ({ ...d, education: [...d.education, { school: '', qualification: '', year: '' }] }))}>
                  Add a school
                </Button>
              )}
            </motion.section>

            <motion.section className="cvb__card" variants={riseItem} aria-labelledby="cvb-exp">
              <h2 id="cvb-exp" className="cvb__h2">
                <Briefcase aria-hidden="true" /> Experience
              </h2>
              <p className="cvb__hint">Jobs, internships and volunteer work. Add what you did and any results, like “served 40 customers a day”.</p>
              {details.experience.map((ex, i) => (
                <div key={i} className="cvb__row">
                  <div className="cvb__grid">
                    <SelectField label="Type" options={KIND_OPTIONS} value={LABEL_OF[ex.kind]} onChange={(e) => setExp(i, 'kind', KIND_OF[e.target.value as (typeof KIND_OPTIONS)[number]])} />
                    <Field label="Role" placeholder="e.g. Sales assistant" maxLength={120} value={ex.title} onChange={(e) => setExp(i, 'title', e.target.value)} />
                    <Field label="Organisation" placeholder="e.g. MTN Ghana" maxLength={150} value={ex.organisation} onChange={(e) => setExp(i, 'organisation', e.target.value)} />
                    <Field label="When" placeholder="e.g. Jun–Aug 2024" maxLength={40} value={ex.period} onChange={(e) => setExp(i, 'period', e.target.value)} />
                  </div>
                  <TextAreaField label="What you did" rows={3} maxLength={800} value={ex.details} onChange={(e) => setExp(i, 'details', e.target.value)} />
                  {details.experience.length > 1 && (
                    <button type="button" className="cvb__remove" aria-label={`Remove experience ${i + 1}`} onClick={() => setDetails((d) => ({ ...d, experience: d.experience.filter((_, j) => j !== i) }))}>
                      <X aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
              {details.experience.length < 8 && (
                <Button
                  variant="quiet"
                  icon={<Plus aria-hidden="true" />}
                  onClick={() => setDetails((d) => ({ ...d, experience: [...d.experience, { kind: 'job', title: '', organisation: '', period: '', details: '' }] }))}
                >
                  Add experience
                </Button>
              )}
            </motion.section>

            <motion.section className="cvb__card" variants={riseItem} aria-labelledby="cvb-skills">
              <h2 id="cvb-skills" className="cvb__h2">
                <Sparkles aria-hidden="true" /> Skills
              </h2>
              <div className="cvb__grid">
                <Field label="Hard skills" placeholder="e.g. Excel, SQL, Python" hint="Separate with commas." maxLength={800} value={hardSkills} onChange={(e) => setHardSkills(e.target.value)} />
                <Field label="Soft skills" placeholder="e.g. Teamwork, Public speaking" hint="Separate with commas." maxLength={800} value={softSkills} onChange={(e) => setSoftSkills(e.target.value)} />
              </div>
            </motion.section>

            <motion.div className="cvb__submit" variants={riseItem}>
              <Button type="submit" size="lg" block loading={busy === 'generate'} icon={<WandSparkles aria-hidden="true" />}>
                {busy === 'generate' ? 'Writing your CV…' : cv ? 'Generate again' : 'Generate CV'}
              </Button>
              {cv && (
                <Button variant="quiet" block onClick={() => setView('result')}>
                  Back to my CV
                </Button>
              )}
              <p className="cvb__fine">The AI only uses what you enter here. Check every detail before you send it.</p>
            </motion.div>
          </motion.form>
        )}

        {view === 'result' && cv && (
          <motion.div className="cvb__result" variants={staggerParent} initial="hidden" animate="show">
            <motion.div className="cvb__toolbar" variants={riseItem}>
              <Button size="lg" variant={unlocked ? 'primary' : 'gold'} icon={unlocked ? <Download aria-hidden="true" /> : <Lock aria-hidden="true" />} onClick={download}>
                {unlocked ? 'Download as PDF' : `Download as PDF · ${formatMoney(price, 'GHS')}`}
              </Button>
              {editing ? (
                <>
                  <Button variant="secondary" loading={busy === 'save'} onClick={save}>
                    Save changes
                  </Button>
                  <Button
                    variant="quiet"
                    onClick={() => {
                      setDraft(cv.markdown);
                      setEditing(false);
                    }}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button variant="secondary" icon={<Pencil aria-hidden="true" />} onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )}
              <Button variant="quiet" onClick={() => setView('form')}>
                Change details
              </Button>
              <Button variant="quiet" icon={<FilePlus aria-hidden="true" />} onClick={startNew}>
                New CV
              </Button>
            </motion.div>
            {!unlocked && (
              <motion.p className="cvb__locked-note" variants={riseItem}>
                <Lock aria-hidden="true" /> Preview only. Unlock this CV for {formatMoney(price, 'GHS')} once, or get it with Pro, to download the PDF.
              </motion.p>
            )}

            {editing ? (
              <motion.div variants={riseItem}>
                <TextAreaField
                  label="Edit your CV"
                  hint="Markdown: # your name, ## section, ### role, - bullet, **bold**. The preview updates below."
                  rows={18}
                  maxLength={20000}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <article className="cv-doc cv-doc--live" aria-label="Preview">
                  <Markdown text={draft} />
                </article>
              </motion.div>
            ) : (
              <motion.article className="cv-doc" variants={riseItem} aria-label={`CV for ${cv.target_role}`}>
                <p className="cv-doc__role">Targeting: {cv.target_role}</p>
                <Markdown text={cv.markdown} />
              </motion.article>
            )}
          </motion.div>
        )}
      </div>

      {/* What window.print() prints: only this, on white A4. Locked CVs print a notice instead. */}
      {view === 'result' &&
        cv &&
        createPortal(
          <div className="cv-print-root" aria-hidden="true">
            {unlocked ? (
              <Markdown className="cv-print" text={editing ? draft : cv.markdown} />
            ) : (
              <p className="cv-print-locked">Unlock this CV in Afriversity to download it as a PDF.</p>
            )}
          </div>,
          document.body,
        )}
    </PageTransition>
  );
}
