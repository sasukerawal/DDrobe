import { create } from 'zustand';
import type { ClosetItem, GeneratedOutfit } from '@/types';

interface AppState {
  // Closet
  closetItems: ClosetItem[];
  setClosetItems: (items: ClosetItem[]) => void;
  addClosetItem: (item: ClosetItem) => void;
  updateClosetItem: (id: string, updates: Partial<ClosetItem>) => void;

  // Daily Outfits (Swipe UI)
  dailyOutfits: GeneratedOutfit[];
  setDailyOutfits: (outfits: GeneratedOutfit[]) => void;
  removeOutfit: (id: string) => void;

  // Daily generation limits (enforced by rewarded ad mechanic)
  dailyGenerationsUsed: number;
  incrementGenerations: () => void;
  resetDailyGenerations: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  closetItems: [],
  setClosetItems: (items) => set({ closetItems: items }),
  addClosetItem: (item) =>
    set((state) => ({ closetItems: [item, ...state.closetItems] })),
  updateClosetItem: (id, updates) =>
    set((state) => ({
      closetItems: state.closetItems.map((item) =>
        item.id === id ? { ...item, ...updates } : item,
      ),
    })),

  dailyOutfits: [],
  setDailyOutfits: (outfits) => set({ dailyOutfits: outfits }),
  removeOutfit: (id) =>
    set((state) => ({
      dailyOutfits: state.dailyOutfits.filter((outfit) => outfit.id !== id),
    })),

  dailyGenerationsUsed: 0,
  incrementGenerations: () =>
    set((state) => ({
      dailyGenerationsUsed: state.dailyGenerationsUsed + 1,
    })),
  resetDailyGenerations: () => set({ dailyGenerationsUsed: 0 }),
}));

