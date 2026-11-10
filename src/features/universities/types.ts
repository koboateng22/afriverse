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
  /** Public URLs in the university_assets bucket (migration 0015); null until set. */
  logo_url?: string | null;
  cover_image_url?: string | null;
  description: string | null;
  form_fields: FormFields;
  active: boolean;
  /** 0019: 'public' | 'private', or null while not verified. Never inferred from the name. */
  ownership?: Ownership | null;
  /** How the classification was verified (official site, regulator's list…). */
  ownership_source?: string | null;
  programmes?: string[];
  admission_requirements?: string | null;
  tuition_info?: string | null;
};

export type Ownership = 'public' | 'private';
/** Listing groups: the two classifications plus the "being verified" bucket. */
export type OwnershipGroup = Ownership | 'unverified';

export const OWNERSHIP_LABEL: Record<OwnershipGroup, string> = {
  public: 'Public',
  private: 'Private',
  unverified: 'Being verified',
};

export const groupOf = (u: Pick<University, 'ownership'>): OwnershipGroup =>
  u.ownership === 'public' || u.ownership === 'private' ? u.ownership : 'unverified';

/** Case- and accent-insensitive search over name, short name, place and programmes. */
export function matchesSearch(u: University, query: string): boolean {
  const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const q = fold(query.trim());
  if (!q) return true;
  const hay = fold([u.name, u.short_name ?? '', u.city, u.country, ...(u.programmes ?? [])].join(' '));
  return q.split(/\s+/).every((word) => hay.includes(word));
}

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
