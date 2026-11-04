/** Row shape of public.universities. Fees are GHS, in pesewas. */
export type Currency = 'GHS';

/** The admin-built application form: which fields this university requires. */
export type FormFields = {
  high_school?: boolean;
  waec_results?: boolean;
  guardian_name?: boolean;
  guardian_email?: boolean;
  guardian_occupation?: boolean;
  custom_documents?: Array<{ key: string; label: string }>;
};

export type University = {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  country: string;
  city: string;
  currency: Currency;
  app_fee_cents: number;
  service_fee_cents: number;
  fee_notes: string | null;
  website: string | null;
  /** Link to the university's published cut-off points (https). */
  cutoff_link: string | null;
  description: string | null;
  form_fields: FormFields;
  active: boolean;
};

/** Total the student pays (single application fee; legacy service fee included). */
export const feeOf = (u: Pick<University, 'app_fee_cents' | 'service_fee_cents'>) => u.app_fee_cents + u.service_fee_cents;

/** Human-readable list of what a university's form asks for. */
export function requirementsOf(f: FormFields): string[] {
  return [
    f.high_school && 'High school attended',
    f.waec_results && 'WAEC / WASSCE results (upload)',
    f.guardian_name && 'Parent/guardian full name',
    f.guardian_email && 'Parent/guardian email',
    f.guardian_occupation && 'Parent/guardian occupation',
    ...(f.custom_documents ?? []).map((d) => `${d.label} (upload)`),
  ].filter((x): x is string => Boolean(x));
}
