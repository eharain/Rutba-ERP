# Offline POS — decision: local sync-bridge service

_For roadmap [0.3 — Offline-first POS hardening](./ROADMAP.md)._

> ## Amendment — 2026-08-13
>
> Two decisions postdate the 2026-08-08 design below. Both change **where the bridge
> runs** and **who it runs for**. Neither changes what it does.
>
> **What survives intact:** §§1–5 in full — the `authApi` seam (§1), provisional ids
> (§2), descriptor `offline:` policy (§3), the two read layers (§4), and what the
> server still owes the bridge (§5). §10's build plan survives phase for phase; phases
> 0–3 are untouched, because the bridge is a Node process under either host and can be
> built and run headless exactly as sequenced. §6 survives and keeps its job (see
> below). §§7–9 are untouched.
>
> **What changed:**
>
> 1. **The Electron main process hosts the bridge** — [§11](#11-amendment-2026-08-13--electron-hosts-the-bridge).
>    §10.2 phase 4 and §10.3 spec a standalone Windows service (nssm / node-windows).
>    The desktop app's main process is already a Node process, so it hosts the bridge
>    in-process: one installer, no second service to package or supervise. This also
>    **retires §10.2a's mixed-content constraint for the same-machine case**, because
>    the desktop app serves from a secure-context origin.
> 2. **The framework serves three apps, not one** — [§12](#12-amendment-2026-08-13--one-engine-three-apps).
>    POS, Email (`rutba-mail`, :4021) and Video Studio
>    (`rutba-social/pages/posts/video-studio.js` + `packages/video-maker`). Every
>    mechanism below is a per-app configuration of one engine, not POS-specific
>    machinery.
>
> **§6 (LAN mode) is not weakened — it is repositioned.** It remains the strongest
> correctness argument in this document: two tills at one branch sharing one replica
> and one outbox cannot both sell the same unit, and a desktop host per till does not
> answer that. It is now framed as *same core, second host* (§6's own words) rather
> than as the default deployment — [§11.2](#112-6-keeps-its-job-the-multi-till-shape).

## Decision (2026-08-08)

**Option A in its local-service form.** The user runs a build of the existing POS
pointed at a **local middleware service** (a Windows service, or anything that can sit
in the middle). The service:

1. **passively replicates** the entities the POS uses, whenever it has a connection —
   so the local copy is always the freshest it can be, warmed continuously rather than
   on demand;
2. **proxies transparently** while the upstream is reachable — online behaviour is
   byte-for-byte today's behaviour;
3. **serves from local data** the moment the upstream is not reachable — reads answer
   from the replica, writes land in a durable outbox;
4. **syncs back what it can sync reliably** when the connection returns — idempotent
   replay, in order, with anything unreliable or conflicted flagged for a human
   rather than guessed at.

The POS app itself does not change beyond its `API_URL` and a connectivity indicator.
The **browser-hosted tier of option A is dropped** (not deferred vaguely — dropped:
one host means one storage adapter, one lifecycle, one thing to debug). Option B
remains rejected. Option C ([§9](#9-option-c--a-lightweight-offline-first-pos-app)) is
kept in this document as reference — its product-level-capture insight (§9.2) survives
as an open sync-policy question, not as a separate app.

What this decision resolves from §7: the replay-granularity question (call-sequence
replay in the service, per §2), the descriptor-policy question (yes — §3, hosted in
the service), and the mirror-scope question (whatever the POS reads, per the passive
replicator). What it leaves open is listed in [§10.5](#105-still-open).

Sections 1–8 are the working design for the service. §9 is retained for reference.
[§10](#10-build-plan) is the build plan.

---

## 1. Where it intercepts

The call chain today is:

```
app code  →  generated client            →  authApi.post(path, body)  →  axios  →  API_URL
             (providers/generated/…)        (lib/api.js)
```

**The seam is `authApi` in `packages/api-provider/lib/api.js`.** Every one of the
548 consumer files already routes through it, and `npm run validate:endpoint-usage`
fails the build if a new one doesn't — so this is a seam the repo already guarantees,
not one this design has to create.

Rejected alternatives, and why:

| Seam | Why not |
|---|---|
| **Service Worker** | Intercepts raw `fetch`, so it also survives a reload mid-flight — genuinely better on that one axis. But it's HTTPS-only, has its own lifecycle to get wrong, can't share state with the page without message passing, and does nothing for SSR. Worth revisiting later as *hardening* on top of the `authApi` tier, not as the tier itself. |
| **A new client wrapper apps opt into** | Opt-in means the apps that forget are silently unprotected, and "did this app get offline support?" becomes unanswerable. The point of the descriptor architecture is that coverage is measurable. |

In LAN mode the same core runs as a Node process and `API_URL` points at it — the
browser tier then passes through to it instead of to the cloud.

---

## 2. The hard part: provisional ids

A transparent proxy must **answer immediately** while offline, because the caller
uses the answer. `saveSale` creating a new paid sale issues, in order:

```
1. POST /sales                    → caller needs {documentId}
2. POST /customers                  body: sales:{connect:[saleDoc]}
3. POST /payments        × n        body: sale:{connect:[saleDoc]}
4. POST /sale-items      × n      → caller needs {documentId}
5. PUT  /stock-items/:id × n        body: sale_items:{connect:[saleItemDoc]}
```

Offline, step 1 must return a documentId that steps 2–5 can reference. The proxy
mints a **provisional id** (`loc_<uuid>`), records the request in a durable outbox,
and returns a synthesised response.

On reconnect it drains the outbox **in order**, and after each real response records
`loc_x → abc123` in an id map, then **rewrites** that mapping into every request still
queued behind it. Rewriting has to cover both places an id appears:

- **path segments** — `PUT /stock-items/loc_y` → `PUT /stock-items/abc123`
- **body values at any depth** — `{ sale: { connect: ['loc_x'] } }`

Two properties make this safe to reason about:

- Provisional ids are **syntactically distinct** (`loc_` prefix). A rewrite pass can
  find them exhaustively, and one that escapes to the server is loud in the database
  rather than silently wrong.
- Reads issued offline against a provisional id resolve from the local store, so a
  page that re-reads what it just wrote behaves normally.

This mechanism is what makes the proxy **domain-agnostic**. It is also the part most
likely to be got subtly wrong, so it wants real tests before it carries a real till.

---

## 3. Descriptors declare offline policy

A purely generic proxy replays faithfully but understands nothing. It cannot know
that a 409 on a stock-item update means *another till sold this unit — flag it, don't
retry*, or that an exchange return can't be composed offline at all. Left generic, it
would either retry forever or drop the call silently. Both are wrong.

The fit for this repo is the one it already uses everywhere else: **the descriptor is
the source of truth.** `packages/api-provider/api/*.js` already carries
`path` / `action` / `method` / `apps` / `approle` / `scope`. Offline behaviour becomes
one more declared facet:

```js
// api/sales.js
create: (data) => ({
    path: '/sales', action: 'create', method: 'post',
    apps: ['sale'], approle: ['admin', 'manager', 'staff'], scope: ROLE_SCOPES,
    offline: {
        mode: 'queue',        // queue | replica | reject | passthrough
        mints: 'sale',        // the response carries a new id others will reference
        group: 'sale',        // replay unit — drains together, reported together
        onConflict: 'flag',   // flag | retry | drop
    },
    data,
}),

// a read the till must still serve offline
list: (page, pageSize, opts) => ({
    path: '/me/stock-items-search', /* … */
    offline: { mode: 'replica', collection: 'stock-items' },
}),

// something that genuinely cannot work offline, and should say so
exchangeReturns: (saleDocId) => ({
    path: '/sale-returns/', /* … */
    offline: {
        mode: 'reject',
        reason: 'An exchange needs a live lookup of the original sale and its stock.',
    },
}),
```

What this buys beyond tidiness:

- **One place knows an endpoint exists, and the same place knows what it does offline.**
  No parallel registry to drift.
- **Coverage becomes measurable.** `scripts/descriptor-audit.mjs` and
  `validate-endpoint-usage.mjs` already walk these files. Extend them to fail when an
  endpoint reachable from `apps: ['sale']` has no `offline` policy. "Is the POS
  offline-complete?" becomes a build check rather than an opinion.
- **`mode: 'reject'` is a feature.** Telling a cashier *"exchanges need a connection"*
  is graceful degradation. Silently queueing something that cannot be replayed is not.

---

## 4. Reads: two layers, deliberately

| Layer | What it does | Cost |
|---|---|---|
| **Response cache** (default for `mode: 'replica'`) | Store each GET response keyed by (path, params); serve the last one offline. | Near zero. Covers settings, enums, branch/desk, and any list already viewed. |
| **Collection mirror** (opt-in per collection) | Sync a real local collection via a delta feed, and answer arbitrary local queries against it. | A snapshot endpoint + delta protocol + staleness handling. |

The cache is the generic default and earns most of the value for free. It is useless
for exactly one thing that matters: **a search box**, where the teller types a query
nobody has typed before. That is why POS stock search — and only that — justifies a
mirror. Keeping the mirror an opt-in special case rather than the whole design keeps
the transfer cost and the staleness surface small.

A mirror is a photograph. Between two pulls another till can sell the unit this one is
about to scan, and no amount of syncing closes that window while the link is down.
The mirror's job is to keep the window small and to tell the till how old its picture
is; **detecting** the collision is the server's job (§5).

---

## 5. What the server still owes the proxy

The proxy does not remove the reconcile problem — it relocates it somewhere it can be
solved once. Three things remain server-side:

**a. `Idempotency-Key`, as a platform primitive.** A replayed `POST` whose response
was lost in transit must not create a second row — and note this is the failure mode
that actually dominates on a bad link, the one a database transaction does nothing
about. A generic header plus a dedupe table (key → status, response, expires) covers
**every** endpoint the proxy handles. This is strictly better than the per-resource
`client_sale_id` column the reverted build used: one mechanism instead of one column
per content type.

**b. Conflicts that are distinguishable, not just failures.** When a replayed stock
write lands on a unit another till already sold, the response has to say so in a form
the proxy can route to `onConflict: 'flag'` — a `409` with a stable code, not a `500`.
Today that path mostly throws.

**c. Later: a batch endpoint for atomic group replay.** Draining a `group: 'sale'` in
order from a durable queue is resumable and repairable, which is enough for v1. What
it is not is *atomic* — for a few seconds a sale header is visible without its lines.
A batch endpoint closes that window. Worth doing, not worth blocking on.

**Decided policy on oversell** (carried over — it survives the redesign): the sale
**posts**, the already-sold unit is **not** consumed twice, and the discrepancy is
recorded for a human. The money was taken and the goods left the shop; refusing to
record that strands a real transaction, and double-consuming breaks the
`product.stock_quantity` = count(InStock) invariant.

---

## 6. LAN mode

Same core, different host and storage adapter (SQLite instead of IndexedDB), exposed
on the branch network as the `API_URL` the tills use.

**What it buys that the browser tier cannot:** all tills at a branch share one replica
and one outbox, so two tills at the same shop can no longer both sell the same unit.
That is a correctness win, not an ergonomic one — it is the single strongest argument
for the LAN tier and the reason it belongs in the design rather than in a footnote.
It also survives cleared site data and enables offline receipt reprint from real
history.

**What it costs:** a box per branch to install, update and power-cycle, and a new
branch-wide single point of failure. Both are real, and the second one has a clean
answer *because* there are two hosts sharing one implementation:

> **Tiering:** the browser tier stays active underneath. If the LAN proxy is
> unreachable, the till falls back to its own in-browser proxy rather than going
> offline entirely. One implementation, two hosts, degrading in order — this is the
> payoff of the shape, and it should be a design goal rather than a happy accident.

**Security, which is where a LAN proxy usually goes wrong:**

- The proxy **never mints tokens and never stores credentials.** It forwards the
  till's JWT verbatim and replays each queued write under the token it was made with.
- Offline it cannot verify a JWT signature without the key, so it validates **shape
  and expiry only**. That is a real weakening and should be stated plainly rather than
  glossed: an attacker on the shop network with a forged token could read the replica.
- The replica holds **cost prices**. Bind to the till segment, don't listen on the
  guest wifi. TLS on the LAN needs an answer (local cert vs. accepting plain HTTP on a
  trusted VLAN) — **open question**.

**Build it from `rutba-core`, not from scratch.** `rutba-core` is already a standalone
Node server speaking this API against this schema with a zero-copy compat layer. A
branch-local tier is "run rutba-core against local SQLite with a sync channel", which
lands inside the [core-server/multitenancy program](./core-server-multitenancy-program/)
rather than forking away from it.

---

## 7. Open questions

1. **Replay granularity** — generic call-sequence replay (works for every resource, no
   server change per flow) versus semantic envelopes (atomic, but one endpoint per
   flow). This design assumes call-sequence + `group`; the batch endpoint in §5c is the
   hedge. _Confirm before building._
2. **Does `offline` really belong on the descriptor,** or in a sibling registry? On the
   descriptor gets single-source and audit for free; it also adds a facet to ~120
   descriptor files that most of them will set to `passthrough`. A default-by-method
   rule (GET → `replica`, writes → `passthrough`) keeps the noise down.
3. **Mirror scope** — stock items only, or products and customers too? Customers offline
   means duplicate contacts to merge later; the CRM already owns dedup.
4. **Cash register** — an offline till cannot open or close a register against the
   server. Does the shift stay open across the outage, or does the proxy own register
   state locally? This interacts with reconciliation and is not yet thought through.
5. **TLS on the LAN tier** (§6).
6. **0.2 interaction** — an offline sale cannot take a live digital payment. The shared
   answer both roadmap items need is a payment recorded as *tendered but not captured*
   (`capture_status: pending`, with a reason), so an unverified wallet tender and an
   offline tender resolve through one mechanism. This is unchanged by the redesign.

---

## 8. Sequencing

_Superseded by [§10](#10-build-plan) — this table assumed the browser tier shipped
first, which the decision dropped. Kept for the record._

| Slice | Contents | Outcome |
|---|---|---|
| **0** | Bounded request timeout in `lib/api.js` (`authApi.withTimeout`, `isNetworkError`). | Prerequisite for every tier — a wedged backend currently hangs forever. **Independently correct; land it regardless of which design wins.** |
| **1** | Proxy core + IndexedDB adapter; `offline` on the POS sale-write descriptors; `Idempotency-Key` server-side; connectivity + queue UI. | A till survives an outage and reconciles. |
| **2** | Collection mirror + snapshot delta endpoint for stock search. | A till can build a cart from scratch offline. |
| **3** | LAN host (rutba-core + SQLite) and fallback tiering. | Multi-till branches stop double-selling. |
| **4** | Batch endpoint for atomic group replay. | Closes the half-visible-sale window. |

---

## 9. Option C — a lightweight offline-first POS app

A **separate, deliberately small** POS that stores locally as its primary store and
syncs opportunistically, in batch, or on demand. Not `pos-sale` with offline bolted on
— a different product with a much smaller domain.

### 9.1 The inversion that makes it simple

In A and B, online is the normal case and offline is a degraded one — which means
**dual-mode code**, the single largest source of bugs in offline retrofits. Here local
storage is the primary store and sync is a background concern. There is one code path,
and it is the offline one. Square and Shopify's offline modes are both this shape.

### 9.2 The scoping decision that removes the hardest problem

**Sell products and quantities, not serialized units. Let the server allocate units at
sync time.**

Almost every hard part of options A and B traces back to one fact: Rutba's POS sells
`stock_item` — a specific physical unit. So an offline till has to mirror individual
units, know their live status, and two tills can name the same one.

**The storefront already avoids this, in production.** `order-product-item`
(`src/components/order/order-product-item.json`) carries `product` + `quantity` +
`price` + a `product_name` snapshot, with `stock_item` **optional** — the physical unit
is bound later during fulfilment by `sale-order.attachStockItem`. Web orders have never
allocated units at capture time.

Adopting that model for the lite app:

- the local catalog shrinks from **every stock unit** to a **product price list** —
  orders of magnitude smaller, and it changes rarely rather than on every sale
- staleness stops mattering much: prices drift slowly, unit statuses drift constantly
- **"this specific unit was already sold" cannot occur.** What remains is "insufficient
  stock at sync" — a shortfall on a number, far easier to report and settle than a
  per-unit collision
- the allocator already exists: `stock-item.allocateSellableUnits` (FEFO, opened-first)
  does exactly this today for divisible lines and for `attach-divisible` on web orders

The decision that makes the app lightweight is the same one that removes the hardest
correctness problem. That alignment is the strongest argument for option C.

### 9.3 What it uniquely enables

Because local is primary, sync need not be a live connection: opportunistic, scheduled
batch (end of shift), manual, or **file export carried to a connected machine**. For a
shop with no link at all — only the owner's phone in the evening — that last mode is
the difference between usable and not. Neither A nor B can offer it.

It is also independently sellable: *"works without internet"* is a far easier first
sale in PK than a full ERP, and it fails independently of the main backend.

### 9.4 What it costs

- **Two POS UIs.** The one that bites. Mitigation: make it the app for a *situation* —
  phone seller, market stall, branch with no reliable link — **not** a mode the same
  teller flips into mid-shift at the same till. A fallback gives divergence *and*
  confusion; a separate product for a separate use gives neither.
- **Invoice numbering** needs a per-device range so two apps cannot collide.
- **Decide its refusals up front**: exchanges, returns, pay-later, register close.
  Refusing loudly is a feature (cf. Shopify disabling offline card).
- Effort is not obviously lower than A — but a scoped greenfield app is far more
  **predictable** than retrofitting a large existing surface.

### 9.5 What does not change

The server-side work is **identical across A, B and C**: idempotent replay
([§5a](#5-what-the-server-still-owes-the-proxy)), shortfall/conflict reporting, stock
consumption at sync. Option C simplifies the *client*, not the backend. It should not
be priced as though the whole problem shrinks.

### 9.6 Open question that may decide everything

**FBR digital invoicing (roadmap 0.1) may be the forcing constraint.** An offline sale
cannot obtain an IRN from PRAL at the moment of sale. The roadmap already says "offline
buffer", so it has been considered — but the mandate's rules on how long an invoice may
stay unsubmitted, and what the printed receipt must say meanwhile, could specify the
offline design outright. It constrains A, B and C equally and might decide between
them. **Read this before choosing.**

---

## 10. Build plan

Working name: **`rutba-pos-bridge`**. A Node process the till machine (or a branch box)
runs; the POS's `API_URL` points at it.

### 10.1 Shape

```
pos-sale (unchanged) ──► rutba-pos-bridge ──► cloud API (:4010 / :4020)
                          │
                          ├─ proxy        upstream reachable → pass through verbatim
                          ├─ replicator   passive delta pulls of POS-read entities → SQLite
                          ├─ local reads  upstream down → answer read routes from replica
                          ├─ outbox       upstream down → record writes, answer provisionally
                          └─ replayer     upstream back → drain in order, idempotent, flag conflicts
```

**Local reads come from `rutba-core`, not from new code.** Offline, the bridge must
answer the POS's real routes — `/me/stock-items-search`, `/sales/:id/detail`, the
cash-register endpoints — and rutba-core already implements exactly those routes
against a database through its compat layer. The bridge is therefore rutba-core run
against local SQLite, **plus** the four bridge-specific parts: proxy, replicator,
outbox/provisional-ids (§2), and replayer. This keeps the promise of §6: no second
implementation of the domain, and it lands inside the core-server program.

Offline **behaviour policy** (queue / replica / reject) comes from the descriptors
(§3), read by the bridge at startup — the same files that drive auth drive this.

### 10.2 Phases

| Phase | Contents | Proves |
|---|---|---|
| **0** | Bounded timeout in `lib/api.js` (`withTimeout`, `isNetworkError`) — the reverted implementation was correct; reland it. | The POS can *detect* a dead upstream at all. |
| **1** | Pass-through bridge: transparent proxy + `/bridge/status`; a POS build pointed at it; connectivity indicator in the POS chrome. **No offline behaviour yet.** | The seam. Online behaviour is provably unchanged — run the till through it for days before any offline logic exists. |
| **2** | Replicator (delta endpoint from the reverted build, relanded) + local reads on upstream failure. Writes still fail visibly when offline. | A till can browse, search and price offline. |
| **3** | Outbox + provisional ids + ordered replay; `Idempotency-Key` on the server; conflict flagging (§5b) + a queue/conflicts screen. | A till can *sell* offline and reconcile. The hard phase. |
| **4** | Packaging (Windows service via nssm or node-windows; SQLite file layout; config = upstream URL + branch); LAN exposure for multi-till; register policy; FBR interaction. | Someone other than us can run it. |

Each phase is independently shippable and each one de-risks the next. Phase 1 in
particular is deliberately boring: the bridge earns trust as a proxy before it is
allowed to be clever.

_Amended 2026-08-13 ([§11.1](#111-what-this-replaces-in-10)): phases 0–3 stand as
written. Phase 4's packaging line — "Windows service via nssm or node-windows" — is
replaced by the Electron installer._

### 10.2a Discovery and attachment

How a till finds its bridge. Two candidate mechanisms were considered — a client-side
probe ("is there a local service that can proxy my origin?") and server-directed
assignment (the bridge registers with the origin; the POS asks its origin on load).
**Each alone fails**: a bare probe can't tell the real bridge from a rogue process
answering "yes" (which would then receive every JWT), and pure server-direction fails
at boot exactly when the line is down. The design is server-directed authority with
the probe kept as verification, plus a cache for offline boot:

1. **Registration — bridge → origin.** On startup the bridge registers
   `{branch, desks, url, fingerprint}` with the origin. Stored as a normal content
   type, editable in admin — per-desk assignment is configuration, not convention,
   and it slots into the branch/desk model the POS already carries.
2. **Assignment — POS ← origin.** On load the POS asks its origin for its desk's
   bridge and gets `{url, fingerprint}` or nothing. **Cached in localStorage**; the
   cache is what makes offline boot work — the till uses it immediately and refreshes
   in the background when it can.
3. **Verification — POS → bridge.** Before switching, the POS calls the bridge's
   status endpoint and requires (a) proof of the registered fingerprint and (b)
   confirmation that the bridge proxies *this specific origin* — one bridge must not
   silently front another tenant's upstream. Pass → API base flips to the bridge.
   Fail, mismatch, or silence → direct to origin, bridge ignored.

The bridge is therefore never a point of failure: a dead or wrong bridge degrades to
exactly today's behaviour. The switch itself lives in `api-url-resolver.js` — a file
with a history (the hostname-swap bug), so it changes under test, not casually.

**Mixed-content constraint, decided by the browser not by us:** an HTTPS-served POS
may call `http://localhost:…` (secure-context exemption) but is hard-blocked from
`http://<LAN-IP>:…`. Consequences: the same-machine Windows service needs no
ceremony; a *shared* LAN bridge requires either TLS on the bridge (§7.5) or the POS
app itself being served from the LAN box — which is exactly how the rutba-nvr LAN
deployment already serves it. Both shapes exist in production practice.

_Amended 2026-08-13 ([§11](#11-amendment-2026-08-13--electron-hosts-the-bridge)): the
mixed-content constraint no longer applies to the same-machine case, which is now the
default — the desktop app serves from a secure-context origin. It still governs the
shared-LAN bridge. The discovery handshake above is likewise only needed when till and
bridge are separate machines; step 1 (registration) survives regardless, because
§10.3a(3) issues the bridge's service credential there._

### 10.3 Trust and packaging decisions

- **Localhost by default; LAN exposure is opt-in** (and brings §7.5's TLS question
  with it). A single till never opens a port to the shop network.
- The bridge **never stores credentials** — it forwards the till's JWT and replays
  under the token captured with each queued write (§6). Replay after token expiry is
  an open item under 10.5.
- SQLite, one file per branch, in a directory the service owns. The outbox is
  append-only; nothing deletes a queued sale except a confirmed replay.

_Amended 2026-08-13 ([§11.1](#111-what-this-replaces-in-10)): "the service" is now the
Electron main process for the default single-till deployment. The three bullets hold
under either host; only the packaging beneath them changed._

### 10.3a Authentication and replay identity

Three separate problems, three separate answers — collapsing them into one "offline
auth" mechanism is how this goes wrong.

**(1) Session at the till.** SSO (pos-auth) is unreachable during an outage. Whoever
is already signed in keeps working: the bridge serves the cached `/me/permissions`
snapshot from its replica and the POS gates its UI exactly as today. A fresh login or
shift change mid-outage is impossible under SSO by definition; the industry answer is
**device PINs** (hashed PINs synced in the replica, unlocking a cached identity) —
listed open in §10.5 as a product decision. v1 may honestly ship as "only
already-signed-in users can operate offline."

**(2) Token expiry mid-outage.** JWTs live ~2h; refresh needs the server. The design
fact that decides everything: *a long outage kills any scheme depending on user-token
freshness.* So the bridge does not care — offline, it answers locally whether or not
the presented JWT has expired, and it **captures the JWT as presented on every queued
write**. Not for replay — as *evidence*: the server later verifies that token's
signature while ignoring `exp`, cryptographically tying the queued write to the user
who made it.

**(3) Replay authorization.** The batch drains under the **bridge's own service
credential** — issued at registration (§10.2a), bound to its fingerprint and branch —
with the acting user asserted per call (`X-Rutba-Acting-User` + the captured JWT).
The bridge never stores user credentials; refresh tokens rotate and expire too, so
holding them would fail the multi-day-outage case regardless of the security
argument. Server-side, api-pro treats *trusted-bridge-acting-for-user* as a
**situation** — the slot the layered authorization model (role + claim + situation +
ownership + elevation) already reserves — and evaluates policies against the acting
user's roles: a staff cashier's replayed sale gets staff scoping and `owners`
stamping exactly as if rung online. Precedent: the sale-order integration routes
already gate on `isServiceToken`.

Guards, so the service credential is not a skeleton key:

- **branch-bound** — only its registered branch's data;
- **actor-bound** — only users whose sessions the origin saw pass through this bridge;
- **evidence-checked** — the captured JWT's signature must verify and must name the
  asserted actor, with `iat` consistent with the outage window;
- **endpoint-scoped** — the replay surface only, not the general API.

### 10.4 Connection-dependent services: the deferred-fulfilment QR

**Decided.** Anything that needs a live connection the bridge cannot substitute for —
FBR/PRAL invoicing first among them — is handled by **printing a QR that points at the
sale's page on the Rutba website**, where the customer or an inspector pulls whatever
the invoice needs to carry. All of it configurable per deployment.

Why this works: the QR encodes a *reference*, not the compliance payload. The printed
code never changes; **what it resolves to improves as the sale syncs**:

- offline, unsynced → the storefront's existing "temporarily offline" page (never a
  404 — this rule already exists for storefront QR)
- synced, IRN pending → the invoice, marked "FBR submission in progress"
- IRN obtained → the compliant invoice with the verifiable FBR QR/IRN on it

This rides infrastructure already in production: the QR deep-link resolver ("one
printed code, resolved to the right page at scan time", `365cf4c`) and the
storefront's never-404 rule for scanned codes. The bridge only needs the sale's
identity to be **mintable offline** — which the provisional-id scheme (§2) plus a
per-device invoice-number range already provide — so the QR can be printed before the
server has ever heard of the sale.

Configurability: per tenant/branch, what the offline receipt promises ("pull your
invoice at…"), what the resolved page shows pre- and post-IRN, and which services are
deferred this way. This turns §9.6 from a potential design-forcer into a bounded
question: _does the mandate accept deferred submission with a retrievable invoice, and
within what window?_ That still needs reading, but it now gates a **parameter** (how
loudly to warn, how long the bridge may hold sales), not the architecture.

### 10.5 Still open

1. **Sync-back granularity** — the §9.2 insight survives as a policy question: when a
   sale was rung offline against replica units, should the replayer replay the unit
   references it captured (and flag per-unit collisions), or degrade the sale to
   product+qty and let `allocateSellableUnits` pick real units at sync? The second is
   strictly less conflict-prone; it changes what the receipt's line items mean. This is
   the biggest remaining design decision inside phase 3.
2. **Cash register across an outage** (§7.4).
3. **Offline shift change / fresh login** — device-PIN unlock against synced hashed
   PINs, or restrict offline operation to already-signed-in users (v1)? Product
   decision; mechanism in §10.3a(1). (Token expiry itself is resolved — §10.3a(2)/(3).)
4. **FBR mandate window** — how long a sale may stay unsubmitted, and required receipt
   wording meanwhile (§10.4 bounds this; still read it before phase 3 is specced).
5. **TLS for LAN exposure** (§7.5) — phase 4.
6. **Offline invoice-number ranges per device** — carried over from §9.4; needed for
   the QR to be printable offline without collision.

---

## 11. Amendment (2026-08-13) — Electron hosts the bridge

**Decision.** The bridge runs **inside the Electron main process** of the Rutba desktop
app. It is not packaged, installed, supervised or updated separately.

§10.1's content is unchanged: the bridge is still `rutba-core` against local SQLite plus
the four bridge-specific parts (proxy, replicator, outbox/provisional-ids, replayer),
still reading its offline policy from the descriptors (§3). What changed is only the
process that owns it. The Electron main process is a Node process — the same runtime
§10 already assumed — so the bridge becomes a module it starts, not an executable it
ships alongside.

**Why.** The standalone service was never justified by anything the bridge *needs*. It
was justified by the POS being a web page that had to reach a local process somehow.
Once there is a desktop app, that gap closes and the service is pure cost:

- **One installer.** The user installs one thing. There is no second artifact to sign,
  ship, version-match against the app, or leave stranded at the wrong version after an
  update — and a bridge one release behind its POS is a data-shape bug waiting to
  happen, not a cosmetic one.
- **No supervision to get right.** nssm and node-windows exist to answer "who restarts
  it, under which account, with which working directory, and where do its logs go" —
  every one of which the desktop app already answers for itself. A bridge that dies
  takes the window with it and the user reopens the app: a failure mode a shopkeeper
  can see and act on. A silently dead background service is not.
- **One lifecycle.** Start, stop, upgrade, uninstall and log rotation stop being two
  lifecycles that can disagree. §10.3's "a directory the service owns" becomes the app's
  own userData directory.
- **A smaller permission surface.** No service account, no auto-start registration, no
  firewall rule — a loopback listener inside a user process needs none of them. The LAN
  tier still needs the firewall rule, which is rather the point of it being opt-in.

**What it costs, stated plainly:** the bridge only runs while the app is open. A service
could drain the outbox at 3am with nobody signed in; the in-process bridge drains when
the till is next opened. For a till opened every trading day that is not a real
difference — the outbox is durable across restarts either way (§10.3, append-only) and
§10.4's QR already decouples the receipt from the sync. It becomes a real difference
only for an unattended, always-warm replica, which is the LAN tier's job (§11.2), where
a box that is always on is the entire point.

### 11.1 What this replaces in §10

| Where | What it says | What it says now |
|---|---|---|
| **§10.2, phase 4** | "Packaging (Windows service via nssm or node-windows; SQLite file layout; config = upstream URL + branch)" | Packaging **is** the Electron installer. The rest of phase 4 stands unchanged — SQLite file layout, config, LAN exposure, register policy, FBR interaction — minus the service-supervision work. |
| **§10.2a, discovery** | Bridge registers with the origin → POS asks the origin → POS verifies the fingerprint before switching. | Needed only when till and bridge are on **different machines**. In-process there is nothing to discover and nothing to impersonate: the renderer's bridge is its own. **Step 1 (registration) survives regardless** — §10.3a(3) issues the bridge's service credential at registration, and replay authorization is built on it. |
| **§10.2a, mixed content** | Constrains the same-machine case to loopback. | Retired for the same-machine case (below); still governs a shared LAN bridge. |
| **§10.3, bullet 1** | "Localhost by default; LAN exposure is opt-in." | Unchanged in effect, and now structural rather than a setting: an in-process bridge has no listener to expose until the LAN tier is deliberately turned on. |
| **§10.3, bullet 3** | "in a directory the service owns" | The app's userData directory. Append-only outbox, unchanged. |

**Mixed content.** §10.2a records a rule the browser sets and we don't: an HTTPS-served
POS may call `http://localhost:…` under the secure-context exemption for loopback, but
is hard-blocked from `http://<LAN-IP>:…`. Under the desktop host that rule stops
applying to the shape we ship by default. The renderer loads from the app's own
secure-context origin rather than from a remote HTTPS page, and reaches a bridge inside
its own process over loopback — itself a potentially-trustworthy origin. There is no
mixed-content gate to satisfy, and no dependence on the loopback exemption surviving a
future browser-policy change.

**What §10.2a still governs is the shared LAN bridge**, and nothing here changes it: a
till reaching *another machine's* bridge over plain HTTP still needs either TLS on the
bridge (§7.5, §10.5.5) or the POS served from the LAN box, which is exactly how the
rutba-nvr deployment already serves it. The constraint was not solved. The default
deployment moved out from under it.

### 11.2 §6 keeps its job: the multi-till shape

The LAN tier is not dropped and not deferred. Its argument in §6 is a **correctness**
argument, and the desktop host does not answer it: two tills each running their own
in-process bridge hold two replicas and two outboxes, so during an outage both can sell
the same unit — precisely the collision §6 exists to prevent. A branch with more than
one till that cannot tolerate that still wants one bridge, on a box, with both tills
pointed at it. That remains the strongest correctness claim in this document.

What changed is only which host is the **default**. The desktop host is the default
because it is what a single-till shop installs and the smallest thing that works. The
LAN host is **same core, second host** — §6's own opening ("same core, different host
and storage adapter") now describes a second real deployment rather than an aspiration.

**It also gives §6's tiering guarantee a host it can actually have.** §6 asks for a tier
underneath the LAN proxy, so an unreachable branch box degrades instead of going dark,
and names the in-browser tier for the job — which the decision at the top of this
document had already dropped, leaving that guarantee without a host. The desktop bridge
fills exactly that slot, and fills it better than the browser tier would have: same Node
core, same SQLite adapter, rather than a second storage adapter with a second lifecycle
to get wrong. A till whose LAN bridge is unreachable falls back to its own in-process
bridge and keeps trading. *One implementation, two hosts, degrading in order* — §6's
stated design goal, now with both hosts real and neither of them a browser.

The ordering that follows: **desktop first, LAN second.** Phases 0–3 (§10.2) build the
engine inside the desktop app, where it is easiest to run, watch and debug. The LAN host
is phase 4's "LAN exposure for multi-till", unchanged in content — and by then hosting
the same engine twice is a deployment choice rather than a port.

---

## 12. Amendment (2026-08-13) — one engine, three apps

**This document describes a framework, not a POS feature.** The desktop host carries
three apps, and each wants the same machinery for different reasons:

| App | Where it lives | What offline means for it |
|---|---|---|
| **POS** | `pos-sale` | Keep selling through an outage and reconcile afterwards. The case this document was written for. |
| **Email** | `rutba-mail` (:4021) | Read and compose against mail already pulled; queue sends, flags and moves. `rutba-mail` imports from live IMAP on demand, so an outage today leaves it with almost nothing to show. |
| **Video Studio** | `rutba-social/pages/posts/video-studio.js` + `packages/video-maker` | Edit a project and render it with no connection. `@rutba/video-maker` is browser-engine only — canvas → `captureStream()` → `MediaRecorder`, no ffmpeg — so the **render already runs locally**. What needs the network is loading assets and saving the project. |

None of this is new machinery. Each mechanism in §§2–5 is a **per-app configuration** of
one engine:

| Mechanism | POS | Email | Video Studio |
|---|---|---|---|
| **Descriptor `offline:` (§3)** | `queue` on sale writes, `replica` on stock search, `reject` on exchanges | `queue` on send/flag/move, `replica` on folder and thread reads, `reject` on search across mail never pulled | `queue` on project saves, `replica` on project and media-library reads |
| **Replica (§4)** | response cache for settings and enums; a **collection mirror** for stock search — the one search box that justifies the cost | the mailbox already imported *is* the replica; threads are append-mostly, which is far kinder than stock | project documents, plus assets cached by url — assets are large and **immutable**, so cache-by-url beats a delta feed outright |
| **Outbox (§2)** | sales, payments, stock consumption | sends, flags, moves | project saves, queued publishes |
| **Provisional ids (§2)** | `loc_` sale → sale-items → stock-items | a draft composed offline, referenced by the flag/move calls queued behind it | a new project referenced by its layers and its renders |
| **Ordered idempotent replay (§5a)** | oversell → flag, never double-consume (§5) | **the sharpest case for `Idempotency-Key`**: a replayed send whose response was lost must not mail the customer twice, and unlike a duplicate row it cannot be repaired afterwards | the cheapest case — a duplicated render wastes CPU, not money or trust |
| **`mode: 'reject'` (§3)** | exchanges — a live lookup of the original sale | anything needing a live IMAP round trip | publishing to a social provider: a live third-party call the bridge cannot substitute for |

**What this changes about how the engine gets built:** nothing in §§1–5, and one thing
in §10. The bridge must not come out POS-shaped. §10.1 already says local reads come
from `rutba-core` answering the app's real routes rather than from new code, and the
descriptor files (§3) already describe every app in the monorepo rather than only
`apps: ['sale']` — so the engine is app-agnostic by construction, as long as nothing
hardcodes a sale. The one place to hold that line is §3's audit rule: written there as
"fail when an endpoint reachable from `apps: ['sale']` has no `offline` policy", it
should be **parameterised by app**, so each app declares its own offline surface and
each one's coverage is measurable on its own.

**Where the secure-origin dividend shows up twice.** §11.1's mixed-content point is not
only a POS convenience. In-browser capture — `RecorderDialog` and the editors behind the
Video Studio timeline — is gated on a secure origin: `getUserMedia` / `getDisplayMedia`
are simply undefined at `http://192.168.0.46:<port>`, which is why capture works on dev
and on rutba.pk and cannot work at all on the LAN deploy box. A desktop host serves from
a secure-context origin. The same decision that lets the POS reach its bridge without
ceremony gives the Video Studio its recorder back on machines where it currently has no
recorder to give.

**Cross-references.**

- **POS** — this document; roadmap [0.3](./ROADMAP.md).
- **Email** — [`email-program/`](./email-program/), from
  [00-overview-and-roadmap](./email-program/00-overview-and-roadmap.md); the
  [IMAP gateway](./email-program/02-imap-gateway.md) is what a replica would sit in
  front of.
- **Video Studio** — [v3](./video-studio-timeline-plan.md) (BUILT) is the
  everything-is-a-layer engine model; [v4](./video-studio-v4-plan.md) and
  [v5](./video-studio-v5-rail-plan.md) are the current work.
- **The host itself** — the bridge lands inside the
  [core-server/multitenancy program](./core-server-multitenancy-program/), per §6 and
  §10.1: `rutba-core` run against local SQLite, not a fork of it.

This section implies no sequencing. POS is first and stays the proving ground. The value
of writing it down now is that phases 1–3 should not bake in assumptions that make the
second and third app a rewrite.

---

## 13. Amendment (2026-08-14) — sync execution model

Phase 1 is built: [`packages/sync-core`](../../packages/sync-core/README.md), commit
`c0d7608`. Everything below is about phases 2–3, prompted by a review of standard
Electron offline-sync practice. Most of it confirms decisions already in this document;
three things change, and two must **not** be adopted as usually stated.

### 13.1 The engine runs in a UtilityProcess, not the main process

§11 decided the Electron app hosts the bridge rather than a Windows service. That
argument was about **installers and lifecycle** and it stands untouched: one artifact,
one lifecycle, nothing to supervise. What it did not decide is *which process inside the
app* runs the engine, and "the main process" is the wrong answer.

The main process draws the window and services every IPC call. A replay drain, a delta
pull, or a SQLite query on that event loop freezes the till's UI — and SQLite's
best-known Node bindings are **synchronous by design**, so this is not a hypothetical
slow path, it is the normal one. Electron's `UtilityProcess` is the right host:

- a separate OS process, so its own event loop and its own crash domain — a wedged
  replay does not take the window with it, and it can be restarted without a relaunch;
- still a Node child of the app, so §11's "one installer, one lifecycle" is intact;
- `worker_threads` is the weaker choice here: same process, so a native-module crash is
  still fatal to the app. Keep threads for CPU-bound work *inside* the sync process
  (a large delta merge), not as its host.

**This costs nothing to adopt**, which was the point of phase 1's shape: `createBridge`
never calls `process.exit`, installs a signal handler, or reads a config file, so moving
its host from main to a UtilityProcess is a configuration change, not a port.

### 13.2 The renderer reaches it over loopback HTTP, not Electron IPC

This is the one place the standard Electron recipe should be **declined**. The usual
advice — keep the database in the main process and expose a narrow IPC surface — is
right about isolation and wrong about transport here, for two reasons:

- §1: the monorepo's 548 consumer files all route through `authApi` in
  `packages/api-provider/lib/api.js`, and `npm run validate:endpoint-usage` fails the
  build when a new one doesn't. An IPC channel would be a *second* transport alongside
  it, and the seam this whole design rests on is that there is only one.
- §11.2: the LAN tier serves browser tills **on other machines**, which cannot use IPC
  at all. One transport serves both hosts; IPC serves only one of them.

Loopback HTTP already gives the isolation the advice is actually after — the renderer
holds no database handle and no file descriptor, only a URL.

### 13.3 Confirmed, not changed: the outbox is an append-only operation log

"Record discrete operations, never blindly overwrite state" is already §2 and §10.3:
the outbox is append-only and nothing deletes a queued sale except a confirmed replay.
No change. It is worth restating only because it is the property that makes §5a's
ordered idempotent replay possible at all.

### 13.4 Rejected, with the reason written down: PowerSync, RxDB, PouchDB/CouchDB

These will come up again, so this is why the answer is no.

Every one of them brings its own data model and its own replication protocol. That is a
**second implementation of the domain**, which is precisely what §6 and §10.1 exist to
prevent — "local reads come from `rutba-core`, not from new code."

The decisive objection is narrower than architecture, though. They replicate **rows**.
Every read and write in this system is mediated by api-pro's claim resolution — app,
role, ownership, situation — the same descriptors §3 reads. A generic table replicator
bypasses that entirely: the till's replica would hold rows its operator is not permitted
to see, and a replayed write would land without a policy check. That is a **security
regression**, not a stylistic one, and no amount of configuration in those tools fixes
it because none of them knows what a claim is.

Custom outbox + rutba-core against local SQLite keeps one domain implementation and one
authorization path. Cost accepted: we write the delta feed ourselves (§10.2 phase 2,
and it is not recoverable from the reverted build — see *What this replaces*).

### 13.5 NOT adopted: "the local database is the source of truth"

The phrase is load-bearing and the answer is no. **A till is not the authority on
stock; the server is.** §5's oversell policy — the sale posts, the already-sold unit is
not consumed twice, the discrepancy is recorded for a human — and §4's "detecting the
collision is the server's job" both depend on there being one arbiter. Local-authority
means two tills can each believe they own the same unit with nothing to adjudicate,
which is the exact collision §6 and §11.2 are built to prevent.

What *is* adopted is local-first for **availability**: the till keeps trading through an
outage and reconciles afterwards. Availability-first and authority-first are different
claims and this document only ever made the first one.

### 13.6 Open: local-first *reads* while the link is up

The one genuinely undecided item. §10.1 and §4 chose **remote-first**: proxy when the
upstream is reachable, replica only on failure. The recommendation is the opposite —
always read locally, sync in the background — and it is a real trade, not a mistake:

- **For it:** every read is instant, and the offline path is exercised constantly
  instead of only during an outage, which is the single best defence against phase 2
  shipping a replica nobody has proven.
- **Against it:** it makes every read as stale as the last delta pull, including the one
  collection that justified a mirror in the first place. §4 calls the mirror "a
  photograph" and says its job is to keep the collision window small; remote-first keeps
  that window at **zero** while the link is up.

**Writes are not symmetric and should not move.** Writing locally first means every sale
mints a provisional id and takes a replay path even on a perfect link — it promotes §2's
machinery from an outage-only mechanism to an always-on one, and multiplies its blast
radius accordingly.

**Proposal, to decide with phase 2's numbers, not now:** keep remote-first for both, and
revisit read-through-replica as a per-collection *latency* facet on the descriptor (§3),
where stock search can opt in and settings need not. Measure first — if the proxy hop
costs single-digit milliseconds on a healthy link, the trade is not worth the staleness.

### 13.7 What this replaces

| Where | What it says | What it says now |
|---|---|---|
| **§11**, opening | "The bridge runs **inside the Electron main process**." | Inside the Electron **app**, in a `UtilityProcess`. The installer/lifecycle argument is unchanged; only the host process within the app is narrowed (§13.1). |
| **§10.2, phase 1** | Pass-through bridge + `/bridge/status`. | **BUILT** — `packages/sync-core`, `c0d7608`. §10.2a discovery skipped by §11.1's rule (same machine, nothing to discover). |

---

## What this replaces

An earlier build of 0.3 landed the server half — an atomic idempotent
`POST /sales/offline-sync`, a catalog snapshot delta endpoint, `client_sale_id`
identity, conflict recording — with an in-browser outbox planned on top. It was
reverted at `365cf4c` in favour of this design.

What carries over: the bounded timeout (slice 0), the oversell policy (§5), the
`capture_status: pending` answer for 0.2 (§7.6), and the delta-snapshot protocol
(slice 2). What it got wrong: offline logic living in `saleApi` — one flow's solution
to a platform's problem — and per-resource idempotency columns where a generic
`Idempotency-Key` does the job for every endpoint at once.
