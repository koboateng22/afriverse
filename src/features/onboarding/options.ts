// Shared vocabulary. These exact strings are used in supabase/seed.sql
// (opportunities.fields / levels, careers.field, courses.field), so the feed
// can match a student's profile to opportunities.

export const FIELDS = [
  'Software Engineering',
  'Data & AI',
  'Medicine & Health',
  'Business & Entrepreneurship',
  'Engineering',
  'Agriculture',
  'Law & Policy',
  'Design & Creative',
] as const;

export const EDUCATION_LEVELS = ['High school', 'Undergraduate', "Master's", 'PhD', 'Working professional'] as const;

export const GOALS = [
  { id: 'scholarship', label: 'Win a scholarship' },
  { id: 'university', label: 'Get into university' },
  { id: 'career', label: 'Choose a career' },
  { id: 'skills', label: 'Learn new skills' },
  { id: 'mentor', label: 'Find a mentor' },
] as const;

export type GoalId = (typeof GOALS)[number]['id'];

export const AFRICAN_COUNTRIES = [
  'Algeria', 'Angola', 'Benin', 'Botswana', 'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cameroon',
  'Central African Republic', 'Chad', 'Comoros', 'Congo', "Côte d'Ivoire", 'DR Congo', 'Djibouti', 'Egypt',
  'Equatorial Guinea', 'Eritrea', 'Eswatini', 'Ethiopia', 'Gabon', 'Gambia', 'Ghana', 'Guinea', 'Guinea-Bissau',
  'Kenya', 'Lesotho', 'Liberia', 'Libya', 'Madagascar', 'Malawi', 'Mali', 'Mauritania', 'Mauritius', 'Morocco',
  'Mozambique', 'Namibia', 'Niger', 'Nigeria', 'Rwanda', 'São Tomé and Príncipe', 'Senegal', 'Seychelles',
  'Sierra Leone', 'Somalia', 'South Africa', 'South Sudan', 'Sudan', 'Tanzania', 'Togo', 'Tunisia', 'Uganda',
  'Zambia', 'Zimbabwe',
] as const;
