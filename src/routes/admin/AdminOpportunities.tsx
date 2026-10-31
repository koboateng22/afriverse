import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Pencil, Plus, Star } from 'lucide-react';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { Field, SelectField, TextAreaField } from '../../components/Field/Field';
import { Chip, Tag } from '../../components/Chip/Chip';
import { Notice } from '../../components/Notice/Notice';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { asArray, slugify, useAdminData } from '../../features/admin/useAdminData';
import { EDUCATION_LEVELS, FIELDS } from '../../features/onboarding/options';
import type { Opportunity } from '../../features/opportunities/types';
import { riseItem, staggerParent } from '../../lib/motion';

type Row = Opportunity & { published: boolean; pro_insights: string[] };

const KINDS = ['scholarship', 'fellowship', 'program', 'award'] as const;
const FUNDING = ['full', 'partial', 'stipend', 'free_training', 'prize'] as const;
const STATUSES = ['open', 'rolling', 'upcoming', 'closed'] as const;

type Form = Omit<Row, 'id' | 'eligibility' | 'benefits' | 'pro_insights' | 'deadline' | 'opens_on' | 'cycle_note'> & {
  id?: string;
  eligibility: string;
  benefits: string;
  pro_insights: string;
  deadline: string;
  opens_on: string;
  cycle_note: string;
};

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

const blank: Form = {
  slug: '', title: '', provider: '', kind: 'scholarship', summary: '', description: '', eligibility: '', benefits: '', pro_insights: '',
  fields: [], levels: [], host_country: '', open_to: 'All African countries', funding: 'full', status: 'open', deadline: '', opens_on: '',
  cycle_note: '', url: '', is_pro: false, featured: false, published: true,
};

const toForm = (o: Row): Form => ({
  ...o,
  eligibility: o.eligibility.join('\n'),
  benefits: o.benefits.join('\n'),
  pro_insights: (o.pro_insights ?? []).join('\n'),
  deadline: o.deadline ?? '',
  opens_on: o.opens_on ?? '',
  cycle_note: o.cycle_note ?? '',
});

