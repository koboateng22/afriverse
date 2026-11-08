import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, FileText, FileUp, Mail, Pencil, Plus, Sparkles, Trash2, Type, UserRound } from 'lucide-react';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { Field, SelectField, TextAreaField } from '../../components/Field/Field';
import { Switch } from '../../components/Switch/Switch';
import { Notice } from '../../components/Notice/Notice';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { Tag } from '../../components/Chip/Chip';
import { scrapeUniversity } from '../../features/admin/api';
import { asArray, useAdminData } from '../../features/admin/useAdminData';
import { COUNTRIES } from '../../features/universities/countries';
import { feeOf, requirementsOf, type FormFields, type University } from '../../features/universities/types';
import { formatMoney, toCents } from '../../lib/money';
import { errorMessage } from '../../lib/supabase';
import { riseItem, staggerParent } from '../../lib/motion';

type FlagKey = 'high_school' | 'waec_results' | 'guardian_name' | 'guardian_email' | 'guardian_occupation';

/** The form-builder options, in the order the student sees them. */
const BUILDER: Array<{ key: FlagKey; label: string; kind: 'Text' | 'File upload' | 'Email'; icon: typeof Type }> = [
  { key: 'high_school', label: 'High School Attended', kind: 'Text', icon: Type },
  { key: 'waec_results', label: 'WAEC / WASSCE Results', kind: 'File upload', icon: FileUp },
  { key: 'guardian_name', label: 'Parent/Guardian Full Name', kind: 'Text', icon: UserRound },
  { key: 'guardian_email', label: 'Parent/Guardian Email', kind: 'Email', icon: Mail },
  { key: 'guardian_occupation', label: 'Parent/Guardian Occupation', kind: 'Text', icon: Type },
];

const DOC_SUGGESTIONS = ['Passport Photo', 'Transcript', 'Birth Certificate', 'Recommendation Letter', 'Personal Statement'];

type Form = {
  id?: string;
  slug?: string;
  name: string;
  short_name: string;
  country: string;
  city: string;
  website: string;
  cutoffLink: string;
  logoUrl: string;
  coverUrl: string;
  description: string;
  active: boolean;
  fee: string;
  serviceFee: string;
  flags: Record<FlagKey, boolean>;
  customOn: boolean;
  docs: string[];
  docDraft: string;
};

const noFlags: Record<FlagKey, boolean> = { high_school: false, waec_results: false, guardian_name: false, guardian_email: false, guardian_occupation: false };

const blank = (): Form => ({
  name: '',
  short_name: '',
  country: 'Ghana',
  city: '',
  website: '',
  cutoffLink: '',
  logoUrl: '',
  coverUrl: '',
  description: '',
  active: true,
  fee: '',
  serviceFee: '50',
  flags: { ...noFlags },
  customOn: false,
  docs: [],
  docDraft: '',
});

const toForm = (u: University): Form => {
  const f = u.form_fields ?? {};
  const docs = (f.custom_documents ?? []).map((d) => d.label);
  return {
    id: u.id,
    slug: u.slug,
    name: u.name,
    short_name: u.short_name ?? '',
    country: u.country,
    city: u.city,
    website: u.website ?? '',
    cutoffLink: u.cutoff_link ?? '',
    logoUrl: u.logo_url ?? '',
    coverUrl: u.cover_image_url ?? '',
    description: u.description ?? '',
    active: u.active,
    fee: String(u.app_fee_cents / 100),
    serviceFee: String(u.service_fee_cents / 100),
    flags: { high_school: !!f.high_school, waec_results: !!f.waec_results, guardian_name: !!f.guardian_name, guardian_email: !!f.guardian_email, guardian_occupation: !!f.guardian_occupation },
    customOn: docs.length > 0,
    docs,
    docDraft: '',
  };
};

/** "ug.edu.gh" → "https://ug.edu.gh". Empty when nothing was typed. */
const siteOf = (v: string) => {
  const t = v.trim();
  return !t || /^https?:\/\//i.test(t) ? t : `https://${t}`;
};

type Fill = { status: 'idle' | 'loading' | 'done' | 'error'; message?: string };

function formFieldsOf(form: Form): FormFields {
  return { ...form.flags, custom_documents: form.customOn ? form.docs.map((label) => ({ key: '', label })) : [] };
}

