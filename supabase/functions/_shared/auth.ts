import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

export class AuthError extends Error {
  status = 401;
}

// Resolves the Clerk user id from the caller's token. PostgREST validates the JWT
// the same way it does for RLS, so a forged or expired token never yields an id.
export async function requireUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) throw new AuthError('Not signed in');

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await client.rpc('requesting_user_id');
    // PGRST303 = token "not yet valid" from clock skew between Clerk and Postgres.
    if (error?.code === 'PGRST303' && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    if (error || typeof data !== 'string' || !data) break;
    return data;
  }
  throw new AuthError('Your session has expired. Please sign in again.');
}
