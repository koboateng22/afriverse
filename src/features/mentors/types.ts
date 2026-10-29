/** Row shape of public.mentors as readable by the client (subaccount_code is not granted). */
export type MentorStatus = 'pending' | 'approved' | 'rejected';

export type Mentor = {
  id: string;
  display_name: string;
  headline: string | null;
  bio: string | null;
  expertise: string[];
  country: string | null;
  rate_cents: number | null;
  currency: string;
  status: MentorStatus;
  availability: string | null;
  approved_at: string | null;
  created_at: string;
  /** Mentor's own view only: their proposed hourly rate and its review state. */
  proposed_rate_cents?: number | null;
  rate_review?: 'none' | 'pending' | 'approved' | 'rejected';
};

/** rate_cents = the admin-APPROVED hourly rate (GHS pesewas). */
export const MENTOR_COLUMNS = 'id, display_name, headline, bio, expertise, country, rate_cents, currency, status, availability, approved_at, created_at';
export const OWN_MENTOR_COLUMNS = `${MENTOR_COLUMNS}, proposed_rate_cents, rate_review`;
