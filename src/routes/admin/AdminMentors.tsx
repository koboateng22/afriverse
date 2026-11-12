import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Check, UserCheck, X } from 'lucide-react';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { Field } from '../../components/Field/Field';
import { Notice } from '../../components/Notice/Notice';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { Tag } from '../../components/Chip/Chip';
import { asArray, useAdminData } from '../../features/admin/useAdminData';
import type { Mentor } from '../../features/mentors/types';
import { formatMoney } from '../../lib/money';
import { riseItem, staggerParent } from '../../lib/motion';

type Row = Mentor & {
  email: string | null;
  subaccount_code: string | null;
  proposed_rate_cents: number | null;
  rate_review: 'none' | 'pending' | 'approved' | 'rejected';
  /** From /mentor-apply (0021); null for mentors who joined before it. */
  application?: { expertise: string; rate_cents: number | null; linkedin_url: string | null; created_at: string } | null;
};

const ghs = (c: number | null | undefined) => (c ? `${formatMoney(c, 'GHS')}/hr` : '—');
// Pending accounts first, then rates waiting for review.
const rank = (m: Row) => (m.status === 'pending' ? 0 : m.rate_review === 'pending' ? 1 : m.status === 'approved' ? 2 : 3);

export default function AdminMentors() {
  const { data, error, mutate } = useAdminData<Row[]>('mentors.list');
  const [openId, setOpenId] = useState<string | null>(null);
  const [subaccount, setSubaccount] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const rows = [...asArray(data)].sort((a, b) => rank(a) - rank(b));
  const current = rows.find((m) => m.id === openId) ?? null;

  const open = (m: Row) => {
    setFormError(null);
    setSubaccount(m.subaccount_code ?? '');
    setOpenId(m.id);
  };

  const run = async (key: string, action: string, payload: Record<string, unknown>) => {
    setBusy(key);
    setFormError(null);
    const err = await mutate(action, payload);
    setBusy(null);
    if (err) setFormError(err);
  };

  const approveAccount = (e: FormEvent) => {
    e.preventDefault();
    if (!current) return;
    void run('approve', 'mentors.review', { id: current.id, decision: 'approved', subaccount_code: subaccount.trim() });
  };

  return (
    <section className="admin-section" aria-labelledby="m-h">
      <div className="admin-section__head">
        <div>
          <h1 id="m-h" className="admin-section__title">Mentors</h1>
          <p className="admin-section__sub">
            Mentors propose an hourly rate in GHS; students only ever pay the rate you approve. Each booking splits 75% to the mentor's Paystack subaccount and 25% to Afriversity.
          </p>
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {!data && !error && <Skeleton shape="block" height="160px" label="Loading" />}
      {data && rows.length === 0 && <Notice tone="info">No mentor applications yet. Mentors apply from the quiet link on the student sign-in page.</Notice>}
      {rows.length > 0 && (
        <motion.ul className="admin-list" role="list" variants={staggerParent} initial="hidden" animate="show">
          {rows.map((m) => (
            <motion.li key={m.id} className="admin-row" variants={riseItem}>
              <div className="admin-row__main">
                <span className="admin-row__title">{m.display_name}</span>
                <span className="admin-row__meta">
                  {m.email ?? 'no email'} · {m.headline ?? 'No headline yet'}
                </span>
                <span className="admin-row__meta">
                  Live {ghs(m.rate_cents)}
                  {m.rate_review === 'pending' && ` · proposed ${ghs(m.proposed_rate_cents)}`}
                </span>
              </div>
              <div className="admin-row__aside">
                <Tag tone={m.status === 'approved' ? 'emerald' : m.status === 'pending' ? 'gold' : 'urgent'}>{m.status}</Tag>
                {m.rate_review === 'pending' && <Tag tone="gold">rate to review</Tag>}
                <Button variant="secondary" size="sm" icon={<UserCheck aria-hidden="true" />} onClick={() => open(m)} aria-label={`Review ${m.display_name}`}>
                  Review
                </Button>
              </div>
            </motion.li>
          ))}
        </motion.ul>
      )}

      <Sheet variant="side" open={Boolean(current)} onClose={() => setOpenId(null)} title={current ? current.display_name : 'Mentor'} description={current?.email ?? undefined}>
        {current && (
          <div className="admin-form">
            {current.application && (
              <dl className="admin-details" aria-label="Application">
                <div><dt>Applied</dt><dd>{current.application.created_at.slice(0, 10)}</dd></div>
                <div><dt>Expertise</dt><dd>{current.application.expertise || '—'}</dd></div>
                <div><dt>Asked rate</dt><dd>{current.application.rate_cents ? formatMoney(current.application.rate_cents, 'GHS') + ' per session' : '—'}</dd></div>
                <div>
                  <dt>LinkedIn</dt>
                  <dd>
                    {current.application.linkedin_url ? (
                      <a className="admin-lesson-link" href={current.application.linkedin_url} target="_blank" rel="noopener noreferrer">
                        {current.application.linkedin_url.replace(/^https:\/\/(www\.)?/, '')}
                      </a>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
              </dl>
            )}
            <section className="rate-review" data-state={current.rate_review} aria-labelledby="rr-h">
              <h3 id="rr-h" className="uni-form__legend">Hourly rate</h3>
              <div className="rate-review__nums">
                <div>
                  <span>Proposed</span>
                  <strong>{ghs(current.proposed_rate_cents)}</strong>
                </div>
                <div>
                  <span>Live (approved)</span>
                  <strong>{ghs(current.rate_cents)}</strong>
                </div>
              </div>
              {current.proposed_rate_cents ? (
                <p className="rate-review__split">
                  Per session: mentor {formatMoney(Math.round(current.proposed_rate_cents * 0.75), 'GHS')} · Afriversity {formatMoney(Math.round(current.proposed_rate_cents * 0.25), 'GHS')}
                </p>
              ) : (
                <p className="rate-review__split">This mentor hasn't proposed a rate yet.</p>
              )}
              {current.rate_review === 'pending' && (
                <div className="admin-form__actions">
                  <Button variant="quiet" icon={<X aria-hidden="true" />} loading={busy === 'rate-no'} disabled={Boolean(busy)} onClick={() => void run('rate-no', 'mentors.rate', { id: current.id, decision: 'rejected' })}>
                    Reject rate
                  </Button>
                  <Button icon={<Check aria-hidden="true" />} loading={busy === 'rate-yes'} disabled={Boolean(busy)} onClick={() => void run('rate-yes', 'mentors.rate', { id: current.id, decision: 'approved' })}>
                    Approve {ghs(current.proposed_rate_cents)}
                  </Button>
                </div>
              )}
              {current.rate_review === 'approved' && <Tag tone="emerald">Approved</Tag>}
              {current.rate_review === 'rejected' && <Tag tone="urgent">Rejected — waiting for a new proposal</Tag>}
            </section>

            <form className="admin-form" onSubmit={approveAccount} aria-labelledby="acct-h">
              <h3 id="acct-h" className="uni-form__legend">Account &amp; payouts</h3>
              <Field
                label="Paystack subaccount code"
                placeholder="ACCT_xxxxxxxx"
                value={subaccount}
                onChange={(e) => setSubaccount(e.target.value)}
                hint="Create it in Paystack → Subaccounts with the mentor's bank or MoMo details. Bookings stay paused until it's set."
              />
              <div className="admin-form__actions">
                <Button variant="quiet" loading={busy === 'reject'} disabled={Boolean(busy) || current.status === 'rejected'} onClick={() => void run('reject', 'mentors.review', { id: current.id, decision: 'rejected' })}>
                  Reject mentor
                </Button>
                <Button type="submit" variant={current.rate_review === 'pending' ? 'secondary' : 'primary'} loading={busy === 'approve'} disabled={Boolean(busy)}>
                  {current.status === 'approved' ? 'Update subaccount' : 'Approve mentor'}
                </Button>
              </div>
            </form>
            {formError && <Notice tone="error">{formError}</Notice>}
          </div>
        )}
      </Sheet>
    </section>
  );
}
