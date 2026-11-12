import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { BadgeCheck, Plus, UserMinus, Wallet } from 'lucide-react';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { Field } from '../../components/Field/Field';
import { Tag } from '../../components/Chip/Chip';
import { Notice } from '../../components/Notice/Notice';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { adminCall } from '../../features/admin/api';
import { asArray, useAdminData } from '../../features/admin/useAdminData';
import { formatDay } from '../../lib/dates';
import { formatMoney } from '../../lib/money';
import { errorMessage } from '../../lib/supabase';
import { riseItem, staggerParent } from '../../lib/motion';

type Ambassador = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  referral_code: string | null;
  ambassador_pending_earnings_cents: number;
  ambassador_total_paid_cents: number;
  created_at: string;
  signups: number;
  upgrades: number;
};

type Detail = {
  rewards: Array<{ id: string; amount_cents: number; created_at: string; student: { full_name: string | null; email: string | null; phone: string | null; created_at: string } | null }>;
  payouts: Array<{ id: string; amount_cents: number; reference: string | null; created_at: string }>;
};

const cedis = (cents: number) => formatMoney(cents, 'GHS');
const day = (iso: string) => formatDay(iso.slice(0, 10));

type Application = {
  id: string;
  user_id: string;
  full_name: string;
  university: string;
  phone: string;
  why: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  profile: { email: string | null; role: string } | null;
};

const waLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}`;

/** Applications from /ambassador-apply (0021). Approve gives them a referral code. */
function ApplicationsPanel({ onApproved }: { onApproved: () => void }) {
  const { data, error, mutate } = useAdminData<Application[]>('ambassadors.applications');
  const pending = asArray(data).filter((a) => a.status === 'pending');
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const review = async (a: Application, decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !window.confirm(`Reject ${a.full_name}'s application? They stay a normal student.`)) return;
    setBusy(a.id + decision);
    setMsg(null);
    const err = await mutate('ambassadors.review', { id: a.id, decision, referral_code: codes[a.id] || undefined });
    setBusy(null);
    if (err) return setMsg({ tone: 'error', text: err });
    setMsg({ tone: 'success', text: decision === 'approve' ? `${a.full_name} is now an ambassador.` : `${a.full_name}'s application was rejected.` });
    if (decision === 'approve') onApproved();
  };

  if (error) {
    return /ambassador_applications|does not exist|schema cache/i.test(error) ? <Notice tone="info">Run migration 0021 to receive ambassador applications.</Notice> : <Notice tone="error">{error}</Notice>;
  }
  return (
    <section className="admin-review" aria-labelledby="amb-apps-h">
      <h2 id="amb-apps-h" className="admin-review__title">
        Applications <span className="admin-review__count">{pending.length}</span>
      </h2>
      <p className="admin-section__sub">From “Apply to be a Campus Ambassador”. Chat to them on WhatsApp, then approve or reject.</p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {!data && <Skeleton shape="block" height="80px" label="Loading applications" />}
      {data && pending.length === 0 && <p className="admin-review__empty">No applications waiting.</p>}
      {pending.length > 0 && (
        <ul className="admin-list" role="list">
          {pending.map((a) => (
            <li key={a.id} className="admin-row admin-row--review">
              <div className="admin-row__main">
                <span className="admin-row__title">{a.full_name}</span>
                <span className="admin-row__meta">
                  {a.university} · {a.profile?.email ?? 'no email'} · applied {day(a.created_at)}
                </span>
                <p className="amb-admin__why">“{a.why}”</p>
              </div>
              <div className="admin-row__aside">
                <a className="btn" data-variant="secondary" data-size="sm" href={waLink(a.phone)} target="_blank" rel="noopener noreferrer">
                  WhatsApp {a.phone}
                </a>
                <Field
                  label="Code (optional)"
                  placeholder="Auto"
                  value={codes[a.id] ?? ''}
                  maxLength={16}
                  onChange={(e) => setCodes((c) => ({ ...c, [a.id]: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))}
                />
                <Button variant="quiet" size="sm" loading={busy === a.id + 'reject'} disabled={Boolean(busy)} onClick={() => void review(a, 'reject')}>
                  Reject
                </Button>
                <Button size="sm" loading={busy === a.id + 'approve'} disabled={Boolean(busy)} onClick={() => void review(a, 'approve')}>
                  Approve
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Campus Ambassadors. Earnings stay pending until an admin has sent the MoMo,
 * then "Mark as Paid" moves exactly that amount to paid (ambassador_mark_paid, 0018).
 */
export default function AdminAmbassadors() {
  const { data, error, mutate, reload } = useAdminData<Ambassador[]>('ambassadors.list');
  const rows = asArray(data);
  const pendingTotal = rows.reduce((n, a) => n + a.ambassador_pending_earnings_cents, 0);
  const paidTotal = rows.reduce((n, a) => n + a.ambassador_total_paid_cents, 0);

  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [open, setOpen] = useState<Ambassador | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState<'pay' | 'remove' | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [paidNote, setPaidNote] = useState<string | null>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setAddBusy(true);
    setAddError(null);
    const err = await mutate('ambassadors.add', { email: email.trim(), referral_code: code.trim() || undefined });
    setAddBusy(false);
    if (err) return setAddError(err);
    setEmail('');
    setCode('');
    setAdding(false);
  };

  const review = (a: Ambassador) => {
    setOpen(a);
    setDetail(null);
    setDetailError(null);
    setSheetError(null);
    setPaidNote(null);
    setReference('');
    adminCall<Detail>('ambassadors.detail', { id: a.id })
      .then(setDetail)
      .catch((e) => setDetailError(errorMessage(e)));
  };

  const markPaid = async () => {
    if (!open) return;
    const amount = open.ambassador_pending_earnings_cents;
    setBusy('pay');
    setSheetError(null);
    try {
      const r = await adminCall<{ pending_cents: number; paid_cents: number }>('ambassadors.mark_paid', { id: open.id, amount_cents: amount, reference: reference.trim() || undefined });
      setOpen({ ...open, ambassador_pending_earnings_cents: r.pending_cents, ambassador_total_paid_cents: r.paid_cents });
      setPaidNote(`Marked ${cedis(amount)} as paid.`);
      setReference('');
      reload();
      adminCall<Detail>('ambassadors.detail', { id: open.id }).then(setDetail).catch(() => {});
    } catch (e) {
      setSheetError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!open || !window.confirm(`Remove ${open.full_name ?? 'this ambassador'}? Their code stops working for new sign-ups; their history is kept.`)) return;
    setBusy('remove');
    const err = await mutate('ambassadors.remove', { id: open.id });
    setBusy(null);
    if (err) setSheetError(err);
    else setOpen(null);
  };

  return (
    <section className="admin-section" aria-labelledby="amb-h">
      <div className="admin-section__head">
        <div>
          <h1 id="amb-h" className="admin-section__title">Ambassadors</h1>
          <p className="admin-section__sub">
            GH₵ 5 lands in pending when a student who joined with their code first pays for Pro. Pay by MoMo at month end, then mark it paid here. Ambassadors can't cash out in the app.
          </p>
        </div>
        <Button icon={<Plus aria-hidden="true" />} onClick={() => { setAdding((v) => !v); setAddError(null); }} aria-expanded={adding}>
          Add ambassador
        </Button>
      </div>

      {adding && (
        <form className="admin-row admin-form" onSubmit={add}>
          <div className="admin-form__row">
            <Field label="Student's email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required hint="They must already have a student account." />
            <Field label="Referral code (optional)" placeholder="e.g. CHRIS10" value={code} maxLength={16} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} hint="Leave empty to make one from their first name." />
          </div>
          {addError && <Notice tone="error">{addError}</Notice>}
          <Button type="submit" loading={addBusy} disabled={!email.trim()}>
            Make ambassador
          </Button>
        </form>
      )}

      <ApplicationsPanel onApproved={reload} />

      {error && <Notice tone="error">{error}</Notice>}
      {!data && !error && <Skeleton shape="block" height="160px" label="Loading" />}
      {data && rows.length === 0 && <Notice tone="info">No ambassadors yet. Add a student by their email to give them a referral code.</Notice>}

      {rows.length > 0 && (
        <>
          <dl className="admin-details amb-admin__totals">
            <div><dt>Pending, all ambassadors</dt><dd>{cedis(pendingTotal)}</dd></div>
            <div><dt>Paid out so far</dt><dd>{cedis(paidTotal)}</dd></div>
          </dl>
          <motion.ul className="admin-list" role="list" variants={staggerParent} initial="hidden" animate="show">
            {rows.map((a) => (
              <motion.li key={a.id} className="admin-row" variants={riseItem}>
                <div className="admin-row__main">
                  <span className="admin-row__title">{a.full_name ?? a.email ?? 'Ambassador'}</span>
                  <span className="admin-row__meta">
                    {[a.email, a.phone].filter(Boolean).join(' · ')}
                  </span>
                  <span className="admin-row__meta">
                    {a.signups} sign-up{a.signups === 1 ? '' : 's'} · {a.upgrades} Pro upgrade{a.upgrades === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="admin-row__aside">
                  {a.referral_code && <Tag tone="gold">{a.referral_code}</Tag>}
                  <span className="admin-row__money" title="Pending">{cedis(a.ambassador_pending_earnings_cents)} pending</span>
                  <span className="admin-row__meta">{cedis(a.ambassador_total_paid_cents)} paid</span>
                  <Button size="sm" variant={a.ambassador_pending_earnings_cents > 0 ? 'primary' : 'secondary'} icon={<Wallet aria-hidden="true" />} onClick={() => review(a)}>
                    {a.ambassador_pending_earnings_cents > 0 ? 'Mark as Paid' : 'Details'}
                  </Button>
                </div>
              </motion.li>
            ))}
          </motion.ul>
        </>
      )}

      <Sheet variant="side" open={Boolean(open)} onClose={() => setOpen(null)} title={open?.full_name ?? 'Ambassador'} description={open?.referral_code ? `Code ${open.referral_code}` : undefined}>
        {open && (
          <div className="admin-form">
            <dl className="admin-details">
              <div><dt>Pending</dt><dd>{cedis(open.ambassador_pending_earnings_cents)}</dd></div>
              <div><dt>Paid out</dt><dd>{cedis(open.ambassador_total_paid_cents)}</dd></div>
              <div><dt>MoMo number</dt><dd>{open.phone ?? 'Not on their profile, ask in the WhatsApp group'}</dd></div>
            </dl>

            {paidNote && <Notice tone="success">{paidNote}</Notice>}
            {open.ambassador_pending_earnings_cents > 0 && (
              <section className="amb-admin__pay" aria-labelledby="pay-h">
                <h2 id="pay-h" className="admin-row__title">Pay {cedis(open.ambassador_pending_earnings_cents)}</h2>
                <p className="admin-section__sub">Check the referrals below, send the MoMo, then mark it paid. Only this amount moves; anything earned after you opened this stays pending.</p>
                <Field label="MoMo transaction ID (optional)" value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} />
                <Button icon={<BadgeCheck aria-hidden="true" />} loading={busy === 'pay'} onClick={() => void markPaid()}>
                  Mark as Paid
                </Button>
              </section>
            )}
            {sheetError && <Notice tone="error">{sheetError}</Notice>}

            <section aria-labelledby="refs-h" className="amb-admin__list">
              <h2 id="refs-h" className="admin-row__title">Paid referrals</h2>
              {detailError && <Notice tone="error">{detailError}</Notice>}
              {!detail && !detailError && <Skeleton shape="block" height="80px" label="Loading referrals" />}
              {detail && detail.rewards.length === 0 && <p className="admin-section__sub">No referred student has paid for Pro yet.</p>}
              {detail && detail.rewards.length > 0 && (
                <ul className="admin-list" role="list">
                  {detail.rewards.map((r) => (
                    <li key={r.id} className="admin-row">
                      <div className="admin-row__main">
                        <span className="admin-row__title">{r.student?.full_name ?? 'Deleted account'}</span>
                        <span className="admin-row__meta">
                          {[r.student?.email, r.student?.phone].filter(Boolean).join(' · ')}
                          {r.student ? ` · joined ${day(r.student.created_at)}` : ''}
                        </span>
                      </div>
                      <div className="admin-row__aside">
                        <span className="admin-row__meta">Pro {day(r.created_at)}</span>
                        <span className="admin-row__money">{cedis(r.amount_cents)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {detail && detail.payouts.length > 0 && (
              <section aria-labelledby="payouts-h" className="amb-admin__list">
                <h2 id="payouts-h" className="admin-row__title">Payouts</h2>
                <ul className="admin-list" role="list">
                  {detail.payouts.map((p) => (
                    <li key={p.id} className="admin-row">
                      <div className="admin-row__main">
                        <span className="admin-row__title">{cedis(p.amount_cents)}</span>
                        <span className="admin-row__meta">{day(p.created_at)}{p.reference ? ` · ${p.reference}` : ''}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <Button variant="quiet" icon={<UserMinus aria-hidden="true" />} loading={busy === 'remove'} disabled={open.ambassador_pending_earnings_cents > 0} onClick={() => void remove()}>
              {open.ambassador_pending_earnings_cents > 0 ? 'Pay pending earnings before removing' : 'Remove ambassador'}
            </Button>
          </div>
        )}
      </Sheet>
    </section>
  );
}
