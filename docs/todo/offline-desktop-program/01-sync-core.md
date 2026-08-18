# 01 — `@rutba/sync`

> **Status: specification only.** The engine described in
> [`offline-pos-options.md` §§1–5 and §10.1](../offline-pos-options.md#101-shape),
> extracted into a package with a name. Those sections are the design; this
> document says what the package is, what it reuses, and who consumes it.

The bridge is **`services/core` run against local SQLite, plus four bridge-specific
parts** — [§10.1](../offline-pos-options.md#101-shape). `@rutba/sync` is
those four parts, packaged so the host is a detail:

```
                     ┌──────────────── @rutba/sync ────────────────┐
app (unchanged) ────►│ proxy ──► response cache ──► outbox ──► replayer │────► upstream API
                     │              ▲                    ▲              │      (:4010 / :4020)
                     │              │                    │              │
                     │         replicator ───────────────┘              │
                     │              │                                   │
                     └──────────────┼───────────────────────────────────┘
                                    ▼
                        services/core on SQLite  ← local reads answer real routes
```

Everything above the dashed line is app-agnostic. Everything below it is
`services/core` doing what it already does, against a different Knex client.

## The five parts

### 1. Proxy

Upstream reachable → pass through **verbatim**. Not "mostly verbatim": same
headers, same body, same status, same error shape. Online behaviour must be
byte-for-byte today's behaviour, because that is the only claim that makes D1
shippable on its own ([§10.2 phase 1](../offline-pos-options.md#102-phases)).

- Forwards the caller's JWT untouched. The bridge **never mints tokens and never
  stores credentials** — [§6](../offline-pos-options.md#6-lan-mode),
  [§10.3](../offline-pos-options.md#103-trust-and-packaging-decisions).
- Exposes `/bridge/status`: reachability, replica age per collection, outbox
  depth, conflict count. This is what the shell's connectivity indicator and
  queue screen read ([02](02-desktop-shell.md#connectivity-and-the-queue-live-in-shell-chrome)).
- Decides "reachable" from the bounded timeout in
  [04 §1](04-server-prerequisites.md#1-bounded-timeout-in-the-axios-seam). Without
  it there is no signal to decide on — which is why that prerequisite gates
  everything else.

- [ ] Pass-through fidelity test: replay a recorded session of real POS traffic
      through the proxy and diff every response against direct-to-upstream.
- [ ] Reachability is a debounced state, not a per-request coin flip. Flapping
      between proxy and local mid-transaction is worse than either mode.

### 2. Response cache — L1

Store each GET response keyed by **(path, params)**; serve the last one offline.
This is [§4](../offline-pos-options.md#4-reads-two-layers-deliberately)'s first
layer and the default for `mode: 'replica'`.

Near-zero cost, and it covers settings, enums, branch/desk and any list already
viewed. It is useless for exactly one thing: **a search box**, where the user
types a query nobody has typed before. That single gap is what layer 2 exists for,
and keeping it a special case is what keeps the transfer cost small.

- [ ] Key normalization: `qs.stringify` ordering must not produce two keys for
      one logical request. `api.js` builds query strings via `querify()`
      ([`lib/api.js:544`](../../../packages/api-provider/lib/api.js)) — normalize
      against that, not against the raw URL string.
- [ ] Every cached response carries its age, and the age is reachable by the
      shell. A stale price shown without a timestamp is a support call.

### 3. Replicator

Passive delta pulls of the entities an app reads, into SQLite, **whenever there is
a connection** — so the local copy is warmed continuously rather than on demand.
This is layer 2, opt-in per collection, and the reason it can answer arbitrary
local queries is that the rows are real rows in a real schema, not cached blobs.

The delta-snapshot protocol from the reverted 0.3 build carries over
([§10.2 phase 2](../offline-pos-options.md#102-phases), and the
[what-this-replaces note](../offline-pos-options.md#what-this-replaces)).

> A mirror is a photograph. Between two pulls another till can sell the unit this
> one is about to scan, and no amount of syncing closes that window while the link
> is down. The mirror's job is to keep the window small and to tell the till how
> old its picture is; **detecting** the collision is the server's job
> ([§5b](../offline-pos-options.md#5-what-the-server-still-owes-the-proxy)).

- [ ] Cursor per collection on `updatedAt`, plus tombstones for deletes — the
      same two mechanisms the CMS sync engine needs
      ([06 §Change detection](../core-server-multitenancy-program/06-plugin-replacement-map.md#replacement-services/core-content-sync-module-or-standalone-worker)).
      Decide per collection in a manifest; do not invent a third scheme.
- [ ] Backpressure: a replicator that saturates a 3G link during trading hours is
      a worse outage than the one it prevents.

### 4. Outbox + provisional ids

The hard part, specified in full at
[§2](../offline-pos-options.md#2-the-hard-part-provisional-ids). Not re-derived
here. The properties that matter to the package boundary:

- Writes land in a **durable, append-only** outbox. Nothing deletes a queued
  write except a confirmed replay
  ([§10.3](../offline-pos-options.md#103-trust-and-packaging-decisions)).
- The proxy answers immediately with a synthesised response carrying a
  provisional id, `loc_<uuid>`.
- Provisional ids are **syntactically distinct**, so a rewrite pass can find them
  exhaustively and one that escapes to the server is loud in the database rather
  than silently wrong.
- Rewrite-on-replay must cover **both** places an id appears: **path segments**
  (`PUT /stock-items/loc_y`) and **body values at any depth**
  (`{ sale: { connect: ['loc_x'] } }`).
- Each queued write captures the JWT **as presented**, as evidence rather than as
  a credential — [§10.3a(2)](../offline-pos-options.md#103a-authentication-and-replay-identity).

- [ ] "At any depth" means arrays, nested objects, and objects inside arrays. The
      test that catches the real bug is a `connect` array nested two levels inside
      a component, not a top-level string.
- [ ] A provisional id that reaches the upstream is a hard error at the replayer,
      never a best-effort write. Fail the group and flag it.
- [ ] Reads issued offline against a provisional id resolve from the local store,
      so a page that re-reads what it just wrote behaves normally
      ([§2](../offline-pos-options.md#2-the-hard-part-provisional-ids)).

### 5. Replayer

Drains the outbox in order on reconnect: idempotent, per-group, conflicts flagged
rather than guessed at.

## The replayer is `events.js` in a different costume

**Do not invent this.** [`services/core/src/platform/events.js`](../../../services/core/src/platform/events.js)
(606 lines, tables `core_events` and `core_event_deliveries`) is already a correct
transactional outbox, and its docblock enumerates exactly the properties the
replayer needs:

| Replayer requirement | What `events.js` already does |
|---|---|
| Durable log written inside the caller's transaction | `emit()` writes through `getDb()` so it joins the ambient `withTransaction()` and commits with the state change it describes |
| Ordered drain, not global serialization | Ordering is **per aggregate** (`entity_uid` + `document_id`) per subscriber; a stuck event blocks its own aggregate and only its own |
| At-least-once with idempotent handlers | Stated as the delivery guarantee; `event_id` is the stable dedupe key |
| Exponential backoff with a ceiling | `backoffMs()`, tuned by `RUTBA_CORE_EVENTS_BACKOFF_MS` / `..._BACKOFF_MAX_MS` |
| Dead-letter after N attempts | `dead` status after `maxAttempts` |
| Deliberate replay as an admin act | `replayDead(eventId, subscriber)` |
| Per-handler timeout | `withTimeout(promise, ms, name)`, `RUTBA_CORE_EVENTS_TIMEOUT_MS` |
| Retention | `purgeDeliveredEvents()`, `RUTBA_CORE_EVENTS_RETENTION_DAYS` |
| "Nothing to do" is success, not a retry | `isBusinessOutcome()` / `BusinessNoOpError` — the failure classification that stops a queue filling with non-problems |

The mapping is close to one-to-one: a queued write is an event, a `group: 'sale'`
is an aggregate, the upstream call is the handler, `onConflict: 'flag'` is a
business outcome rather than a retryable failure. What the replayer adds on top is
**id rewriting between deliveries** — the outbox's own output feeds the next
delivery's input, which `events.js` has no notion of.

Three constraints inherited with the engine, all documented in its own docblock:

- **Fan-out happens at emit time.** Subscribers must be registered during module
  init, before anything emits. A subscriber added later gets no backfill.
- **The dispatcher must run in exactly one process.** In core that is
  `RUTBA_CORE_CRONS=1`, and a real leader lock is a known gap. In the desktop
  there is one process by construction, so the gap does not apply. It reappears
  at **D7**, and not where you would expect: one LAN bridge serving two tills is
  still one dispatcher, but [§6's tiering guarantee](../offline-pos-options.md#6-lan-mode)
  — a till falling back to its own in-process bridge when the branch box is
  unreachable — puts a second dispatcher on overlapping data. Spec the fallback's
  drain rules before D7, not during it.
- **Handlers must be idempotent**, which is precisely why
  [04 §3](04-server-prerequisites.md#3-a-generic-idempotency-key-and-a-dedupe-table)
  is a prerequisite and not a nicety.

- [ ] Decide explicitly: extend `events.js` with a second table pair, or extract
      its dispatcher into a reusable core it and the replayer both call. The
      second is cleaner and is a refactor of working code, so it needs the
      existing helpdesk consumers green before and after.
- [ ] Whichever way it goes, the replayer must not fork the backoff, dead-letter
      or classification logic. Two copies of `isBusinessOutcome` is how the two
      diverge.

## Descriptors drive it

Offline **behaviour** policy — `queue` / `replica` / `reject` / `passthrough` —
comes from the descriptors, read by the bridge at startup. Same files that drive
auth drive this ([§3](../offline-pos-options.md#3-descriptors-declare-offline-policy),
[§10.1](../offline-pos-options.md#101-shape)).

The engine is therefore app-agnostic **by construction**, as long as nothing
hardcodes a sale. [§12](../offline-pos-options.md#12-amendment-2026-08-13--one-engine-three-apps)
names the one place to hold that line: §3's audit rule must be **parameterised by
app**, not written as `apps: ['sale']`. That is specced in
[04 §5](04-server-prerequisites.md#5-descriptor-offline-facet-and-an-audit-that-fails-the-build).

## Four consumers, one engine

This is not a desktop-only package, and saying so now is what stops it being
built desktop-shaped.

[`core-server-multitenancy-program/06`](../core-server-multitenancy-program/06-plugin-replacement-map.md)
has already ruled that `strapi-content-sync-pro` must be **replaced by a
contract-level sync engine** whose design principle is *"sync speaks the wire
contract, never the database"* — so that any pairing works during and after the
strangler: Strapi↔Strapi, Strapi↔core, core↔core. That is the same engine.

| Consumer | What it syncs | Where it is committed |
|---|---|---|
| **Desktop offline** | An app's reads and writes against a local replica | This program |
| **CMS promotion** | CMS content between instances, replacing sync-pro | [06 §strapi-content-sync-pro](../core-server-multitenancy-program/06-plugin-replacement-map.md#strapi-content-sync-pro--replace-with-a-contract-level-sync-engine) |
| **LAN ↔ online instance** | A branch box's replica against the cloud origin | [offline-pos-options §6](../offline-pos-options.md#6-lan-mode), §11.2 |
| **Per-tenant content promotion** | Golden/demo content into a fresh tenant; staging→production | [06 §Multitenancy bonus](../core-server-multitenancy-program/06-plugin-replacement-map.md#multitenancy-bonus) |

What each consumer configures differently: the manifest (which collections, which
direction, which conflict policy), the identity scheme, and the transport
endpoint. What none of them may change: the outbox semantics, the ordering
guarantee, or the rule that sync never touches the database directly.

> Commerce copy-over (the `rutba` marketplace adapter + worker, identity via
> `external_ids.rutba_origin`) is **already** contract-level and survives the
> migration untouched — [06 §1](../core-server-multitenancy-program/06-plugin-replacement-map.md#strapi-content-sync-pro--replace-with-a-contract-level-sync-engine).
> It is the proven pattern this engine generalizes, not a fifth consumer to build.

## Package boundary

- [ ] `@rutba/sync` depends on `@rutba/api-provider` (for descriptors) and
      on nothing Electron-specific. It must be runnable headless — that is what
      makes D1 testable before D2 exists, and what makes D7's LAN host a
      deployment choice rather than a port.
- [ ] Storage is an adapter interface with **one** implementation (SQLite) in v1.
      The in-browser tier was dropped precisely so there is one storage adapter;
      do not add a second speculatively.
- [ ] `services/core` is a peer, not a bundled dependency. The bridge starts it; it
      does not vendor it.
- [ ] Keep it a **workspace package**, unpublished, until a second repo needs it.
      Every npm publish is ongoing overhead, and the only consumers today are in
      this monorepo.

## Open, and inherited

These are [§10.5](../offline-pos-options.md#105-still-open)'s items that land on
the engine rather than on the shell or the server. They are listed, not resolved.

1. **Sync-back granularity** ([§10.5.1](../offline-pos-options.md#105-still-open)) —
   the biggest remaining design decision inside D4. See
   [03 §POS](03-app-policies.md#pos--apps/sales/pos).
2. **Replay after token expiry** — resolved in mechanism by
   [§10.3a(2)/(3)](../offline-pos-options.md#103a-authentication-and-replay-identity);
   the service credential and its four guards are what the engine must implement.
3. **Batch endpoint for atomic group replay**
   ([§5c](../offline-pos-options.md#5-what-the-server-still-owes-the-proxy)) —
   closes the half-visible-sale window. Worth doing, not worth blocking on.
