import type { createAuthenticatedClient } from './supabase';

type Client = ReturnType<typeof createAuthenticatedClient>;

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Records that these items were worn on a day. Logging the same item twice on one day is a no-op.
export async function logWear(client: Client, userId: string, itemIds: string[], wornOn = todayISO()) {
  if (itemIds.length === 0) return;
  const rows = itemIds.map((item_id) => ({ user_id: userId, item_id, worn_on: wornOn }));
  const { error } = await client.from('wear_log').upsert(rows, { onConflict: 'item_id,worn_on', ignoreDuplicates: true });
  if (error) throw error;
}

export async function unlogWear(client: Client, itemId: string, wornOn = todayISO()) {
  const { error } = await client.from('wear_log').delete().eq('item_id', itemId).eq('worn_on', wornOn);
  if (error) throw error;
}

export interface WearSummary {
  count: number;
  lastWorn: string | null;
  wornToday: boolean;
}

export async function fetchWearSummary(client: Client, itemId: string): Promise<WearSummary> {
  const { data, error, count } = await client
    .from('wear_log')
    .select('worn_on', { count: 'exact' })
    .eq('item_id', itemId)
    .order('worn_on', { ascending: false })
    .limit(1);
  if (error) throw error;
  const lastWorn = data?.[0]?.worn_on ?? null;
  return { count: count ?? 0, lastWorn, wornToday: lastWorn === todayISO() };
}
