import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { BookOpen, Compass, PenLine, PlayCircle, Users } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Chip } from '../../components/Chip/Chip';
import { ListRow } from '../../components/ListRow/ListRow';
import { ListSkeleton } from '../../components/Skeleton/Skeleton';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Notice } from '../../components/Notice/Notice';
import { fetchCourses, type CourseWithLessons } from '../../features/courses/api';
import { FIELDS } from '../../features/onboarding/options';
import { useAuth } from '../../features/auth/useAuth';
import { errorMessage } from '../../lib/supabase';
import { lift, press, riseItem, staggerParent } from '../../lib/motion';
import './Courses.css';

const MotionLink = motion.create(Link);

/** Course thumbnail with scroll parallax: the image drifts inside its frame as the card crosses the viewport. */
function CourseThumb({ youtubeId }: { youtubeId?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? ['0%', '0%'] : ['-7%', '7%']);
  return (
    <span ref={ref} className="course-card__media">
      {youtubeId && <motion.img className="course-card__thumb" style={{ y }} src={`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`} alt="" loading="lazy" />}
    </span>
  );
}

export default function Courses() {
  const { profile } = useAuth();
  const [courses, setCourses] = useState<CourseWithLessons[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Default to the student's field_of_interest; "All" shows everything.
  const [field, setField] = useState<string>(profile?.field_of_interest ?? 'All');

  useEffect(() => {
    fetchCourses()
      .then(setCourses)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const fieldsWithCourses = useMemo(() => {
    const set = new Set((courses ?? []).map((c) => c.field));
    return FIELDS.filter((f) => set.has(f));
  }, [courses]);

  const visible = (courses ?? []).filter((c) => field === 'All' || c.field === field);

  return (
    <PageTransition label="Learn">
      <div className="container learn">
        <PageHeader eyebrow="Learn" title="Grow at your own pace" />

        <motion.div className="learn__hub" variants={staggerParent} initial="hidden" animate="show">
          <ListRow to="/career-compass" icon={Compass} label="Career Compass" detail="Quick answers about scholarships and universities" />
          <ListRow to="/mentors" icon={Users} label="Mentors" detail="Book a 1:1 with someone who has done it" />
          <ListRow to="/essay-review" icon={PenLine} label="AI Essay Reviewer" detail="Score and fix your personal statement" badge="Pro" />
        </motion.div>

        <section className="learn__courses" aria-labelledby="courses-h">
          <h2 id="courses-h" className="learn__h2">
            Micro-courses
          </h2>
          <div className="learn__filters" role="radiogroup" aria-label="Filter courses by field">
            <Chip kind="radio" selected={field === 'All'} onToggle={() => setField('All')}>
              All
            </Chip>
            {fieldsWithCourses.map((f) => (
              <Chip key={f} kind="radio" selected={field === f} onToggle={() => setField(f)}>
                {f}
              </Chip>
            ))}
          </div>

          {error && <Notice tone="error">Courses couldn't load: {error}</Notice>}
          {!courses && !error && (
            <ListSkeleton kind="course" count={4} label="Loading courses" className="learn__grid" />
          )}

          {courses && (
            <AnimatePresence mode="wait">
              <motion.div key={field} className="learn__grid" variants={staggerParent} initial="hidden" animate="show" exit={{ opacity: 0 }}>
                {visible.map((c) => (
                  <MotionLink key={c.id} to={`/courses/${c.slug}`} className="course-card" variants={riseItem} whileHover={lift} whileTap={press}>
                    <CourseThumb youtubeId={c.lessons[0]?.youtube_id} />
                    <div className="course-card__body">
                      <p className="course-card__field">{c.field}</p>
                      <h3 className="course-card__title">{c.title}</h3>
                      <p className="course-card__summary">{c.summary}</p>
                      <p className="course-card__meta">
                        <PlayCircle aria-hidden="true" /> {c.lessons.length} lessons · {c.level}
                      </p>
                    </div>
                  </MotionLink>
                ))}
                {visible.length === 0 && (
                  <EmptyState icon={BookOpen} title={`No ${field} course yet`}>
                    <p>New tracks are added by the Afriversity team. Try another field for now.</p>
                  </EmptyState>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </section>
      </div>
    </PageTransition>
  );
}
