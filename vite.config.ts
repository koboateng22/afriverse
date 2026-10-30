import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Only VITE_-prefixed variables are ever exposed to the client bundle.
// Server secrets (Paystack, Groq, YouTube, Resend, service role) live in
// Supabase Edge Function secrets and are never read here.
export default defineConfig({
  plugins: [react()],
  envPrefix: 'VITE_',
  server: { port: 5173 },
});
