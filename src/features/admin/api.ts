import { invokeFunction } from '../../lib/functions';

/**
 * Every admin read/write goes through the admin-api edge function, which
 * verifies the caller is an admin and then uses the service role.
 */
export async function adminCall<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data } = await invokeFunction<{ data: T }>('admin-api', { action, payload });
  return data;
}

export type ScrapedImages = { logo_url: string | null; cover_image_url: string | null };

/** Reads a university website's logo + cover image and copies them into our storage. */
export function scrapeUniversity(url: string): Promise<ScrapedImages> {
  return invokeFunction<ScrapedImages>('scrape-university', { url });
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
