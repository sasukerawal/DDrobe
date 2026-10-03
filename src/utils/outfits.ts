import type { createAuthenticatedClient } from './supabase';
import { logWear, todayISO } from './wearLog';
import type { ClosetItem, PlannedOutfit, SavedOutfit } from '@/types';

type Client = ReturnType<typeof createAuthenticatedClient>;

// Embeds the four closet items so screens don't depend on the closet cache.
export const OUTFIT_SELECT =
  '*, top:closet_items!saved_outfits_top_id_fkey(*), bottom:closet_items!saved_outfits_bottom_id_fkey(*), ' +
  'shoe:closet_items!saved_outfits_shoe_id_fkey(*), accessory:closet_items!saved_outfits_accessory_id_fkey(*)';

export interface OutfitPieces {
  top: ClosetItem;
  bottom: ClosetItem;
  shoe: ClosetItem;
  accessory?: ClosetItem | null;
}

export function outfitItems(o: OutfitPieces): ClosetItem[] {
  return [o.top, o.bottom, o.shoe, o.accessory].filter((i): i is ClosetItem => Boolean(i));
}

export async function fetchSavedOutfits(client: Client): Promise<SavedOutfit[]> {
  const { data, error } = await client
    .from('saved_outfits')
    .select(OUTFIT_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as SavedOutfit[];
}

export async function fetchSavedOutfit(client: Client, id: string): Promise<SavedOutfit> {
  const { data, error } = await client.from('saved_outfits').select(OUTFIT_SELECT).eq('id', id).single();
  if (error) throw error;
  return data as unknown as SavedOutfit;
}

export async function saveOutfit(
  client: Client,
  userId: string,
  pieces: OutfitPieces,
  details: { name: string; description?: string; source: 'ai' | 'manual' },
): Promise<SavedOutfit> {
  const { data, error } = await client
    .from('saved_outfits')
    .insert({
      user_id: userId,
      name: details.name.slice(0, 60),
      description: (details.description ?? '').slice(0, 400),
      source: details.source,
      top_id: pieces.top.id,
      bottom_id: pieces.bottom.id,
      shoe_id: pieces.shoe.id,
      accessory_id: pieces.accessory?.id ?? null,
    })
    .select(OUTFIT_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as SavedOutfit;
}

export async function deleteOutfit(client: Client, id: string) {
  const { error } = await client.from('saved_outfits').delete().eq('id', id);
  if (error) throw error;
}

// Logs every item in the outfit as worn and records the outfit in history.
export async function wearOutfit(client: Client, userId: string, pieces: OutfitPieces, wornOn = todayISO()) {
  await logWear(client, userId, outfitItems(pieces).map((i) => i.id), wornOn);
  await client.from('outfits_history').insert({
    user_id: userId,
    top_id: pieces.top.id,
    bottom_id: pieces.bottom.id,
    shoe_id: pieces.shoe.id,
    accessory_id: pieces.accessory?.id ?? null,
    date_worn: wornOn,
    rating: 5,
  });
}

export async function planOutfit(client: Client, userId: string, outfitId: string, planDate: string) {
  const { error } = await client
    .from('planned_outfits')
    .upsert({ user_id: userId, outfit_id: outfitId, plan_date: planDate }, { onConflict: 'user_id,plan_date' });
  if (error) throw error;
}

export async function removePlan(client: Client, planDate: string) {
  const { error } = await client.from('planned_outfits').delete().eq('plan_date', planDate);
  if (error) throw error;
}

export async function fetchPlans(client: Client, from: string, to: string): Promise<PlannedOutfit[]> {
  const { data, error } = await client
    .from('planned_outfits')
    .select(`id, outfit_id, plan_date, outfit:saved_outfits(${OUTFIT_SELECT})`)
    .gte('plan_date', from)
    .lte('plan_date', to);
  if (error) throw error;
  return (data ?? []) as unknown as PlannedOutfit[];
}

export interface WornDay {
  date: string;
  items: ClosetItem[];
}

export async function fetchWornDays(client: Client, from: string, to: string): Promise<WornDay[]> {
  const { data, error } = await client
    .from('wear_log')
    .select('worn_on, item:closet_items(*)')
    .gte('worn_on', from)
    .lte('worn_on', to)
    .order('worn_on', { ascending: false });
  if (error) throw error;

  const byDate = new Map<string, ClosetItem[]>();
  for (const row of (data ?? []) as unknown as { worn_on: string; item: ClosetItem | null }[]) {
    if (!row.item) continue;
    byDate.set(row.worn_on, [...(byDate.get(row.worn_on) ?? []), row.item]);
  }
  return [...byDate.entries()].map(([date, items]) => ({ date, items }));
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDay(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}
