# rutba-web launch backlog

Working list of pre-launch and just-after-launch fixes / features for the
storefront. Started from a batch of user notes in mid-2026; this is the
authoritative status tracker.

Sister doc: [contact-unification-launch-test-plan.md](./contact-unification-launch-test-plan.md)
(test plan for the Phase 1A work that landed in this same week).

## ✓ Landed this cycle

### POS sale invoice — extra barcode above QR
- [SaleInvoice.js:339](pos-sale/components/print/SaleInvoice.js#L339)
- `<BarcodeDisplay>` defaults to rendering both a 1D Code128 strip AND a QR.
  The invoice only wanted the QR. Fixed by passing
  `showBarcode={false}` at the invoice usage; other call sites (none today,
  but the prop stays available) can still get both.

### Cart icon stale state between pages
- [components/cart/index.tsx](rutba-web/src/components/cart/index.tsx)
- Root cause: the cart sheet showed "Your cart is empty" while the
  `getCart()` query was still loading. `cart` was `undefined` on first
  paint, so the empty-state branch fired even though the Zustand
  `cartItem` (localStorage-backed) clearly had items — the header badge
  reflected that and the sheet didn't.
- Fix: split the three states cleanly — `isEmpty` reads from Zustand
  `cartItem` (immediate), `isResolving` covers the brief window while
  the network query enriches the rows, and the genuine empty state only
  shows when localStorage is actually empty. A small loading placeholder
  fills the sheet body during `isResolving`.
- Bonus: `useQuery` is now gated by `enabled: cartItem.length > 0` so it
  doesn't fire a pointless request when the cart is empty.

### Checkout — sign-in nudge for anonymous shoppers
- [pages/checkout.tsx](rutba-web/src/pages/checkout.tsx) (the new block
  conditional on `!jwt`).
- Anonymous visitors landing on /checkout now see a compact "Have an
  account? Sign in to skip the form" card with a button that routes to
  `/login?redirect=/checkout`. The express form remains directly below as
  the guest path — no modal interception, no forced gate, no extra step
  for guests.
- The `/login` page already supports `?redirect=` and bounces back after
  successful auth, so signed-in users land on /checkout with their
  saved-address book pre-fill already plumbed in via the Phase 1A work.

## ⬜ Still TODO

### Web product card — inline add-to-cart with variants + image
- File: [components/product-list/product-card.tsx](rutba-web/src/components/product-list/product-card.tsx)
- Today the whole card is wrapped in a `<Link>` to the product detail
  page. There is no add-to-cart action on the card itself; the user must
  click through to the detail page, pick variants, then add.
- What the user asked for: let the user add from the card without going
  to the detail page; the picture and variant choice should both be
  handled on the card.
- Why it's not a quick fix:
  - The card currently only receives `variantTermSummary` (the *names* of
    each variant axis) — not the full variant rows with IDs, prices,
    stock, and images. The list endpoint that feeds the card would need to
    populate the full variant set (more payload, watch the list-page
    perf budget).
  - The outer `<Link>` needs to be removed so that interactive controls
    (dropdown, +/− qty) inside the card don't trigger navigation. The
    surrounding clickable area then needs a different pattern (e.g.
    image+title is a Link, the rest is not).
  - UX decisions needed before code:
    1. Hover-reveal "Quick add" button vs always-visible? On mobile there
       is no hover — always-visible probably wins.
    2. Single-variant product (no axes) → one-click add. Multi-variant →
       what does the card show? Dropdown? Inline radio for the most-common
       axis (size)?
    3. Does the card image swap when a variant is selected (e.g. red→blue
       shirt)? Or stay fixed?
    4. Default variant on first interaction — pick the cheapest? The
       in-stock one? The first listed?
  - Edge cases to think about: out-of-stock variants, variants with their
    own gallery image vs falling back to the parent product image (the
    existing detail page handles this — port the logic), offers that only
    apply to certain variants.
- Effort once decisions are made: 1–2 hours. Without decisions: don't
  start.
- Workaround until then: the current "click card → detail page → add"
  path works.

### Checkout — richer login-or-guest choice screen
- The sign-in nudge that landed (above) is the minimum-viable answer to
  the user note "the not logged in should be given a choice to checkout
  with minimum information or register." It's a single inline card on the
  existing /checkout, not a dedicated choice screen.
- If you decide a louder split is wanted (e.g. an interstitial *before*
  the form: two big buttons, "Continue as guest" vs "Sign in / Register"),
  that's a follow-up. Reasons it might be worth doing:
  - Conversion data eventually shows guests miss the sign-in nudge.
  - Marketing wants to push registration harder.
  - The express form is intimidating enough that "show me my path first"
    helps.
- Don't build it without the data — it adds a click for every guest
  checkout and that's not free.

## How items get added to this list

- A fix that takes <30 min and has obvious scope → just do it; record
  here only if it has follow-up risk.
- A fix that needs UX / design alignment, has multiple plausible
  implementations, or touches the launch-critical path → write here
  first, get aligned, then code.
- "Probably a bug but I can't repro" → write the symptom and the
  hypothesis here so the next session has a starting point.

## How items leave this list

Move to the "Landed this cycle" section with file references and a one-
paragraph diagnosis-and-fix summary. Don't just check a box and delete —
the diagnosis is the reusable artifact next time someone hits a similar
shape of bug.
