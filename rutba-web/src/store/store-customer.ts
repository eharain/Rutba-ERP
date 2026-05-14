import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface SavedCustomer {
  name?: string;
  email?: string;
  phone_number?: string;
  // Optional shipping bits — populated when the visitor uses the
  // full-address path. Express orders only fill the contact trio above.
  address?: string;
  country?: string;
  state?: string;
  city?: string;
  zip_code?: string;
}

interface SavedCustomerState {
  customer: SavedCustomer;
  /**
   * Merge the submitted values into the saved record. Empty/undefined
   * fields don't overwrite previously-saved values (so a quick-order
   * submission doesn't blank out an address the visitor entered earlier).
   */
  save: (next: SavedCustomer) => void;
  clear: () => void;
}

const trim = (v: string | undefined) => (v ?? "").trim();

export const useSavedCustomer = create<SavedCustomerState>()(
  persist(
    (set, get) => ({
      customer: {},
      save: (next) => {
        const cur = get().customer;
        const merged: SavedCustomer = { ...cur };
        (Object.keys(next) as (keyof SavedCustomer)[]).forEach((k) => {
          const incoming = trim(next[k]);
          if (incoming) merged[k] = incoming;
        });
        set({ customer: merged });
      },
      clear: () => set({ customer: {} }),
    }),
    {
      name: "rutba:saved-customer",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);

/**
 * True when we have enough address bits to skip the full-address form.
 * "Enough" = country + city + address. Phone/email/name come via the
 * express form regardless.
 */
export function hasShippingAddress(c: SavedCustomer): boolean {
  return !!(c.address && c.city && c.country);
}

/**
 * Compact one-liner for the "Shipping to: …" hint shown above the form.
 */
export function formatAddressLine(c: SavedCustomer): string {
  return [c.address, c.city, c.state, c.country]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
}
