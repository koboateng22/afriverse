import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Mail, Sparkles } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { Skeleton, CardSkeleton } from '../../components/Skeleton/Skeleton';
import { Field, SelectField, TextAreaField } from '../../components/Field/Field';
import { Chip, Tag } from '../../components/Chip/Chip';
import { Sheet } from '../../components/Sheet/Sheet';
import { ProgressDots } from '../../components/ProgressDots/ProgressDots';
import { ProgressRing } from '../../components/ProgressRing/ProgressRing';
import { SaveButton } from '../../features/opportunities/SaveButton';
import { FIELDS } from '../../features/onboarding/options';
import { riseItem, staggerParent } from '../../lib/motion';
import './Scratch.css';

/** /scratch — living gallery of every primitive in every state. Not linked anywhere. */
export default function Scratch() {
  const [sheet, setSheet] = useState(false);
  const [chip, setChip] = useState<string>(FIELDS[0]);
  const [saved, setSaved] = useState(false);
  const [dot, setDot] = useState(1);
  const [loading, setLoading] = useState(false);

  return (
    <PageTransition bare label="Component gallery">
      <motion.div className="container scratch" variants={staggerParent} initial="hidden" animate="show">
        <motion.header variants={riseItem}>
          <p className="eyebrow">/scratch</p>
          <h1 className="scratch__title">Primitives</h1>
        </motion.header>

        <motion.section className="scratch__section" variants={riseItem} aria-labelledby="s-btn">
          <h2 id="s-btn">Button</h2>
          <div className="scratch__row">
            <Button iconEnd={<ArrowRight aria-hidden="true" />}>Primary</Button>
            <Button variant="gold" icon={<Sparkles aria-hidden="true" />}>Gold</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="quiet">Quiet</Button>
          </div>
          <div className="scratch__row">
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Button disabled>Disabled</Button>
            <Button
              loading={loading}
              onClick={() => {
                setLoading(true);
                window.setTimeout(() => setLoading(false), 1500);
              }}
            >
              Click to load
            </Button>
          </div>
        </motion.section>

        <motion.section className="scratch__section" variants={riseItem} aria-labelledby="s-card">
          <h2 id="s-card">Card</h2>
          <motion.div className="scratch__cards" variants={staggerParent}>
            <Card>
              <h3>Default</h3>
              <p>Static surface.</p>
            </Card>
            <Card tone="raised" interactive tabIndex={0}>
              <h3>Raised + interactive</h3>
              <p>Hover lifts 4px with a shadow bloom; press scales to .97.</p>
            </Card>
            <Card tone="outline">
              <h3>Outline</h3>
              <p>For secondary groupings.</p>
            </Card>
          </motion.div>
        </motion.section>

        <motion.section className="scratch__section" variants={riseItem} aria-labelledby="s-skel">
          <h2 id="s-skel">Skeleton</h2>
          <Skeleton width="70%" />
          <Skeleton width="40%" height="20px" shape="block" />
          <CardSkeleton />
        </motion.section>

        <motion.section className="scratch__section" variants={riseItem} aria-labelledby="s-field">
          <h2 id="s-field">Field</h2>
          <Field label="Email" icon={<Mail />} placeholder="you@example.com" hint="We never share it." />
          <Field label="With error" defaultValue="not-an-email" error="Enter a valid email address." />
          <SelectField label="Field of interest" options={FIELDS} placeholder="Choose one" />
          <TextAreaField label="Bio" placeholder="A sentence about you" />
        </motion.section>

        <motion.section className="scratch__section" variants={riseItem} aria-labelledby="s-chip">
          <h2 id="s-chip">Chip + Tag</h2>
          <div className="scratch__row" role="radiogroup" aria-label="Fields">
            {FIELDS.slice(0, 5).map((f) => (
              <Chip key={f} kind="radio" selected={chip === f} onToggle={() => setChip(f)} layoutGroup="scratch">
                {f}
              </Chip>
            ))}
          </div>
          <div className="scratch__row">
            <Tag>Neutral</Tag>
            <Tag tone="gold">Opens 9 Mar 2027</Tag>
            <Tag tone="urgent">Closes in 5 days</Tag>
            <Tag tone="emerald">Rolling intake</Tag>
          </div>
        </motion.section>

        <motion.section className="scratch__section" variants={riseItem} aria-labelledby="s-misc">
          <h2 id="s-misc">Save · Progress</h2>
          <div className="scratch__row">
            <SaveButton saved={saved} onToggle={() => setSaved((s) => !s)} label="example" />
            <ProgressRing percent={72} size={88} label="Example progress" />
            <button type="button" className="scratch__dots" onClick={() => setDot((d) => (d + 1) % 4)} aria-label="Advance progress dots">
              <ProgressDots count={4} active={dot} />
            </button>
          </div>
        </motion.section>

        <motion.section className="scratch__section" variants={riseItem} aria-labelledby="s-sheet">
          <h2 id="s-sheet">Sheet</h2>
          <div>
            <Button variant="secondary" onClick={() => setSheet(true)}>
              Open sheet
            </Button>
          </div>
        </motion.section>
      </motion.div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Example sheet" footer={<Button block onClick={() => setSheet(false)}>Done</Button>}>
        <p>Springs in from scale .94. Drag down, press Escape, or tap outside to close. Focus stays trapped inside.</p>
      </Sheet>
    </PageTransition>
  );
}
