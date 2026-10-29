import { invokeFunction } from '../../lib/functions';

/**
 * Every admin read/write goes through the admin-api edge function, which
 * verifies the caller is an admin and then uses the service role.
 */
export async function adminCall<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data } = await invokeFunction<{ data: T }>('admin-api', { action, payload });
  return data;
}

export type RevenueRow = {
  currency: string;
  subscriptions_revenue: number;
  application_fees_collected: number;
  mentor_commission: number;
  mentor_payouts: number;
  net_revenue: number;
};

export type Overview = {
  counts: Record<string, number>;
  pending_mentors: number;
  rates_pending: number;
  active_pro: number;
  open_applications: number;
  refunds_needed: number;
  warnings: string[];
  revenue: RevenueRow[];
};
