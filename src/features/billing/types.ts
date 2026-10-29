/** Row shapes of public.payments, public.subscriptions and public.mentor_sessions. */
export type PaymentKind = 'subscription' | 'application' | 'mentor';
export type Plan = 'pro';

export type Payment = {
  id: string;
  user_id: string;
  kind: PaymentKind;
  reference: string;
  status: 'pending' | 'success' | 'failed';
  currency: string;
  amount_cents: number;
  platform_fee_cents: number;
  payee_share_cents: number;
  channel: string | null;
  related_id: string | null;
  paid_at: string | null;
  created_at: string;
};

/** Row shape of public.plans. */
export type PlanRow = {
  code: Plan;
  name: string;
  tagline: string;
  amount_cents: number;
  currency: string;
  period_days: number;
  /** null = unlimited */
  ai_daily_limit: number | null;
  features: string[];
};

/** Row of public.billing_customers (card auto-renew), as readable by the student. */
export type BillingCustomer = {
  user_id: string;
  status: 'active' | 'non-renewing' | 'cancelled';
  next_payment_date: string | null;
};

export type Subscription = {
  id: string;
  user_id: string;
  plan: Plan;
  status: 'pending' | 'active' | 'expired' | 'failed';
  billing: 'card_recurring' | 'momo_once';
  currency: string;
  amount_cents: number;
  payment_ref: string | null;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export type MentorSession = {
  id: string;
  mentor_id: string;
  student_id: string;
  scheduled_at: string;
  duration_min: number;
  topic: string | null;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'failed';
  currency: string;
  amount_cents: number;
  payment_ref: string | null;
  created_at: string;
};
