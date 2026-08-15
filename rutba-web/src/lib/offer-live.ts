import { useEffect, useState } from "react";

// Single source of truth on the storefront for "is this offer valid *right
// now*?".
//
// This mirrors `isOfferLive` in
// pos-strapi/src/api/sale-offer/services/sale-offer.js. The server is the
// pricing authority — validateOrderPricing re-resolves every line at checkout
// and rejects one that claims a lapsed offer — so any drift between the two
// rules shows up as a page advertising a discount the checkout then refuses to
// honour. Keep them identical.
//
// Two details that look like typos but are deliberate, both matching the
// server:
//   • `active !== false`, not `!!active` — a row that leaves `active` null is
//     live server-side, so it must be live here too.
//   • a missing start_date/end_date is an open bound, not a closed one.
//
// Every place that decides whether to paint a discount imports from here.
// Do not re-implement the rule inline.

export interface OfferLike {
  active?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
}

function timeOf(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  // An unparseable date is treated as "no bound" rather than as an instant
  // boundary at NaN, which would compare false and silently keep the offer live.
  return Number.isNaN(t) ? null : t;
}

/** Is this offer in force at `now`? Mirrors the server rule exactly. */
export function isOfferLive(
  offer: OfferLike | null | undefined,
  now: number = Date.now()
): boolean {
  if (!offer) return false;
  if (offer.active === false) return false;
  const start = timeOf(offer.start_date);
  const end = timeOf(offer.end_date);
  if (start != null && start > now) return false;
  if (end != null && end < now) return false;
  return true;
}

/**
 * Is this offer active but not yet started? Drives the "Upcoming offer"
 * treatment on group listings. An offer with no start_date is never upcoming —
 * it is already live.
 */
export function isOfferUpcoming(
  offer: OfferLike | null | undefined,
  now: number = Date.now()
): boolean {
  if (!offer || offer.active === false) return false;
  const start = timeOf(offer.start_date);
  return start != null && start > now;
}

/** First live offer in a list, or undefined. */
export function findLiveOffer<T extends OfferLike>(
  offers: T[] | null | undefined,
  now: number = Date.now()
): T | undefined {
  return (offers ?? []).find((o) => isOfferLive(o, now));
}

/** First upcoming offer in a list, or undefined. */
export function findUpcomingOffer<T extends OfferLike>(
  offers: T[] | null | undefined,
  now: number = Date.now()
): T | undefined {
  return (offers ?? []).find((o) => isOfferUpcoming(o, now));
}

/**
 * A `now` that keeps up with a tab left open.
 *
 * Reading `Date.now()` during render pins the offer decision to the moment the
 * page was built. On a tab parked for hours that is exactly the case we care
 * about: the shopper comes back to a banner and a strike-through price for an
 * offer that ended while they were away, adds it to the cart, and the server
 * rejects the order at checkout.
 *
 * Cheap wake-ups (visibility, focus, bfcache restore) carry the correctness;
 * the interval is only a backstop for a tab that stays visible and focused
 * across the boundary, so it ticks slowly.
 */
export function useOfferClock(intervalMs: number = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    // A bfcache restore replays neither visibilitychange nor focus in every
    // browser, so back/forward gets its own listener.
    const onPageShow = () => tick();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", tick);
    window.addEventListener("pageshow", onPageShow);
    const id = window.setInterval(tick, intervalMs);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", tick);
      window.removeEventListener("pageshow", onPageShow);
      window.clearInterval(id);
    };
  }, [intervalMs]);

  return now;
}
