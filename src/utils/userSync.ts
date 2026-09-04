import { createAuthenticatedClient } from './supabase';

// Upserts the user row in the Supabase `users` table.
// Must be called after Clerk auth is active so the JWT makes auth.uid() resolve correctly.
// Idempotent — safe to call on every sign-in.
export async function syncUserToSupabase(
  token: string,
  userId: string,
  email: string,
): Promise<void> {
  const supabase = createAuthenticatedClient(token);
  const { error } = await supabase
    .from('users')
    .upsert({ id: userId, email }, { onConflict: 'id', ignoreDuplicates: true });

  if (error) {
    // Non-fatal — log but don't crash the app. Most likely cause is Clerk JWT
    // template "supabase" not yet configured in the Clerk dashboard.
    console.error('[userSync] Failed to sync user:', error.message);
  }
}
