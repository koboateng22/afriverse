import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CircleCheck, MessageCircle } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Button } from '../../components/Button/Button';
import { Chip } from '../../components/Chip/Chip';
import { Field } from '../../components/Field/Field';
import { FileField } from '../../components/FileField/FileField';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Notice } from '../../components/Notice/Notice';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { ACCEPTED_TYPES, fetchApplication, submitApplication, uploadDocument, type ApplicationWithUniversity } from '../../features/applications/api';
import type { FormFields } from '../../features/universities/types';
import { fetchSupportWhatsapp, whatsappLink } from '../../features/billing/api';
import { useAuth } from '../../features/auth/useAuth';
import { FunctionError } from '../../lib/functions';
import { errorMessage } from '../../lib/supabase';
import { riseItem, staggerParent } from '../../lib/motion';
import './CompleteApplication.css';

type Uploaded = { path: string; name: string; size: number; type: string };

/** The next three intakes (September / January) from today. */
function intakes(now = new Date()): string[] {
  const y = now.getFullYear();
  const sep = now.getMonth() < 8 ? y : y + 1;
  return [
    { label: `September ${sep}`, at: new Date(sep, 8, 1) },
    { label: `January ${y + 1}`, at: new Date(y + 1, 0, 1) },
    { label: `September ${sep + 1}`, at: new Date(sep + 1, 8, 1) },
  ]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((o) => o.label);
}

/** Every document the university asked for, in display order. */
function documentFields(f: FormFields): Array<{ key: string; label: string; hint?: string }> {
  return [
    ...(f.waec_results ? [{ key: 'waec_results', label: 'WAEC / WASSCE results', hint: 'Your results slip or the online result checker printout.' }] : []),
    ...(f.custom_documents ?? []).map((d) => ({ key: d.key, label: d.label })),
  ];
}

