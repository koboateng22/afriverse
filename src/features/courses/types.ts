/** Row shapes of public.courses and public.course_lessons. */
export type Course = {
  id: string;
  slug: string;
  title: string;
  field: string;
  summary: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  published: boolean;
};

export type CourseLesson = {
  id: string;
  course_id: string;
  position: number;
  title: string;
  youtube_id: string;
  channel: string | null;
  summary: string | null;
};
