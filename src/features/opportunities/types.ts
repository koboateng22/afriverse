/** Row shape of public.opportunities. */
export type OpportunityKind = 'scholarship' | 'fellowship' | 'program' | 'award';
export type OpportunityStatus = 'open' | 'rolling' | 'upcoming' | 'closed';
export type Funding = 'full' | 'partial' | 'stipend' | 'free_training' | 'prize';

export type Opportunity = {
  id: string;
  slug: string;
  title: string;
  provider: string;
  kind: OpportunityKind;
  summary: string;
  description: string;
  eligibility: string[];
  benefits: string[];
  fields: string[];
  levels: string[];
  host_country: string;
  open_to: string;
  funding: Funding;
  status: OpportunityStatus;
  deadline: string | null;
  opens_on: string | null;
  cycle_note: string | null;
  url: string;
  is_pro: boolean;
  featured: boolean;
  /** The link is the provider's own official page (migration 0017): green "Verified" badge. */
  is_verified?: boolean;
};

export const OPPORTUNITY_COLUMNS =
  'id, slug, title, provider, kind, summary, description, eligibility, benefits, fields, levels, host_country, open_to, funding, status, deadline, opens_on, cycle_note, url, is_pro, featured, is_verified';
/** The same without is_verified, for a database that hasn't run migration 0017 yet. */
export const OPPORTUNITY_COLUMNS_BEFORE_0017 = OPPORTUNITY_COLUMNS.replace(', is_verified', '');

export const FUNDING_LABEL: Record<Funding, string> = {
  full: 'Fully funded',
  partial: 'Partial funding',
  stipend: 'Stipend',
  free_training: 'Free training',
  prize: 'Cash prize',
};
