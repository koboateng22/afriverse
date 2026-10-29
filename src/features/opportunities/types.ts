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
};

export const OPPORTUNITY_COLUMNS =
  'id, slug, title, provider, kind, summary, description, eligibility, benefits, fields, levels, host_country, open_to, funding, status, deadline, opens_on, cycle_note, url, is_pro, featured';

export const FUNDING_LABEL: Record<Funding, string> = {
  full: 'Fully funded',
  partial: 'Partial funding',
  stipend: 'Stipend',
  free_training: 'Free training',
  prize: 'Cash prize',
};
