import { getSupabase } from '../../lib/supabase';
import type { Course, CourseLesson } from './types';

export type CourseWithLessons = Course & { lessons: CourseLesson[] };

const COLS = 'id, slug, title, field, summary, level, published, lessons:course_lessons(id, course_id, position, title, youtube_id, channel, summary)';

export async function fetchCourses(): Promise<CourseWithLessons[]> {
  const { data, error } = await getSupabase().from('courses').select(COLS).eq('published', true).order('title');
  if (error) throw error;
  return ((data ?? []) as CourseWithLessons[]).map((c) => ({ ...c, lessons: [...c.lessons].sort((a, b) => a.position - b.position) }));
}

export async function fetchCourse(idOrSlug: string): Promise<CourseWithLessons | null> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
  const { data, error } = await getSupabase()
    .from('courses')
    .select(COLS)
    .eq(isUuid ? 'id' : 'slug', idOrSlug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const c = data as CourseWithLessons;
  return { ...c, lessons: [...c.lessons].sort((a, b) => a.position - b.position) };
}