export default function AdminOpportunities() {
  const { data, error, mutate } = useAdminData<Row[]>('opportunities.list');
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const toggleIn = (k: 'fields' | 'levels', v: string) =>
    setForm((f) => (f ? { ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] } : f));

  const payloadOf = (f: Form) => ({
    ...f,
    slug: f.slug || slugify(f.title),
    eligibility: lines(f.eligibility),
    benefits: lines(f.benefits),
    pro_insights: lines(f.pro_insights),
    deadline: f.deadline || null,
    opens_on: f.opens_on || null,
    cycle_note: f.cycle_note || null,
  });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setFormError(null);
    const err = await mutate(form.id ? 'opportunities.update' : 'opportunities.create', payloadOf(form));
    setSaving(false);
    if (err) setFormError(err);
    else setForm(null);
  };

  const toggleFeatured = (o: Row) => mutate('opportunities.update', payloadOf({ ...toForm(o), featured: !o.featured }));

  const remove = async () => {
    if (!form?.id || !window.confirm(`Delete "${form.title}"? Students' saves of it will be removed too.`)) return;
    setSaving(true);
    const err = await mutate('opportunities.delete', { id: form.id });
    setSaving(false);
    if (err) setFormError(err);
    else setForm(null);
  };

  return (
    <section className="admin-section" aria-labelledby="opp-h">
      <div className="admin-section__head">
        <div>
          <h1 id="opp-h" className="admin-section__title">Opportunities</h1>
          <p className="admin-section__sub">Featured items are pinned near the top of every student's feed.</p>
        </div>
        <Button icon={<Plus aria-hidden="true" />} onClick={() => { setFormError(null); setForm({ ...blank }); }}>
          Add opportunity
        </Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {!data && !error && <Skeleton shape="block" height="160px" label="Loading" />}
      {data && (
        <motion.ul className="admin-list" role="list" variants={staggerParent} initial="hidden" animate="show">
          {asArray(data).map((o) => (
            <motion.li key={o.id} className="admin-row" variants={riseItem} data-muted={!o.published || undefined}>
              <div className="admin-row__main">
                <span className="admin-row__title">{o.title}</span>
                <span className="admin-row__meta">
                  {o.provider} · {o.status}
                  {o.deadline ? ` · closes ${o.deadline}` : ''}
                  {o.opens_on ? ` · opens ${o.opens_on}` : ''}
                </span>
              </div>
              <div className="admin-row__aside">
                {o.is_pro && <Tag tone="gold">Pro guide</Tag>}
                {!o.published && <Tag>Draft</Tag>}
                <Button variant={o.featured ? 'gold' : 'secondary'} size="sm" icon={<Star aria-hidden="true" />} onClick={() => void toggleFeatured(o)} aria-pressed={o.featured}>
                  {o.featured ? 'Featured' : 'Feature'}
                </Button>
                <Button variant="secondary" size="sm" icon={<Pencil aria-hidden="true" />} onClick={() => { setFormError(null); setForm(toForm(o)); }}>
                  Edit
                </Button>
              </div>
            </motion.li>
          ))}
        </motion.ul>
      )}

      <Sheet variant="side" open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? 'Edit opportunity' : 'Add opportunity'}>
        {form && (
          <form className="admin-form" onSubmit={save}>
            <Field label="Title" value={form.title} onChange={(e) => set('title', e.target.value)} required />
            <div className="admin-form__row">
              <Field label="Provider" value={form.provider} onChange={(e) => set('provider', e.target.value)} required />
              <Field label="Slug" value={form.slug} placeholder={slugify(form.title)} onChange={(e) => set('slug', slugify(e.target.value))} />
            </div>
            <div className="admin-form__row">
              <SelectField label="Kind" options={KINDS} value={form.kind} onChange={(e) => set('kind', e.target.value as Form['kind'])} />
              <SelectField label="Funding" options={FUNDING} value={form.funding} onChange={(e) => set('funding', e.target.value as Form['funding'])} />
              <SelectField label="Status" options={STATUSES} value={form.status} onChange={(e) => set('status', e.target.value as Form['status'])} />
            </div>
            <div className="admin-form__row">
              <Field label="Deadline" type="date" hint="Required when open" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
              <Field label="Opens on" type="date" value={form.opens_on} onChange={(e) => set('opens_on', e.target.value)} />
            </div>
            <Field label="Official URL" type="url" placeholder="https://" value={form.url} onChange={(e) => set('url', e.target.value)} required />
            <TextAreaField label="Summary (card)" maxLength={300} value={form.summary} onChange={(e) => set('summary', e.target.value)} />
            <TextAreaField label="Description" maxLength={3000} value={form.description} onChange={(e) => set('description', e.target.value)} />
            <TextAreaField label="Cycle note" hint="e.g. which round is open, when the next opens" value={form.cycle_note} onChange={(e) => set('cycle_note', e.target.value)} />
            <TextAreaField label="Eligibility (one per line)" value={form.eligibility} onChange={(e) => set('eligibility', e.target.value)} />
            <TextAreaField label="Benefits (one per line)" value={form.benefits} onChange={(e) => set('benefits', e.target.value)} />
            <div className="admin-form__row">
              <Field label="Host country" value={form.host_country} onChange={(e) => set('host_country', e.target.value)} required />
              <Field label="Open to" value={form.open_to} onChange={(e) => set('open_to', e.target.value)} required />
            </div>
            <p className="admin-form__label">Fields (none = all fields)</p>
            <div className="admin-form__chips">
              {FIELDS.map((f) => (
                <Chip key={f} selected={form.fields.includes(f)} onToggle={() => toggleIn('fields', f)}>{f}</Chip>
              ))}
            </div>
            <p className="admin-form__label">Education levels (none = all)</p>
            <div className="admin-form__chips">
              {EDUCATION_LEVELS.map((l) => (
                <Chip key={l} selected={form.levels.includes(l)} onToggle={() => toggleIn('levels', l)}>{l}</Chip>
              ))}
            </div>
            <label className="admin-form__toggle">
              <input type="checkbox" checked={form.is_pro} onChange={(e) => set('is_pro', e.target.checked)} />
              Has a Pro insider guide
            </label>
            {form.is_pro && <TextAreaField label="Pro insider guide (one tip per line — only Pro members can read this)" value={form.pro_insights} onChange={(e) => set('pro_insights', e.target.value)} />}
            <label className="admin-form__toggle">
              <input type="checkbox" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} />
              Featured
            </label>
            <label className="admin-form__toggle">
              <input type="checkbox" checked={form.published} onChange={(e) => set('published', e.target.checked)} />
              Published
            </label>
            {formError && <Notice tone="error">{formError}</Notice>}
            <div className="admin-form__actions">
              {form.id ? <Button variant="quiet" onClick={remove} disabled={saving}>Delete</Button> : <span />}
              <Button type="submit" loading={saving}>Save</Button>
            </div>
          </form>
        )}
      </Sheet>
    </section>
  );
}
