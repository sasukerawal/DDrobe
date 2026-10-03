import { createAuthenticatedClient } from './supabase';
import { useAppStore } from '@/store/useAppStore';
import type { ClosetItem } from '@/types';

type GetToken = (opts?: { skipCache?: boolean }) => Promise<string | null>;

// Returns the cached closet, or loads it (retrying once on Clerk/Supabase clock skew).
export async function ensureClosetLoaded(getToken: GetToken, force = false): Promise<ClosetItem[]> {
  const cached = useAppStore.getState().closetItems;
  if (!force && cached.length > 0) return cached;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
    const token = await getToken({ skipCache: attempt > 0 });
    if (!token) throw new Error('Not signed in');
    const { data, error } = await createAuthenticatedClient(token)
      .from('closet_items')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      if ((error as { code?: string }).code === 'PGRST303' && attempt === 0) continue;
      throw error;
    }
    const items = (data ?? []) as ClosetItem[];
    useAppStore.getState().setClosetItems(items);
    return items;
  }
  return [];
}
