import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { ArrowRightLeft, Download, FileText } from 'lucide-react';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { Chip, Tag } from '../../components/Chip/Chip';
import { SelectField, TextAreaField } from '../../components/Field/Field';
import { Notice } from '../../components/Notice/Notice';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { adminCall } from '../../features/admin/api';
import { asArray, useAdminData } from '../../features/admin/useAdminData';
import type { Application, ApplicationDocument, ApplicationStatus } from '../../features/applications/types';
import { formatMoney } from '../../lib/money';
import { errorMessage } from '../../lib/supabase';
import { riseItem, staggerParent } from '../../lib/motion';

type Row = Application & {
  university: { name: string; short_name: string | null } | null;
  student: { full_name: string | null; phone: string | null; country: string | null } | null;
};
type SignedDoc = ApplicationDocument & { url: string | null };

const FILTERS: Array<ApplicationStatus | 'All'> = ['All', 'Submitted', 'In Review', 'Paid', 'Offer', 'Rejected', 'Pending Payment', 'Failed'];
const NEXT_STATUSES = ['Submitted', 'In Review', 'Offer', 'Rejected', 'Withdrawn'] as const;

const LABELS: Record<string, string> = {
  full_name: 'Full name',
  email: 'Email',
  phone: 'Phone',
  high_school: 'High school attended',
  guardian_name: 'Parent/guardian name',
  guardian_email: 'Parent/guardian email',
  guardian_occupation: 'Parent/guardian occupation',
};

const kb = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

