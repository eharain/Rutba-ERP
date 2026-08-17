import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface RecentlyViewedItem {
  documentId: string;
  slug: string;
  name: string;
  thumbnail: string | null;
  secondaryThumbnail?: string | null;
  sellingPrice: number;
  offerPrice?: number;
  categoryName?: string;
  brandName?: string;
  viewedAt: number;
}

interface RecentlyViewedState {
  items: RecentlyViewedItem[];
  push: (item: Omit<RecentlyViewedItem, "viewedAt">) => void;
  clear: () => void;
}

const MAX_ITEMS = 12;

export const useRecentlyViewed = create<RecentlyViewedState>()(
  persist(
    (set) => ({
      items: [],
      push: (item) =>
        set((state) => {
          const without = state.items.filter(
            (i) => i.documentId !== item.documentId
          );
          const next: RecentlyViewedItem = { ...item, viewedAt: Date.now() };
          return { items: [next, ...without].slice(0, MAX_ITEMS) };
        }),
      clear: () => set({ items: [] }),
    }),
    {
      name: "rutba:recently-viewed",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);
