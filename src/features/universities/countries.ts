/** Countries offered in the admin university form (Africa first, then common study-abroad destinations). */
export const AFRICAN_COUNTRIES = [
  'Ghana', 'Nigeria', 'Kenya', 'South Africa', 'Rwanda', 'Uganda', 'Tanzania', 'Ethiopia', 'Egypt', 'Morocco',
  'Algeria', 'Angola', 'Benin', 'Botswana', 'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cameroon', 'Central African Republic',
  'Chad', 'Comoros', 'Congo', "Côte d'Ivoire", 'DR Congo', 'Djibouti', 'Equatorial Guinea', 'Eritrea', 'Eswatini', 'Gabon',
  'Gambia', 'Guinea', 'Guinea-Bissau', 'Lesotho', 'Liberia', 'Libya', 'Madagascar', 'Malawi', 'Mali', 'Mauritania',
  'Mauritius', 'Mozambique', 'Namibia', 'Niger', 'São Tomé and Príncipe', 'Senegal', 'Seychelles', 'Sierra Leone',
  'Somalia', 'South Sudan', 'Sudan', 'Togo', 'Tunisia', 'Zambia', 'Zimbabwe',
] as const;

export const ABROAD_COUNTRIES = ['United Kingdom', 'United States', 'Canada', 'Germany', 'Netherlands', 'Ireland', 'France', 'China', 'Australia', 'United Arab Emirates'] as const;

export const COUNTRIES: readonly string[] = [...AFRICAN_COUNTRIES, ...ABROAD_COUNTRIES];