export default function AdminApplications() {
  const [filter, setFilter] = useState<ApplicationStatus | 'All'>('Submitted');
  const { data, error, mutate } = useAdminData<Row[]>('applications.list', filter === 'All' ? {} : { status: filter });
  const rows = asArray(data);
  const [editing, setEditing] = useState<{ row: Row; status: string; note: string } | null>(null);
  const [docs, setDocs] = useState<SignedDoc[] | null>(null);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Signed links expire after 10 minutes, so fetch them each time the panel opens.
  const openId = editing?.row.id;
  const hasDocs = (editing?.row.documents?.length ?? 0) > 0;
  useEffect(() => {
    setDocs(null);
    setDocsError(null);
    if (!openId || !hasDocs) return;
    adminCall<SignedDoc[]>('applications.documents', { id: openId })
      .then(setDocs)
      .catch((e) => setDocsError(errorMessage(e)));
  }, [openId, hasDocs]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setFormError(null);
    const err = await mutate('applications.update_status', { id: editing.row.id, status: editing.status, status_note: editing.note });
    setSaving(false);
    if (err) setFormError(err);
    else setEditing(null);
  };

  const unpaid = (s: ApplicationStatus) => s === 'Pending Payment' || s === 'Failed';
  const row = editing?.row;

  return (
    <section className="admin-section" aria-labelledby="a-h">
      <div className="admin-section__head">
        <div>
          <h1 id="a-h" className="admin-section__title">Applications</h1>
          <p className="admin-section__sub">“Paid” means the fee cleared but the student hasn't submitted their form yet.</p>
        </div>
      </div>
      <div className="admin-form__chips" role="radiogroup" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <Chip key={f} kind="radio" selected={filter === f} onToggle={() => setFilter(f)}>
            {f}
          </Chip>
        ))}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {!data && !error && <Skeleton shape="block" height="160px" label="Loading" />}
      {data && rows.length === 0 && <Notice tone="info">No applications with this status.</Notice>}
      {rows.length > 0 && (
        <motion.ul className="admin-list" role="list" variants={staggerParent} initial="hidden" animate="show">
          {rows.map((a) => (
            <motion.li key={a.id} className="admin-row" variants={riseItem}>
              <div className="admin-row__main">
                <span className="admin-row__title">
                  {a.form_data?.full_name ?? a.student?.full_name ?? 'Student'} → {a.university?.short_name ?? a.university?.name}
                </span>
                <span className="admin-row__meta">
                  {a.program ?? 'Programme not chosen yet'}
                  {a.intake ? ` · ${a.intake}` : ''} · {new Date(a.created_at).toLocaleDateString()}
                </span>
                <span className="admin-row__meta">
                  {formatMoney(a.total_cents, a.currency)} · {a.documents?.length ?? 0} file{(a.documents?.length ?? 0) === 1 ? '' : 's'} · ref {a.payment_ref ?? '—'}
                </span>
              </div>
              <div className="admin-row__aside">
                <Tag tone={a.status === 'Offer' || a.status === 'Paid' ? 'gold' : unpaid(a.status) || a.status === 'Rejected' ? 'urgent' : 'emerald'}>{a.status}</Tag>
                {!unpaid(a.status) && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<ArrowRightLeft aria-hidden="true" />}
                    onClick={() => {
                      setFormError(null);
                      setEditing({ row: a, status: a.status === 'Paid' ? 'Submitted' : a.status, note: a.status_note ?? '' });
                    }}
                  >
                    Open
                  </Button>
                )}
              </div>
            </motion.li>
          ))}
        </motion.ul>
      )}

      <Sheet
        variant="side"
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={row ? (row.form_data?.full_name ?? row.student?.full_name ?? 'Application') : 'Application'}
        description={row ? `${row.program ?? 'No programme yet'} · ${row.university?.name ?? ''}` : undefined}
      >
        {editing && row && (
          <div className="admin-form">
            {row.status === 'Paid' && <Notice tone="info">Fee paid. The student hasn't submitted their application form yet, so the status can't move forward.</Notice>}

            {Object.keys(row.form_data ?? {}).length > 0 && (
              <section aria-labelledby="ans-h" className="uni-form__group">
                <h3 id="ans-h" className="uni-form__legend">Answers</h3>
                <dl className="admin-details">
                  {Object.entries(row.form_data).map(([k, v]) => (
                    <div key={k}>
                      <dt>{LABELS[k] ?? k.replace(/_/g, ' ')}</dt>
                      <dd>{v || '—'}</dd>
                    </div>
                  ))}
                  {row.intake && (
                    <div>
                      <dt>Intake</dt>
                      <dd>{row.intake}</dd>
                    </div>
                  )}
                </dl>
              </section>
            )}

            {hasDocs && (
              <section aria-labelledby="docs-h" className="uni-form__group">
                <h3 id="docs-h" className="uni-form__legend">Documents</h3>
                {docsError && <Notice tone="error">{docsError}</Notice>}
                {!docs && !docsError && <Skeleton shape="block" height="96px" label="Loading documents" />}
                {docs && (
                  <ul className="doc-list" role="list">
                    {asArray(docs).map((d) => (
                      <li key={d.key}>
                        <FileText aria-hidden="true" />
                        <span className="doc-list__text">
                          <span className="doc-list__label">{d.label}</span>
                          <span className="doc-list__name">
                            {d.name} · {kb(d.size)}
                          </span>
                        </span>
                        {d.url ? (
                          <a className="doc-list__open" href={d.url} target="_blank" rel="noreferrer" aria-label={`Open ${d.label}`}>
                            <Download aria-hidden="true" />
                          </a>
                        ) : (
                          <span className="doc-list__name">missing</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <dl className="admin-details">
              <div>
                <dt>Paid</dt>
                <dd>
                  {formatMoney(row.total_cents, row.currency)} · ref {row.payment_ref ?? '—'}
                </dd>
              </div>
              <div>
                <dt>Phone (profile)</dt>
                <dd>{row.student?.phone ?? '—'}</dd>
              </div>
            </dl>

            {row.status !== 'Paid' && (
              <form className="admin-form" onSubmit={save}>
                <SelectField label="Status" options={NEXT_STATUSES} value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} />
                <TextAreaField label="Note to the student (shown on their tracker)" maxLength={500} value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
                {formError && <Notice tone="error">{formError}</Notice>}
                <Button type="submit" block loading={saving}>
                  Save status
                </Button>
              </form>
            )}
          </div>
        )}
      </Sheet>
    </section>
  );
}