export default function AdminUniversities() {
  const { data, error, mutate } = useAdminData<University[]>('universities.list');
  const rows = asArray(data);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fill, setFill] = useState<Fill>({ status: 'idle' });
  // Bumped whenever another form opens, so a slow auto-fill never lands in the wrong university.
  const fillRun = useRef(0);

  const feeCents = form ? toCents(form.fee) : null;
  const serviceCents = form ? (form.serviceFee.trim() === '' ? 0 : toCents(form.serviceFee)) : null;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const open = (f: Form) => {
    fillRun.current++;
    setFill({ status: 'idle' });
    setFormError(null);
    setForm(f);
  };

  // INTEGRATION: scrape-university — copies the site's logo + og:image into university_assets.
  const autoFill = async () => {
    if (!form) return;
    const site = siteOf(form.website);
    if (!site) return setFill({ status: 'error', message: 'Type the university’s website first, e.g. https://www.ug.edu.gh' });
    const run = ++fillRun.current;
    set('website', site);
    setFill({ status: 'loading' });
    try {
      const found = await scrapeUniversity(site);
      if (run !== fillRun.current) return;
      setForm((f) => (f ? { ...f, logoUrl: found.logo_url ?? f.logoUrl, coverUrl: found.cover_image_url ?? f.coverUrl } : f));
      const got = [found.logo_url && 'logo', found.cover_image_url && 'cover image'].filter(Boolean).join(' and ');
      const missing = !found.logo_url ? ' No logo found.' : !found.cover_image_url ? ' No cover image found.' : '';
      setFill({ status: 'done', message: `Found the ${got}. Check them below, then save.${missing}` });
    } catch (err) {
      if (run === fillRun.current) setFill({ status: 'error', message: errorMessage(err) });
    }
  };

  const addDoc = (label: string) => {
    const clean = label.trim().replace(/\s+/g, ' ');
    if (!form || clean.length < 2) return;
    if (form.docs.length >= 8) return setFormError('At most 8 custom documents per university.');
    if (form.docs.some((d) => d.toLowerCase() === clean.toLowerCase())) return set('docDraft', '');
    setForm({ ...form, docs: [...form.docs, clean.slice(0, 60)], docDraft: '' });
  };
  const onDocKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDoc(form?.docDraft ?? '');
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (feeCents === null || feeCents < 100) {
      setFormError('Enter the university’s application fee in GHS, e.g. 250 or 250.50 (minimum GHS 1).');
      return;
    }
    if (serviceCents === null) {
      setFormError('Enter the service fee in GHS, e.g. 50, or 0 for none.');
      return;
    }
    if (form.customOn && form.docs.length === 0) {
      setFormError('Add at least one custom document, or untick Custom Document Upload.');
      return;
    }
    if (form.website && !/^https:\/\//i.test(form.website.trim())) {
      setFormError('Website must start with https://');
      return;
    }
    if (form.cutoffLink.trim() && !/^https:\/\/\S+$/i.test(form.cutoffLink.trim())) {
      setFormError('Cut-Off Points Link must be a full link starting with https://');
      return;
    }
    setSaving(true);
    setFormError(null);
    const err = await mutate(form.id ? 'universities.update' : 'universities.create', {
      id: form.id,
      slug: form.slug,
      name: form.name.trim(),
      short_name: form.short_name.trim(),
      country: form.country,
      city: form.city.trim(),
      website: form.website.trim(),
      cutoff_link: form.cutoffLink.trim(),
      logo_url: form.logoUrl,
      cover_image_url: form.coverUrl,
      description: form.description.trim(),
      active: form.active,
      app_fee_cents: feeCents,
      service_fee_cents: serviceCents,
      form_fields: formFieldsOf(form),
    });
    setSaving(false);
    if (err) setFormError(err);
    else setForm(null);
  };

  const remove = async () => {
    if (!form?.id) return;
    if (!window.confirm(`Remove ${form.name}? If it has applications it will be set to Inactive instead of deleted.`)) return;
    setSaving(true);
    const err = await mutate('universities.delete', { id: form.id });
    setSaving(false);
    if (err) setFormError(err);
    else setForm(null);
  };

  const preview = form ? requirementsOf(formFieldsOf(form)) : [];

  return (
    <section className="admin-section" aria-labelledby="uni-h">
      <div className="admin-section__head">
        <div>
          <h1 id="uni-h" className="admin-section__title">Universities</h1>
          <p className="admin-section__sub">Students pay the university fee plus your concierge service fee, in GHS. Changes only affect applications paid afterwards.</p>
        </div>
        <Button icon={<Plus aria-hidden="true" />} onClick={() => open(blank())}>
          Add university
        </Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {!data && !error && <Skeleton shape="block" height="160px" label="Loading" />}
      {data && rows.length === 0 && <Notice tone="info">No universities yet. Add the first one to open applications.</Notice>}
      {rows.length > 0 && (
        <motion.ul className="admin-list" role="list" variants={staggerParent} initial="hidden" animate="show">
          {rows.map((u) => {
            const reqs = requirementsOf(u.form_fields ?? {});
            return (
              <motion.li key={u.id} className="admin-row" variants={riseItem} data-muted={!u.active || undefined}>
                <div className="admin-row__main">
                  <span className="admin-row__title">{u.name}</span>
                  <span className="admin-row__meta">
                    {u.city}, {u.country} · {reqs.length ? `${reqs.length} form ${reqs.length === 1 ? 'field' : 'fields'}` : 'Basic form only'}
                  </span>
                </div>
                <div className="admin-row__aside">
                  <Tag>{u.active ? 'Active' : 'Inactive'}</Tag>
                  <span className="admin-row__money">{formatMoney(feeOf(u), 'GHS')}</span>
                  <Button variant="secondary" size="sm" icon={<Pencil aria-hidden="true" />} onClick={() => open(toForm(u))} aria-label={`Edit ${u.name}`}>
                    Edit
                  </Button>
                </div>
              </motion.li>
            );
          })}
        </motion.ul>
      )}

      <Sheet
        variant="side"
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? `Edit ${form.name}` : 'Add university'}
        description="Saved straight to the universities table. Students see it when it's Active."
        footer={
          form && (
            <>
              {form.id ? (
                <Button variant="quiet" icon={<Trash2 aria-hidden="true" />} onClick={remove} disabled={saving}>
                  Remove
                </Button>
              ) : (
                <Button variant="quiet" onClick={() => setForm(null)}>
                  Cancel
                </Button>
              )}
              <Button type="submit" form="uni-form" loading={saving}>
                {form.id ? 'Save changes' : 'Save university'}
              </Button>
            </>
          )
        }
      >
        {form && (
          <form id="uni-form" className="admin-form uni-form" onSubmit={save} noValidate={false}>
            <fieldset className="uni-form__group">
              <legend className="uni-form__legend">Details</legend>
              <Field label="University name" value={form.name} onChange={(e) => set('name', e.target.value)} required minLength={2} maxLength={160} autoComplete="off" />
              <div className="admin-form__row">
                <SelectField label="Country" options={COUNTRIES.includes(form.country) ? COUNTRIES : [form.country, ...COUNTRIES]} value={form.country} onChange={(e) => set('country', e.target.value)} required />
                <Field label="City" value={form.city} onChange={(e) => set('city', e.target.value)} required minLength={2} maxLength={80} />
              </div>
              <div className="autofill">
                <Field label="University Website URL" type="url" inputMode="url" placeholder="https://www.example.edu" value={form.website} onChange={(e) => set('website', e.target.value)} />
                <Button variant="secondary" icon={<Sparkles aria-hidden="true" />} loading={fill.status === 'loading'} disabled={!form.website.trim()} onClick={autoFill}>
                  {fill.status === 'loading' ? 'Reading website…' : 'Auto-Fill from Website'}
                </Button>
              </div>
              <div aria-live="polite">
                {fill.status === 'error' && <Notice tone="error">{fill.message}</Notice>}
                {fill.status === 'done' && <Notice tone="success">{fill.message}</Notice>}
              </div>
              {(form.logoUrl || form.coverUrl || fill.status === 'loading') && (
                <div className="uni-images" aria-busy={fill.status === 'loading' || undefined}>
                  <figure className="uni-images__item">
                    <figcaption>Logo</figcaption>
                    {form.logoUrl ? (
                      <img className="uni-images__logo" src={form.logoUrl} alt="University logo" />
                    ) : fill.status === 'loading' ? (
                      <Skeleton shape="block" height="72px" label="Finding logo" />
                    ) : (
                      <p className="uni-images__empty">No logo</p>
                    )}
                    {form.logoUrl && (
                      <button type="button" className="uni-images__remove" onClick={() => set('logoUrl', '')}>
                        <Trash2 aria-hidden="true" /> Remove logo
                      </button>
                    )}
                  </figure>
                  <figure className="uni-images__item uni-images__item--cover">
                    <figcaption>Cover image</figcaption>
                    {form.coverUrl ? (
                      <img className="uni-images__cover" src={form.coverUrl} alt="University cover" />
                    ) : fill.status === 'loading' ? (
                      <Skeleton shape="block" height="120px" label="Finding cover image" />
                    ) : (
                      <p className="uni-images__empty">No cover image</p>
                    )}
                    {form.coverUrl && (
                      <button type="button" className="uni-images__remove" onClick={() => set('coverUrl', '')}>
                        <Trash2 aria-hidden="true" /> Remove cover
                      </button>
                    )}
                  </figure>
                </div>
              )}
              <Field
                label="Cut-Off Points Link"
                type="url"
                inputMode="url"
                placeholder="https://www.example.edu/admissions/cut-off-points"
                hint="Students see a “View Cut-Off Points” button next to their aggregate. Leave empty to hide it."
                value={form.cutoffLink}
                onChange={(e) => set('cutoffLink', e.target.value)}
                maxLength={500}
              />
              <TextAreaField label="Description" hint="Shown on the university page. Two or three sentences work best." value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} rows={4} />
              <Field label="Short name (optional)" placeholder="e.g. KNUST" value={form.short_name} onChange={(e) => set('short_name', e.target.value)} maxLength={40} />
            </fieldset>

            <fieldset className="uni-form__group">
              <legend className="uni-form__legend">Status &amp; fees</legend>
              <Switch label="Status" hint={form.active ? 'Visible to students and accepting payments' : 'Hidden from students'} onText="Active" offText="Inactive" checked={form.active} onChange={(v) => set('active', v)} />
              <div className="admin-form__row">
                <Field
                  label="University fee (GHS)"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step="0.01"
                  placeholder="e.g. 250"
                  value={form.fee}
                  onChange={(e) => set('fee', e.target.value)}
                  required
                  hint="What the university charges (the voucher / form fee)."
                />
                <Field
                  label="Service fee (GHS)"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder="50"
                  value={form.serviceFee}
                  onChange={(e) => set('serviceFee', e.target.value)}
                  hint="Our concierge fee: we buy the voucher and submit the forms."
                />
              </div>
              <p className="uni-form__note" aria-live="polite">
                {feeCents !== null && feeCents >= 100 && serviceCents !== null
                  ? `Students pay ${formatMoney(feeCents + serviceCents, 'GHS')} through Paystack (${formatMoney(feeCents, 'GHS')} + ${formatMoney(serviceCents, 'GHS')} service fee).`
                  : 'Charged in Ghana cedis through Paystack.'}
              </p>
            </fieldset>

            <fieldset className="uni-form__group">
              <legend className="uni-form__legend">Application form builder</legend>
              <p className="uni-form__note">Name, email, phone and programme are always collected (name and email are pre-filled). Tick what else this university needs.</p>
              <div className="builder" role="group" aria-label="Required fields">
                {BUILDER.map((b) => (
                  <label key={b.key} className="builder__opt" data-on={form.flags[b.key] || undefined}>
                    <input type="checkbox" checked={form.flags[b.key]} onChange={(e) => set('flags', { ...form.flags, [b.key]: e.target.checked })} />
                    <b.icon className="builder__icon" aria-hidden="true" />
                    <span className="builder__label">{b.label}</span>
                    <span className="builder__kind">{b.kind}</span>
                  </label>
                ))}
                <label className="builder__opt" data-on={form.customOn || undefined}>
                  <input type="checkbox" checked={form.customOn} onChange={(e) => set('customOn', e.target.checked)} />
                  <FileText className="builder__icon" aria-hidden="true" />
                  <span className="builder__label">Custom Document Upload</span>
                  <span className="builder__kind">File upload</span>
                </label>
              </div>

              <AnimatePresence initial={false}>
                {form.customOn && (
                  <motion.div className="builder__docs" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <div className="builder__add">
                      <Field label="Document name" placeholder="e.g. Passport Photo" value={form.docDraft} onChange={(e) => set('docDraft', e.target.value)} onKeyDown={onDocKey} maxLength={60} />
                      <Button variant="secondary" icon={<Plus aria-hidden="true" />} onClick={() => addDoc(form.docDraft)} disabled={form.docDraft.trim().length < 2}>
                        Add
                      </Button>
                    </div>
                    <div className="builder__suggest" aria-label="Suggestions">
                      {DOC_SUGGESTIONS.filter((s) => !form.docs.some((d) => d.toLowerCase() === s.toLowerCase())).map((s) => (
                        <button key={s} type="button" className="builder__chip" onClick={() => addDoc(s)}>
                          <Plus aria-hidden="true" /> {s}
                        </button>
                      ))}
                    </div>
                    {form.docs.length > 0 && (
                      <ul className="builder__list" role="list">
                        {form.docs.map((d) => (
                          <li key={d}>
                            <FileUp aria-hidden="true" />
                            <span>{d}</span>
                            <button type="button" className="builder__remove" aria-label={`Remove ${d}`} onClick={() => set('docs', form.docs.filter((x) => x !== d))}>
                              <Trash2 aria-hidden="true" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="builder__preview" aria-live="polite">
                <p className="builder__preview-h">After paying, students will fill in</p>
                <ol>
                  <li>Full name, email, phone, programme &amp; intake</li>
                  {preview.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ol>
              </div>
            </fieldset>

            {form.website && /^https:\/\//i.test(form.website) && (
              <a className="admin-lesson-link" href={form.website} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" /> Open website
              </a>
            )}
            {formError && <Notice tone="error">{formError}</Notice>}
          </form>
        )}
      </Sheet>
    </section>
  );
}
