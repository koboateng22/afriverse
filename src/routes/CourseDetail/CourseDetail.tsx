import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, MessageCircleQuestion, SearchX } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Notice } from '../../components/Notice/Notice';
import { YouTubePlayer } from '../../features/videos/YouTubePlayer';
import { fetchCourse, type CourseWithLessons } from '../../features/courses/api';
import { ChatThread } from '../../features/ai/ChatThread';
import { useChat } from '../../features/ai/useChat';
import type { CourseLesson } from '../../features/courses/types';
import { errorMessage } from '../../lib/supabase';
import { riseItem, staggerParent } from '../../lib/motion';
import './CourseDetail.css';

function LessonTutor({ lesson }: { lesson: CourseLesson }) {
  const chat = useChat('lesson', lesson.id);
  return (
    <ChatThread
      messages={chat.messages}
      loading={chat.loading}
      sending={chat.sending}
      error={chat.error}
      limit={chat.limit}
      usage={chat.usage}
      onSend={chat.send}
      placeholder={`Ask about “${lesson.title}”…`}
      emptyTitle="Ask anything about this lesson"
      suggestions={['Summarise the key ideas', 'Explain it like I’m new to this', 'Give me a quick practice question']}
    />
  );
}

export default function CourseDetail() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const [course, setCourse] = useState<CourseWithLessons | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    fetchCourse(id)
      .then(setCourse)
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  const lessonNo = Math.max(1, Number(params.get('lesson') ?? 1));
  const lesson = course?.lessons.find((l) => l.position === lessonNo) ?? course?.lessons[0];

  if (course === null) {
    return (
      <PageTransition label="Course not found">
        <div className="container">
          <PageHeader back={{ to: '/courses', label: 'Learn' }} title="Course not found" />
          <EmptyState icon={SearchX} title="This course isn't available">
            <p>It may have been unpublished. Browse the other tracks instead.</p>
          </EmptyState>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition label={course?.title ?? 'Course'}>
      <div className="container course">
        <PageHeader back={{ to: '/courses', label: 'Learn' }} eyebrow={course?.field ?? ' '} title={course?.title ?? 'Loading course'} />
        {error && <Notice tone="error">{error}</Notice>}

        {!course || !lesson ? (
          <Skeleton shape="block" height="220px" label="Loading lesson" />
        ) : (
          <>
            <section className="course__player" aria-label="Lesson video">
              <YouTubePlayer videoId={lesson.youtube_id} title={lesson.title} />
              <motion.div className="course__now" key={lesson.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <p className="eyebrow">
                  Lesson {lesson.position} of {course.lessons.length} · {lesson.channel}
                </p>
                <h2 className="course__lesson-title">{lesson.title}</h2>
                {lesson.summary && <p>{lesson.summary}</p>}
              </motion.div>
              <Button size="lg" block icon={<MessageCircleQuestion aria-hidden="true" />} onClick={() => setAsking(true)}>
                Ask AI about this lesson
              </Button>
            </section>

            <section aria-labelledby="outline-h" className="course__outline">
              <h2 id="outline-h" className="course__h2">
                Outline
              </h2>
              <motion.ol className="outline" role="list" variants={staggerParent} initial="hidden" animate="show">
                {course.lessons.map((l) => {
                  const current = l.id === lesson.id;
                  const done = l.position < lesson.position;
                  return (
                    <motion.li key={l.id} variants={riseItem}>
                      <button
                        type="button"
                        className="outline__item"
                        aria-current={current ? 'step' : undefined}
                        onClick={() => {
                          setParams({ lesson: String(l.position) }, { replace: true });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        {done ? <CheckCircle2 aria-hidden="true" className="outline__icon" data-done /> : <Circle aria-hidden="true" className="outline__icon" />}
                        <span className="outline__text">
                          <span className="outline__title">
                            {l.position}. {l.title}
                          </span>
                          {l.channel && <span className="outline__channel">{l.channel}</span>}
                        </span>
                      </button>
                    </motion.li>
                  );
                })}
              </motion.ol>
            </section>
          </>
        )}
      </div>

      <Sheet open={asking && Boolean(lesson)} onClose={() => setAsking(false)} title={lesson ? `Ask about: ${lesson.title}` : ''}>
        {lesson && <LessonTutor key={lesson.id} lesson={lesson} />}
      </Sheet>
    </PageTransition>
  );
}
