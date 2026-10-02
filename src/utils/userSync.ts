import { createAuthenticatedClient } from './supabase';
import type { User } from '@/types';

// Upserts the user row and returns the full row so callers can populate stores.
// Safe to call on every sign-in — idempotent.
export async function syncUserToSupabase(
  token: string,
  userId: string,
  email: string,
): Promise<User | null> {
  const supabase = createAuthenticatedClient(token);

  const { error: upsertError } = await supabase
    .from('users')
    .upsert({ id: userId, email }, { onConflict: 'id' });

  if (upsertError) {
    console.error('[userSync] Failed to sync user:', upsertError.message);
    return null;
  }

  const { data, error: selectError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (selectError) {
    console.error('[userSync] Failed to read user after sync:', selectError.message);
    return null;
  }

  return data as User;
}
