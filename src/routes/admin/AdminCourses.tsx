import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Pencil, Plus, PlayCircle } from 'lucide-react';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { Field, SelectField, TextAreaField } from '../../components/Field/Field';
import { Notice } from '../../components/Notice/Notice';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { Tag } from '../../components/Chip/Chip';
import { asArray, slugify, useAdminData } from '../../features/admin/useAdminData';
import { FIELDS } from '../../features/onboarding/options';
import type { Course, CourseLesson } from '../../features/courses/types';
import { riseItem, staggerParent } from '../../lib/motion';

type CourseRow = Course & { lessons: CourseLesson[] };
type CourseForm = { id?: string; title: string; slug: string; field: string; summary: string; level: string; published: boolean };
type LessonForm = { id?: string; course_id: string; position: string; title: string; youtube_id: string; channel: string; summary: string };

const LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const;

/** Pulls the 11-char id out of a pasted YouTube link (server re-checks). */
function videoId(input: string): string | null {
  const m = input.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(input.trim()) ? input.trim() : null;
}

export default function AdminCourses() {
  const { data, error, mutate } = useAdminData<CourseRow[]>('courses.list');
  const [course, setCourse] = useState<CourseForm | null>(null);
  const [lesson, setLesson] = useState<LessonForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const saveCourse = async (e: FormEvent) => {
    e.preventDefault();
    if (!course) return;
    setSaving(true);
    setFormError(null);
    const err = await mutate(course.id ? 'courses.update' : 'courses.create', { ...course, slug: course.slug || slugify(course.title) });
    setSaving(false);
    if (err) setFormError(err);
    else setCourse(null);
  };

  const saveLesson = async (e: FormEvent) => {
    e.preventDefault();
    if (!lesson) return;
    setSaving(true);
    setFormError(null);
    const err = await mutate(lesson.id ? 'lessons.update' : 'lessons.create', { ...lesson, position: Number(lesson.position) });
    setSaving(false);
    if (err) setFormError(err);
    else setLesson(null);
  };

  const removeLesson = async () => {
    if (!lesson?.id || !window.confirm('Delete this lesson?')) return;
    const err = await mutate('lessons.delete', { id: lesson.id });
    if (err) setFormError(err);
    else setLesson(null);
  };

  const preview = lesson ? videoId(lesson.youtube_id) : null;

  return (
    <section className="admin-section" aria-labelledby="c-h">
      <div className="admin-section__head">
        <div>
          <h1 id="c-h" className="admin-section__title">Courses</h1>
          <p className="admin-section__sub">Each course belongs to one field; students see their field first.</p>
        </div>
        <Button icon={<Plus aria-hidden="true" />} onClick={() => { setFormError(null); setCourse({ title: '', slug: '', field: FIELDS[0], summary: '', level: 'Beginner', published: true }); }}>
          Add course
        </Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {!data && !error && <Skeleton shape="block" height="160px" label="Loading" />}
      {data && (
        <motion.ul className="admin-list" role="list" variants={staggerParent} initial="hidden" animate="show">
          {asArray(data).map((c) => {
            const lessons = asArray(c.lessons);
            return (
            <motion.li key={c.id} className="admin-row" variants={riseItem} data-muted={!c.published || undefined}>
              <div className="admin-row__main">
                <span className="admin-row__title">{c.title}</span>
                <span className="admin-row__meta">
                  {c.field} · {c.level} · {lessons.length} lessons
                </span>
                <span className="admin-row__meta">
                  {[...lessons].sort((a, b) => a.position - b.position).map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className="admin-lesson-link"
                      onClick={() => { setFormError(null); setLesson({ id: l.id, course_id: c.id, position: String(l.position), title: l.title, youtube_id: l.youtube_id, channel: l.channel ?? '', summary: l.summary ?? '' }); }}
                    >
                      <PlayCircle aria-hidden="true" /> {l.position}. {l.title}
                    </button>
                  ))}
                </span>
              </div>
              <div className="admin-row__aside">
                {!c.published && <Tag>Draft</Tag>}
                <Button variant="secondary" size="sm" icon={<Plus aria-hidden="true" />} onClick={() => { setFormError(null); setLesson({ course_id: c.id, position: String(lessons.length + 1), title: '', youtube_id: '', channel: '', summary: '' }); }}>
                  Lesson
                </Button>
                <Button variant="secondary" size="sm" icon={<Pencil aria-hidden="true" />} onClick={() => { setFormError(null); setCourse({ id: c.id, title: c.title, slug: c.slug, field: c.field, summary: c.summary, level: c.level, published: c.published }); }}>
                  Edit
                </Button>
              </div>
            </motion.li>
            );
          })}
        </motion.ul>
      )}

      <Sheet variant="side" open={Boolean(course)} onClose={() => setCourse(null)} title={course?.id ? 'Edit course' : 'Add course'}>
        {course && (
          <form className="admin-form" onSubmit={saveCourse}>
            <Field label="Title" value={course.title} onChange={(e) => setCourse({ ...course, title: e.target.value })} required />
            <Field label="Slug" value={course.slug} placeholder={slugify(course.title)} onChange={(e) => setCourse({ ...course, slug: slugify(e.target.value) })} />
            <div className="admin-form__row">
              <SelectField label="Field" options={FIELDS} value={course.field} onChange={(e) => setCourse({ ...course, field: e.target.value })} />
              <SelectField label="Level" options={LEVELS} value={course.level} onChange={(e) => setCourse({ ...course, level: e.target.value })} />
            </div>
            <TextAreaField label="Summary" maxLength={400} value={course.summary} onChange={(e) => setCourse({ ...course, summary: e.target.value })} />
            <label className="admin-form__toggle">
              <input type="checkbox" checked={course.published} onChange={(e) => setCourse({ ...course, published: e.target.checked })} />
              Published
            </label>
            {formError && <Notice tone="error">{formError}</Notice>}
            <div className="admin-form__actions">
              <span />
              <Button type="submit" loading={saving}>Save</Button>
            </div>
          </form>
        )}
      </Sheet>

      <Sheet variant="side" open={Boolean(lesson)} onClose={() => setLesson(null)} title={lesson?.id ? 'Edit lesson' : 'Add lesson'}>
        {lesson && (
          <form className="admin-form" onSubmit={saveLesson}>
            <div className="admin-form__row">
              <Field label="Position" inputMode="numeric" value={lesson.position} onChange={(e) => setLesson({ ...lesson, position: e.target.value.replace(/\D/g, '') })} />
              <Field label="Channel" value={lesson.channel} onChange={(e) => setLesson({ ...lesson, channel: e.target.value })} />
            </div>
            <Field label="Title" value={lesson.title} onChange={(e) => setLesson({ ...lesson, title: e.target.value })} required />
            <Field label="YouTube link or video id" value={lesson.youtube_id} onChange={(e) => setLesson({ ...lesson, youtube_id: e.target.value })} required error={lesson.youtube_id && !preview ? 'That doesn’t look like a YouTube link' : null} />
            {preview && <img className="admin-lesson-thumb" src={`https://i.ytimg.com/vi/${preview}/hqdefault.jpg`} alt="Video thumbnail preview" />}
            <TextAreaField label="Summary" maxLength={400} value={lesson.summary} onChange={(e) => setLesson({ ...lesson, summary: e.target.value })} />
            {formError && <Notice tone="error">{formError}</Notice>}
            <div className="admin-form__actions">
              {lesson.id ? <Button variant="quiet" onClick={removeLesson}>Delete</Button> : <span />}
              <Button type="submit" loading={saving} disabled={!preview}>Save</Button>
            </div>
          </form>
        )}
      </Sheet>
    </section>
  );
}
