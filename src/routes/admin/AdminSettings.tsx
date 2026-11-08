import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle } from 'lucide-react';
import { Button } from '../../components/Button/Button';
import { Field } from '../../components/Field/Field';
import { Notice } from '../../components/Notice/Notice';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { useAdminData } from '../../features/admin/useAdminData';
import { riseItem } from '../../lib/motion';

type Settings = { support_whatsapp?: string; counselor_whatsapp?: string; counselor_hours?: string; free_ai_daily_limit?: number };
type Draft = { support_whatsapp: string; counselor_whatsapp: string; counselor_hours: string; free_ai_daily_limit: string };

export default function AdminSettings() {
  const { data, error, mutate } = useAdminData<Settings>('settings.get');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setDraft({
      support_whatsapp: data.support_whatsapp ?? '',
      counselor_whatsapp: data.counselor_whatsapp ?? '',
      counselor_hours: data.counselor_hours ?? '',
      free_ai_daily_limit: String(data.free_ai_daily_limit ?? 50),
    });
  }, [data]);

  const set = (k: keyof Draft, v: string) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setMsg(null);
    const err = await mutate('settings.update', { ...draft, free_ai_daily_limit: Number(draft.free_ai_daily_limit || 0) });
    setBusy(false);
    setMsg(err ? { tone: 'error', text: err } : { tone: 'success', text: 'Settings saved.' });
  };

  return (
    <section className="admin-section" aria-labelledby="s-h">
      <div className="admin-section__head">
        <div>
          <h1 id="s-h" className="admin-section__title">Settings</h1>
          <p className="admin-section__sub">WhatsApp numbers students see, and the free-tier AI allowance.</p>
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {!draft && !error && <Skeleton shape="block" height="200px" label="Loading" />}
      {draft && (
        <motion.form className="admin-row admin-form" variants={riseItem} initial="hidden" animate="show" onSubmit={save}>
          <Field
            label="Support WhatsApp number"
            icon={<MessageCircle />}
            inputMode="tel"
            placeholder="+233551234987"
            value={draft.support_whatsapp}
            onChange={(e) => set('support_whatsapp', e.target.value)}
            hint={'Powers “Need help? Send your documents via WhatsApp.” on the application form. Leave blank to hide the button.'}
          />
          <div className="admin-form__row">
            <Field label="Counsellor WhatsApp number (Pro)" icon={<MessageCircle />} inputMode="tel" placeholder="+233201234567" value={draft.counselor_whatsapp} onChange={(e) => set('counselor_whatsapp', e.target.value)} />
            <Field label="Counsellor hours" placeholder="Mon–Fri, 9am–5pm GMT" value={draft.counselor_hours} onChange={(e) => set('counselor_hours', e.target.value)} maxLength={80} />
          </div>
          <Field
            label="AI messages per student per day"
            inputMode="numeric"
            value={draft.free_ai_daily_limit}
            onChange={(e) => set('free_ai_daily_limit', e.target.value.replace(/\D/g, '').slice(0, 3))}
            hint="The AI is free for every student, Free or Pro. This only stops spam: past this many messages in 24 hours, the AI pauses for that student. Default 50."
          />
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <Button type="submit" loading={busy}>
            Save settings
          </Button>
        </motion.form>
      )}
    </section>
  );
}
