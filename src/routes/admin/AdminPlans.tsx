import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Button } from '../../components/Button/Button';
import { Field } from '../../components/Field/Field';
import { Switch } from '../../components/Switch/Switch';
import { Notice } from '../../components/Notice/Notice';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { asArray, useAdminData } from '../../features/admin/useAdminData';
import type { PlanRow } from '../../features/billing/types';
import { formatMoney, toCents } from '../../lib/money';
import { riseItem, staggerParent } from '../../lib/motion';

type Row = PlanRow & { active: boolean; paystack_plan_code: string | null };

function ProEditor({ plan, onSave }: { plan: Row; onSave: (p: Record<string, unknown>) => Promise<string | null> }) {
  const [price, setPrice] = useState(String(plan.amount_cents / 100));
  const [active, setActive] = useState(plan.active);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const cents = toCents(price);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!cents || cents < 100) return setMsg({ tone: 'error', text: 'Enter a monthly price of at least GHS 1.' });
    setBusy(true);
    // The AI allowance is the same for every plan (Settings), so Pro has no limit of its own.
    const err = await onSave({ amount_cents: cents, ai_daily_limit: null, active });
    setBusy(false);
    setMsg(
      err
        ? { tone: 'error', text: err }
        : { tone: 'success', text: cents !== plan.amount_cents ? 'Saved. A new Paystack plan is created at the next card checkout; existing card subscribers keep their current price.' : 'Saved.' },
    );
  };

  return (
    <motion.form className="admin-row admin-form" variants={riseItem} onSubmit={submit}>
      <h2 className="admin-row__title">Afriversity Pro</h2>
      <p className="admin-section__sub">
        Human support: a counsellor on WhatsApp, CV &amp; essay strategy sessions and priority support, plus the Scholarship Matcher, full Application Tracker and insider guides. The AI is free for everyone (daily limit in Settings). Cards renew automatically each month; Mobile Money buys one month at a time.
      </p>
      <Field label="Price per month (GHS)" type="number" inputMode="decimal" min={1} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} hint={cents ? formatMoney(cents, 'GHS') : undefined} />
      <Switch label="On sale" hint={active ? 'Students can subscribe' : 'Checkout is closed'} onText="Yes" offText="No" checked={active} onChange={setActive} />
      <p className="admin-row__meta">Paystack plan: {plan.paystack_plan_code ?? 'created automatically at the first card checkout'}</p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Button type="submit" loading={busy}>
        Save Pro
      </Button>
    </motion.form>
  );
}

export default function AdminPlans() {
  const { data, error, mutate } = useAdminData<Row[]>('plans.list');
  const pro = asArray(data).find((p) => p.code === 'pro');
  return (
    <section className="admin-section" aria-labelledby="p-h">
      <div className="admin-section__head">
        <div>
          <h1 id="p-h" className="admin-section__title">Pro plan</h1>
          <p className="admin-section__sub">One paid tier, billed in GHS. paystack-init always charges the price stored here.</p>
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {!data && !error && <Skeleton shape="block" height="160px" label="Loading" />}
      {data && !pro && <Notice tone="error">The Pro plan row is missing. Run migration 0016 in the SQL Editor.</Notice>}
      {pro && (
        <motion.div className="admin-list" variants={staggerParent} initial="hidden" animate="show">
          <ProEditor plan={pro} onSave={(payload) => mutate('plans.update', payload)} />
        </motion.div>
      )}
    </section>
  );
}
