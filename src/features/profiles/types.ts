/** Row shape of public.profiles. */
export type Role = 'student' | 'mentor' | 'admin' | 'ambassador' | 'pending_ambassador';

/**
 * Roles that use the student app. Ambassadors (0018) are students with a referral
 * code and the Ambassador Hub; pending_ambassador (0021) is a student who has applied.
 */
export const STUDENT_ROLES: Role[] = ['student', 'ambassador', 'pending_ambassador'];
export const isStudent = (role: Role | null | undefined) => role === 'student' || role === 'ambassador' || role === 'pending_ambassador';

export type Profile = {
  id: string;
  role: Role;
  full_name: string | null;
  phone: string | null;
  country: string | null;
  education_level: string | null;
  field_of_interest: string | null;
  interests: string[];
  goals: string[];
  bio: string | null;
  avatar_url: string | null;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Columns a signed-in user may write (matches the column GRANT in 0001). */
export type ProfileUpdate = Partial<
  Pick<
    Profile,
    'full_name' | 'phone' | 'country' | 'education_level' | 'field_of_interest' | 'interests' | 'goals' | 'bio' | 'avatar_url' | 'onboarded_at'
  >
>;

export const PROFILE_COLUMNS =
  'id, role, full_name, phone, country, education_level, field_of_interest, interests, goals, bio, avatar_url, onboarded_at, created_at, updated_at';
