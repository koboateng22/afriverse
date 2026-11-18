/** Light E.164 normaliser for WhatsApp numbers: "0551234987" + Ghana → "+233551234987". */
export function toE164(raw: string, defaultCountryCode = '233'): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('0')) return `+${defaultCountryCode}${digits.slice(1)}`;
  return `+${digits}`;
}
