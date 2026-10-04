import { createAuthenticatedClient } from './supabase';
import type { User } from '@/types';

// IANA name such as "Asia/Kolkata"; the database falls back to UTC for unknown names.
function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// Upserts the user row and returns the full row so callers can populate stores.
// Safe to call on every sign-in — idempotent.
export async function syncUserToSupabase(
  token: string,
  userId: string,
  email: string,
  displayName: string,
): Promise<User | null> {
  const supabase = createAuthenticatedClient(token);

  const { error: upsertError } = await supabase
    .from('users')
    .upsert(
      { id: userId, email, display_name: displayName.slice(0, 40), timezone: deviceTimezone() },
      { onConflict: 'id' },
    );

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