export default function CompleteApplication() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { profile, session } = useAuth();
  const [app, setApp] = useState<ApplicationWithUniversity | null | undefined>(undefined);
  const [whatsapp, setWhatsapp] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [program, setProgram] = useState('');
  const [intake, setIntake] = useState(intakes()[0]);
  const [uploads, setUploads] = useState<Record<string, Uploaded>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([fetchApplication(id), fetchSupportWhatsapp()])
      .then(([a, w]) => {
        setApp(a);
        setWhatsapp(w);
        if (a) {
          // Auto-fill from the student's profile so nothing is typed twice.
          setAnswers({
            full_name: profile?.full_name ?? '',
            email: session?.user.email ?? '',
            phone: profile?.phone ?? '',
          });
          if (a.program) setProgram(a.program);
          if (a.intake) setIntake(a.intake);
        }
      })
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  const form = useMemo<FormFields>(() => app?.form_snapshot ?? {}, [app]);
  const docs = documentFields(form);
  const set = (k: string, v: string) => setAnswers((a) => ({ ...a, [k]: v }));

  const textFields: Array<{ key: string; label: string; type?: string; autoComplete?: string }> = [
    ...(form.high_school ? [{ key: 'high_school', label: 'High school attended' }] : []),
    ...(form.guardian_name ? [{ key: 'guardian_name', label: 'Parent/guardian full name' }] : []),
    ...(form.guardian_email ? [{ key: 'guardian_email', label: 'Parent/guardian email', type: 'email' }] : []),
    ...(form.guardian_occupation ? [{ key: 'guardian_occupation', label: 'Parent/guardian occupation' }] : []),
  ];

  const missing = [
    ...['full_name', 'email', 'phone'].filter((k) => !answers[k]?.trim()),
    ...(program.trim().length < 2 ? ['program'] : []),
    ...textFields.filter((f) => !answers[f.key]?.trim()).map((f) => f.key),
    ...docs.filter((d) => !uploads[d.key]).map((d) => d.key),
  ];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!app) return;
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      await submitApplication({
        application_id: app.id,
        program: program.trim(),
        intake,
        answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v.trim()])),
        documents: docs.filter((d) => uploads[d.key]).map((d) => ({ key: d.key, ...uploads[d.key] })),
      });
      navigate('/applications', { replace: true, state: { submitted: app.id } });
    } catch (err) {
      if (err instanceof FunctionError && typeof err.body.field === 'string') {
        setFieldErrors({ [err.body.field]: err.message.replace(/^[\w.[\]]+: /, '') });
      }
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  if (app === null) {
    return (
      <PageTransition label="Application not found">
        <div className="container">
          <PageHeader back={{ to: '/applications', label: 'My applications' }} title="Application not found" />
        </div>
      </PageTransition>
    );
  }

  const uniName = app?.university?.name ?? 'your university';
  const helpText = app ? `Hi Afriversity, I need help with my ${uniName} application (ref ${app.payment_ref ?? app.id}).` : '';

  return (
    <PageTransition label="Complete your application">
      <div className="container complete">
        <PageHeader back={{ to: '/applications', label: 'My applications' }} eyebrow={uniName} title="Complete your application" />

        {!app ? (
          <Skeleton shape="block" height="320px" label="Loading your application" />
        ) : app.status !== 'Paid' ? (
          <EmptyState icon={CircleCheck} title={app.status === 'Pending Payment' ? 'Payment not confirmed yet' : 'Application already submitted'} action={<Link to="/applications">Go to my applications</Link>}>
            <p>{app.status === 'Pending Payment' ? 'This form opens once Paystack confirms your payment.' : 'Our team has your details. Track progress from My applications.'}</p>
          </EmptyState>
        ) : (
          <motion.form className="complete__form" onSubmit={submit} variants={staggerParent} initial="hidden" animate="show" noValidate>
            {params.get('paid') && (
              <motion.div variants={riseItem}>
                <Notice tone="success">Payment received. Fill in the details {uniName} needs and we'll prepare your application.</Notice>
              </motion.div>
            )}

            <motion.fieldset className="complete__group" variants={riseItem}>
              <legend className="complete__legend">About you</legend>
              <Field label="Full name" autoComplete="name" value={answers.full_name ?? ''} onChange={(e) => set('full_name', e.target.value)} error={fieldErrors.full_name} required />
              <Field label="Email" type="email" autoComplete="email" value={answers.email ?? ''} onChange={(e) => set('email', e.target.value)} error={fieldErrors.email} required />
              <Field label="Phone (WhatsApp preferred)" type="tel" autoComplete="tel" value={answers.phone ?? ''} onChange={(e) => set('phone', e.target.value)} error={fieldErrors.phone} required />
            </motion.fieldset>

            <motion.fieldset className="complete__group" variants={riseItem}>
              <legend className="complete__legend">What you want to study</legend>
              <Field label="Programme" placeholder="e.g. BSc Computer Engineering" value={program} onChange={(e) => setProgram(e.target.value)} error={fieldErrors.program} maxLength={140} required />
              <div className="complete__intake" role="radiogroup" aria-label="Intake">
                <span className="field__label">Intake</span>
                <div className="complete__chips">
                  {intakes().map((i) => (
                    <Chip key={i} kind="radio" selected={intake === i} onToggle={() => setIntake(i)} layoutGroup="intake">
                      {i}
                    </Chip>
                  ))}
                </div>
              </div>
            </motion.fieldset>

            {textFields.length > 0 && (
              <motion.fieldset className="complete__group" variants={riseItem}>
                <legend className="complete__legend">Required by {app.university?.short_name ?? uniName}</legend>
                {textFields.map((f) => (
                  <Field key={f.key} label={f.label} type={f.type ?? 'text'} value={answers[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} error={fieldErrors[f.key]} required />
                ))}
              </motion.fieldset>
            )}

            {docs.length > 0 && (
              <motion.fieldset className="complete__group" variants={riseItem}>
                <legend className="complete__legend">Documents</legend>
                {docs.map((d) => (
                  <FileField
                    key={d.key}
                    label={d.label}
                    hint={d.hint}
                    accept={ACCEPTED_TYPES.join(',')}
                    doneName={uploads[d.key]?.name}
                    error={fieldErrors[d.key]}
                    onUpload={async (file) => {
                      const { path } = await uploadDocument(app.user_id, app.id, d.key, file);
                      setUploads((u) => ({ ...u, [d.key]: { path, name: file.name, size: file.size, type: file.type } }));
                    }}
                  />
                ))}
              </motion.fieldset>
            )}

            {error && <Notice tone="error">{error}</Notice>}

            <Button type="submit" size="lg" block loading={busy} disabled={missing.length > 0}>
              Submit application
            </Button>
            {missing.length > 0 && <p className="complete__todo">{missing.length} {missing.length === 1 ? 'item' : 'items'} left to fill in</p>}

            {whatsapp && (
              <a className="complete__whatsapp" href={whatsappLink(whatsapp, helpText)} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden="true" />
                Need help? Send your documents via WhatsApp.
              </a>
            )}
          </motion.form>
        )}
      </div>
    </PageTransition>
  );
}
