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

// Calls an Edge Function and throws an Error carrying the function's own message on failure.
export async function invokeFunction<T>(
  client: ReturnType<typeof createAuthenticatedClient>,
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) {
    let message = error.message ?? `${name} failed`;
    try {
      const detail = await (error as any).context?.json?.();
      message = detail?.error ?? detail?.message ?? message;
    } catch {}
    throw new Error(message);
  }
  return data as T;
}
