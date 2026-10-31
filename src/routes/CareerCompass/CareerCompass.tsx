import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, PlayCircle, RotateCcw } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Sheet } from '../../components/Sheet/Sheet';
import { Button } from '../../components/Button/Button';
import { ChatThread } from '../../features/ai/ChatThread';
import { useChat } from '../../features/ai/useChat';
import type { CareerCard } from '../../features/ai/types';
import { VideoCarousel } from '../../features/videos/VideoCarousel';
import { useAuth } from '../../features/auth/useAuth';
import { press, riseItem, staggerParent } from '../../lib/motion';
import './CareerCompass.css';

function CareerCards({ careers, onWatch }: { careers: CareerCard[]; onWatch: (c: CareerCard) => void }) {
  return (
    <motion.ul className="career-cards" role="list" variants={staggerParent} initial="hidden" animate="show">
      {careers.map((c) => (
        <motion.li key={c.title} className="career-card" variants={riseItem}>
          <p className="career-card__field">{c.field}</p>
          <h3 className="career-card__title">{c.title}</h3>
          <p className="career-card__why">{c.why}</p>
          {c.first_steps.length > 0 && (
            <ol className="career-card__steps">
              {c.first_steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
          <motion.button type="button" className="career-card__watch" whileTap={press} onClick={() => onWatch(c)}>
            <PlayCircle aria-hidden="true" />
            Watch a day in the life
            <ChevronRight aria-hidden="true" />
          </motion.button>
        </motion.li>
      ))}
    </motion.ul>
  );
}

export default function CareerCompass() {
  const { profile } = useAuth();
  const chat = useChat('career');
  const [watching, setWatching] = useState<CareerCard | null>(null);
  const field = profile?.field_of_interest;

  const suggestions = [
    field ? `Which scholarships fit ${field}?` : 'Which scholarships are open now?',
    'Which careers fit my field?',
    'Help me build my CV',
    'Practise an interview with me',
  ];

  return (
    <PageTransition label="Career Compass">
      <div className="container compass">
        <PageHeader
          back={{ to: '/courses', label: 'Learn' }}
          eyebrow="Career Compass"
          title="Ask your counsellor"
          lede="Career advice, essay feedback, CV building and interview practice, backed by Afriversity’s scholarships, universities and courses."
          aside={
            chat.messages.length > 0 ? (
              <Button variant="quiet" size="sm" icon={<RotateCcw aria-hidden="true" />} onClick={chat.reset}>
                New chat
              </Button>
            ) : undefined
          }
        />
        <ChatThread
          messages={chat.messages}
          loading={chat.loading}
          sending={chat.sending}
          error={chat.error}
          limit={chat.limit}
          usage={chat.usage}
          onSend={chat.send}
          placeholder="Ask about careers or scholarships, or paste your essay or CV…"
          suggestions={suggestions}
          emptyTitle="Where would you like to start?"
          renderExtra={(m) => (m.careers && m.careers.length > 0 ? <CareerCards careers={m.careers} onWatch={setWatching} /> : null)}
        />
      </div>

      <Sheet open={Boolean(watching)} onClose={() => setWatching(null)} title={watching ? `A day as a ${watching.title}` : ''}>
        {watching && <VideoCarousel query={watching.day_in_life_query} />}
      </Sheet>
    </PageTransition>
  );
}
