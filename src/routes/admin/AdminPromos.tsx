import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Button } from '../../components/Button/Button';
import { Field } from '../../components/Field/Field';
import { Switch } from '../../components/Switch/Switch';
import { Notice } from '../../components/Notice/Notice';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { Tag } from '../../components/Chip/Chip';
import { asArray, useAdminData } from '../../features/admin/useAdminData';
import { discountedCents, fetchProPlan } from '../../features/billing/api';
import { formatMoney } from '../../lib/money';
import { riseItem, staggerParent } from '../../lib/motion';

type Promo = { id: string; code: string; discount_percentage: number; is_active: boolean; created_at: string; uses: number };
type Msg = { tone: 'error' | 'success'; text: string };

const CODE = /^[A-Z0-9_-]{3,32}$/;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Admin → Promo codes: create codes, switch them on or off, and see how often each was used. */
export default function AdminPromos() {
  const { data, error, mutate } = useAdminData<Promo[]>('promos.list');
  const promos = asArray(data);
  const [proCents, setProCents] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [percent, setPercent] = useState('20');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);

  useEffect(() => {
    fetchProPlan()
      .then((p) => setProCents(p?.amount_cents ?? null))
      .catch(() => undefined);
  }, []);

  const pct = Number(percent);
  const pctOk = Number.isInteger(pct) && pct >= 1 && pct <= 90;
  const priceWith = (p: number) => (proCents ? formatMoney(discountedCents(proCents, p), 'GHS') : null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!CODE.test(c)) return setMsg({ tone: 'error', text: 'Codes use letters, numbers, - and _ only (3–32 characters), e.g. WAITLIST20.' });
    if (!pctOk) return setMsg({ tone: 'error', text: 'Enter a whole-number discount from 1 to 90%.' });
    setBusy('create');
    const err = await mutate('promos.create', { code: c, discount_percentage: pct, is_active: true });
    setBusy(null);
    if (err) return setMsg({ tone: 'error', text: err });
    setMsg({ tone: 'success', text: `${c} created: ${pct}% off${priceWith(pct) ? `, so Pro costs ${priceWith(pct)} a month` : ''}.` });
    setCode('');
  };

  const toggle = async (p: Promo, on: boolean) => {
    setBusy(p.id);
    const err = await mutate('promos.update', { id: p.id, is_active: on });
    setBusy(null);
    setMsg(err ? { tone: 'error', text: err } : { tone: 'success', text: `${p.code} is ${on ? 'on: students can use it' : 'off: it no longer gives a discount'}.` });
  };

  return (
    <section className="admin-section" aria-labelledby="promo-h">
      <div className="admin-section__head">
        <div>
          <h1 id="promo-h" className="admin-section__title">Promo codes</h1>
          <p className="admin-section__sub">
            A code takes a percentage off Pro{proCents ? ` (${formatMoney(proCents, 'GHS')} a month)` : ''}. Students type it on the Pro page; the server checks it again before Paystack charges. Card
            subscriptions keep the discount on every renewal; Mobile Money pays one month at a time.
          </p>
        </div>
      </div>

      <motion.form className="admin-row admin-form" onSubmit={create} variants={riseItem} initial="hidden" animate="show" noValidate>
        <h3 className="admin-row__title">New code</h3>
        <div className="admin-form__row">
          <Field
            label="Code"
            placeholder="e.g. WAITLIST20"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={32}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
            required
          />
          <Field
            label="Discount (%)"
            type="number"
            inputMode="numeric"
            min={1}
            max={90}
            step={1}
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            hint={pctOk && priceWith(pct) ? `Pro becomes ${priceWith(pct)} a month` : '1 to 90'}
            required
          />
        </div>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <div className="admin-form__actions">
          <Button type="submit" loading={busy === 'create'} disabled={!code.trim() || !pctOk}>
            Create code
          </Button>
        </div>
      </motion.form>

      {error && <Notice tone="error">{error}</Notice>}
      {!data && !error && <Skeleton shape="block" height="120px" label="Loading promo codes" />}
      {data && promos.length === 0 && <p className="admin-review__empty">No promo codes yet.</p>}
      {promos.length > 0 && (
        <motion.ul className="admin-list" role="list" variants={staggerParent} initial="hidden" animate="show">
          {promos.map((p) => (
            <motion.li key={p.id} className="admin-row" variants={riseItem}>
              <div className="admin-row__main">
                <span className="admin-row__title" translate="no">
                  {p.code}
                </span>
                <span className="admin-row__meta">
                  {p.discount_percentage}% off{priceWith(p.discount_percentage) ? ` → ${priceWith(p.discount_percentage)} a month` : ''} · created {day(p.created_at)}
                </span>
              </div>
              <div className="admin-row__aside">
                <Tag tone={p.uses > 0 ? 'emerald' : 'neutral'}>
                  Used {p.uses} {p.uses === 1 ? 'time' : 'times'}
                </Tag>
                <Switch
                  label="Active"
                  onText="Yes"
                  offText="No"
                  checked={p.is_active}
                  onChange={(on) => {
                    if (busy !== p.id) void toggle(p, on);
                  }}
                />
              </div>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </section>
  );
}
