import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL');
if (!supabaseAnonKey) throw new Error('Missing EXPO_PUBLIC_SUPABASE_ANON_KEY');

// Unauthenticated client — use for public data (e.g. approved feed posts)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Authenticated client — pass Clerk JWT so Supabase RLS resolves auth.uid()
// Call createAuthenticatedClient(token) inside any async function that needs user-scoped data
export function createAuthenticatedClient(token: string) {
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });
}
