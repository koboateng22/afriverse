import { motion } from 'framer-motion';
import { TriangleAlert } from 'lucide-react';
import type { ConfigError } from '../../lib/supabase';
import './ConfigErrorScreen.css';

/** Loud, explicit failure when required env vars are missing — never a fake success. */
export function ConfigErrorScreen({ error }: { error: ConfigError }) {
  return (
    <main className="screen" data-bare>
      <motion.section
        className="container config-error"
        role="alert"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32 }}
      >
        <TriangleAlert className="config-error__icon" aria-hidden="true" />
        <h1 className="config-error__title">Backend not configured</h1>
        <p>This screen needs Supabase, but these environment variables are missing:</p>
        <ul className="config-error__list">
          {error.missing.map((m) => (
            <li key={m}>
              <code>{m}</code>
            </li>
          ))}
        </ul>
        <p>
          Copy <code>.env.example</code> to <code>.env</code>, add your Supabase project URL and anon key, then restart <code>npm run dev</code>.
        </p>
      </motion.section>
    </main>
  );
}
