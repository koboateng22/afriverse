import type { Currency, FormFields } from '../universities/types';

/** Row shape of public.applications (fee columns are a snapshot taken at payment). */
export type ApplicationStatus = 'Pending Payment' | 'Paid' | 'Submitted' | 'In Review' | 'Offer' | 'Rejected' | 'Withdrawn' | 'Failed';

export type ApplicationDocument = { key: string; label: string; path: string; name: string; size: number; type: string };

export type Application = {
  id: string;
  user_id: string;
  university_id: string;
  program: string | null;
  intake: string | null;
  status: ApplicationStatus;
  currency: Currency;
  app_fee_cents: number;
  service_fee_cents: number;
  total_cents: number;
  payment_ref: string | null;
  form_snapshot: FormFields;
  form_data: Record<string, string>;
  documents: ApplicationDocument[];
  submitted_at: string | null;
  status_note: string | null;
  created_at: string;
  updated_at: string;
};
