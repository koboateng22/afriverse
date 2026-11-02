/**
 * Display-only formatting. All amounts are stored and sent as the smallest
 * currency unit (*_cents); this is the only place they are divided.
 */
export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })
      .format(cents / 100)
      .replace(/^GH₵\s*/, 'GH₵ ');
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

/** Converts a typed major-unit value ("220.50") to cents for admin forms. */
export function toCents(input: string): number | null {
  const n = Number(input.replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
