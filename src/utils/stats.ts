import type { ClosetItem } from '@/types';

export interface WearRow {
  item_id: string;
  worn_on: string; // ISO date
}

export interface ItemStat {
  item: ClosetItem;
  wears: number;
  lastWorn: string | null;
  costPerWear: number | null;
}

export interface Breakdown {
  label: string;
  count: number;
  share: number; // 0..1
}

export interface WardrobeStats {
  totalItems: number;
  totalValue: number;
  pricedItems: number;
  wearsLast30: number;
  utilization90: number; // share of items worn in the last 90 days
  mostWorn: ItemStat[];
  neverWorn: ItemStat[];
  bestValue: ItemStat[];
  unwornSixMonths: ItemStat[];
  colors: Breakdown[];
  categories: Breakdown[];
}

function daysAgoISO(days: number, today = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function breakdown(values: string[]): Breakdown[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const total = values.length || 1;
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, share: count / total }))
    .sort((a, b) => b.count - a.count);
}

export function computeStats(items: ClosetItem[], wears: WearRow[], today = new Date()): WardrobeStats {
  const byItem = new Map<string, { count: number; last: string | null }>();
  for (const w of wears) {
    const entry = byItem.get(w.item_id) ?? { count: 0, last: null };
    entry.count += 1;
    if (!entry.last || w.worn_on > entry.last) entry.last = w.worn_on;
    byItem.set(w.item_id, entry);
  }

  const stats: ItemStat[] = items.map((item) => {
    const w = byItem.get(item.id);
    const wearsCount = w?.count ?? 0;
    const price = item.price != null ? Number(item.price) : null;
    return {
      item,
      wears: wearsCount,
      lastWorn: w?.last ?? null,
      costPerWear: price != null && wearsCount > 0 ? price / wearsCount : null,
    };
  });

  const d30 = daysAgoISO(30, today);
  const d90 = daysAgoISO(90, today);
  const d180 = daysAgoISO(180, today);
  const addedBefore = (s: ItemStat, iso: string) => s.item.created_at.slice(0, 10) <= iso;

  const priced = items.filter((i) => i.price != null);

  return {
    totalItems: items.length,
    totalValue: priced.reduce((sum, i) => sum + Number(i.price), 0),
    pricedItems: priced.length,
    wearsLast30: wears.filter((w) => w.worn_on >= d30).length,
    utilization90: items.length
      ? stats.filter((s) => s.lastWorn && s.lastWorn >= d90).length / items.length
      : 0,
    mostWorn: stats.filter((s) => s.wears > 0).sort((a, b) => b.wears - a.wears).slice(0, 5),
    // Only items that have had a fair chance (added 30+ days ago).
    neverWorn: stats.filter((s) => s.wears === 0 && addedBefore(s, d30)).slice(0, 10),
    bestValue: stats
      .filter((s) => s.costPerWear != null)
      .sort((a, b) => (a.costPerWear ?? 0) - (b.costPerWear ?? 0))
      .slice(0, 5),
    unwornSixMonths: stats.filter(
      (s) => addedBefore(s, d180) && (!s.lastWorn || s.lastWorn < d180),
    ),
    colors: breakdown(items.map((i) => (i.color || 'Unknown').trim().toLowerCase())),
    categories: breakdown(items.map((i) => i.category)),
  };
}

const NAMED_COLORS: Record<string, string> = {
  black: '#111111', white: '#F5F5F5', grey: '#9CA3AF', gray: '#9CA3AF', charcoal: '#36454F',
  navy: '#1E2A4A', blue: '#3B6FD8', 'light blue': '#9CC3F0', denim: '#4A6A8A', teal: '#2A8C82',
  green: '#3E8E4F', olive: '#6B7A3A', khaki: '#BDB07A', beige: '#D8C8A8', cream: '#F1E8D0',
  ivory: '#F6F0DF', tan: '#C9A27A', camel: '#B8936A', brown: '#7A5235', burgundy: '#7A1F33',
  maroon: '#6E1E2C', red: '#D23B3B', pink: '#E58FB0', purple: '#7B4FA8', lavender: '#B9A7DA',
  yellow: '#E9C93E', mustard: '#C9A227', orange: '#E07B32', gold: '#C9A54A', silver: '#C0C4C8',
};

export function colorSwatch(name: string): string {
  const key = name.trim().toLowerCase();
  if (NAMED_COLORS[key]) return NAMED_COLORS[key];
  const match = Object.keys(NAMED_COLORS).find((c) => key.includes(c));
  return match ? NAMED_COLORS[match] : '#8E8E93';
}
