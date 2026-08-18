# 04 — Server prerequisites

> **Status: specification only.** Five changes. All small, all independently
> correct, all gating. None of them needs the rest of this program to be worth
> landing, and three of them fix bugs that exist today with no offline app in
> sight.
>
> They are phase **D0** in [README §Phases](README.md#phases). Start here.

| # | Change | Size | Gates | Correct on its own? |
|---|---|---|---|---|
| 1 | [Bounded timeout in the axios seam](#1-bounded-timeout-in-the-axios-seam) | S | Everything — the client cannot detect a dead upstream without it | **Yes** — fixes the SSR-hang trap |
| 2 | [A SQLite driver for services/core](#2-a-sqlite-driver-for-services/core) | S (driver) / M (parity) | D3 and everything after | Yes — a second client is useful for tests |
| 3 | [Generic `Idempotency-Key` + dedupe table](#3-a-generic-idempotency-key-and-a-dedupe-table) | M | D4, and Mail's `send` at all | Yes — replay-on-flaky-link is a live failure mode |
| 4 | [Conflicts that are distinguishable](#4-conflicts-that-are-distinguishable) | S | D4's conflict flagging | Yes — a 500 for a lost race is wrong today |
| 5 | [Descriptor `offline:` facet + an audit that fails the build](#5-descriptor-offline-facet-and-an-audit-that-fails-the-build) | S | D5, and the readiness gate | Yes — makes coverage measurable |

---

## 1. Bounded timeout in the axios seam

**Measured: zero axios calls in `packages/api-provider` set a `timeout`.** Every
request in the repo's main HTTP path is unbounded.

The consequence is exactly the thing the bridge must be able to do: **without a
bound, the client cannot detect a dead upstream at all.** It cannot distinguish
"slow" from "gone", so it cannot decide to serve locally. Every layer above it —
proxy, cache, outbox — is built on a signal that does not exist yet.

This is already named twice in the design, both times as the first thing to do:
[§8 slice 0](../offline-pos-options.md#8-sequencing) (*"Independently correct;
land it regardless of which design wins"*) and
[§10.2 phase 0](../offline-pos-options.md#102-phases) (*"the reverted
implementation was correct; reland it"*). The names to reland are `withTimeout`
and `isNetworkError`.

**It also independently fixes a known production trap:** a wedged backend
currently hangs any SSR page forever. `getServerSideProps` awaits an axios call
with no bound, the request never returns, and the page never renders — no error,
no timeout, no log.

- [ ] `withTimeout` on the shared helpers in
      [`lib/api.js`](../../../packages/api-provider/lib/api.js) — `get` (190),
      `getAll` (206), `getWithPagination` (227), `post` (235), `patch` (242),
      `put` (249), `del` (256), `uploadFile` (304), `deleteFile` (320).
- [ ] **Do not miss `refreshAccessToken`.** It posts to `/auth/refresh` with raw
      `axios.post` at [line 158](../../../packages/api-provider/lib/api.js),
      bypassing every helper above. A dead upstream there hangs the refresh
      promise, and `_refreshPromise` is memoized (line 150) — so **every**
      subsequent call in the tab awaits the same dead promise. One unbounded call
      wedges the whole session.
- [ ] Two different bounds. Uploads and `getAll`'s pagination loop legitimately
      take minutes; a `/me/permissions` call that takes 30 seconds is dead.
- [ ] `isNetworkError` must classify **timeout, DNS failure, connection refused
      and 5xx** distinctly from a clean 4xx. The bridge routes on this
      classification, and treating a 403 as "upstream down" would serve stale
      local data to a user who has just lost access.
- [ ] **Cover the five seam-bypassing files too**, or accept and document that
      they stay unbounded.
      [`shared/context/AuthContext.js`](../../../packages/shared/context/AuthContext.js)
      is the one that matters for the desktop: raw axios to `/users/me` (line 154)
      and `/auth/refresh` (line 427). Those are the first calls a cold desktop
      start makes, so an unbounded one there is a launcher that never finishes
      loading. The other four are in `apps/content/storefront/src/services/`, which is not in
      the desktop set.

---

## 2. A SQLite driver for services/core

[`services/core/src/config/env.js`](../../../services/core/src/config/env.js) maps two
clients and assumes a network connection:

```js
function dbConfig() {                                              // line 106
  const client = get('DATABASE_CLIENT', 'mysql');
  const clientMap = { mysql: 'mysql2', postgres: 'pg' };           // line 108
  return {
    client: clientMap[client] || client,
    connection: {
      host: get('DATABASE_HOST', '127.0.0.1'),                     // line 112
      port: parseInt(get('DATABASE_PORT', …), 10),
      database: …, user: …, password: …,
      ...(client === 'mysql' ? { decimalNumbers: true, dateStrings: ['DATE'] } : {}),
    },
    pool: { min: 0, max: 10 },
  };
}
```

SQLite has no host, no port, no user and no password. It wants
`connection: { filename }` plus `useNullAsDefault: true`, and a pool of one.

**Knex `^3.1.0` is already a dependency** (`services/core/package.json`), so the
change is contained: a third entry in `clientMap`, a branch in the connection
shape, and one driver package.

> **The driver map is the easy half.** Line 119's `decimalNumbers: true` and
> `dateStrings: ['DATE']` exist for a specific reason, stated in the code: *"Contract
> parity with Strapi's serialization (see contract-diff.js): decimals as numbers,
> DATE columns as yyyy-mm-dd strings."* SQLite has **no DATE type and no DECIMAL
> type** — dates are text or numbers by convention, and decimals are floats unless
> handled. So the wire responses a SQLite-backed core produces can differ from the
> MySQL-backed one in exactly the ways the golden contract tests were written to
> catch. **That is the real work in this item**, and it is why the size is S for
> the driver and M for the parity.

- [ ] Add `sqlite: 'better-sqlite3'` to `clientMap`, branch the connection shape,
      force `pool: { min: 1, max: 1 }`.
- [ ] Run the **golden contract test suite**
      ([core-server-multitenancy 01](../core-server-multitenancy-program/01-contracts-freeze.md))
      against SQLite and treat every diff as a bug in the adapter, not as an
      acceptable difference. A replica that answers a slightly different shape
      than the upstream is a dual-mode bug wearing a disguise — precisely what
      ground rule 1 exists to prevent.
- [ ] Decide where DDL comes from. Core *"serves the routes but has no DDL of its
      own; every table still comes from booting Strapi against a changed
      `schema.json`"*. A desktop install cannot boot Strapi, so the replica's
      schema has to be materialized some other way — generated from the registry,
      or shipped as a versioned SQL file in the container. **Decide this in D3.**
- [ ] Migrations on upgrade: an installed replica outlives desktop releases. The
      outbox especially — it is append-only and may be non-empty across an
      upgrade ([02 §Updates](02-desktop-shell.md#updates)).

---

## 3. A generic `Idempotency-Key` and a dedupe table

Specified at
[§5a](../offline-pos-options.md#5-what-the-server-still-owes-the-proxy). A
replayed `POST` whose response was lost in transit must not create a second row.

Note *which* failure mode this addresses, because it is the one that actually
dominates on a bad link and the one a database transaction does nothing about:
the write **succeeded** and the response was lost. The client cannot tell that
from a write that never landed, and retrying is the only thing it can do.

**A generic header plus a dedupe table (key → status, response, expires) covers
every endpoint the bridge handles.** This is explicitly better than the
per-resource `client_sale_id` column the reverted build used — one mechanism
instead of one column per content type, and it works for the next flow without
a schema change.

- [ ] `Idempotency-Key` accepted on every mutating route, honoured in one place
      (middleware), not per controller.
- [ ] Store the **response**, not just the key. A replay must return what the
      first attempt returned, or the bridge's id map gets a different id the
      second time and the rewrite pass corrupts everything queued behind it.
- [ ] Store the **in-flight** state too, so two concurrent replays of the same key
      do not both execute. Key → `{ status: in_flight | done, response, expires }`.
- [ ] Expiry long enough to cover a realistic outage. A multi-day outage is the
      case the whole design is for; a 24-hour dedupe window silently fails it.
- [ ] **Mail's `send` blocks on this** — see
      [03 §Send is the sharpest case](03-app-policies.md#send-is-the-sharpest-case-for-idempotency-key).
      Until it is landed and proven, `send` is `reject`, not `queue`.

---

## 4. Conflicts that are distinguishable

Specified at
[§5b](../offline-pos-options.md#5-what-the-server-still-owes-the-proxy). When a
replayed write lands on a unit another till already sold, the response must say so
in a form the bridge can route to `onConflict: 'flag'` — **a `409` with a stable
code, not a `500`.** Today that path mostly throws.

A 500 is indistinguishable from a server bug, so a generic replayer does the only
safe thing available to it: retries forever, or gives up and drops the write.
[§3](../offline-pos-options.md#3-descriptors-declare-offline-policy) says both are
wrong.

There is already a precedent in this repo, and it should be generalized rather
than copied a second time:

- [`routing.service.js:169`](../../../services/core/src/domain/helpdesk/routing.service.js)
  defines a local `ConflictError` and notes, in its own comment, that
  *"409 is not in the server's name→status map, so it is carried explicitly"*
  (`this.status = 409`).
- [`ticket.repo.js:275`](../../../services/core/src/domain/helpdesk/repository/ticket.repo.js)
  has the right shape already: a compare-and-swap whose zero-rows-changed case
  *"owes the loser a 409 carrying the state that actually won."*

- [ ] Add `ConflictError: 409` to `ERROR_NAME_STATUS` and `409: 'ConflictError'`
      to `STATUS_ERROR_NAME` in
      [`services/core/src/http/server.js`](../../../services/core/src/http/server.js)
      (the two maps at lines 37 and 46), plus a `ctx.conflict` helper alongside
      `ctx.badRequest` / `ctx.forbidden` (lines 60–63). Then retire helpdesk's
      local class.
- [ ] **Carry the winning state in the body**, as `ticket.repo.js` already does.
      A 409 that only says "conflict" forces the human resolving it to go and look
      up what happened; a 409 that says *"unit ABC was sold at 14:22 on till 2"*
      is a queue screen a shopkeeper can actually clear.
- [ ] A **stable machine-readable code** per conflict class, distinct from the
      message. The bridge routes on the code; the human reads the message.
- [ ] Do the same on the services/strapi side for as long as it serves these routes.
      Half the surface returning 409 and half returning 500 is worse than either.

---

## 5. Descriptor `offline:` facet, and an audit that fails the build

Specified at [§3](../offline-pos-options.md#3-descriptors-declare-offline-policy).
**Measured today: 0 of the 181 modules under `api/*.js` carry an `offline:`
facet** — the string does not appear in the directory at all.

The facet:

```js
offline: {
    mode: 'queue',        // queue | replica | reject | passthrough
    mints: 'sale',        // the response carries a new id others will reference
    group: 'sale',        // replay unit — drains together, reported together
    onConflict: 'flag',   // flag | retry | drop
}
```

What it buys beyond tidiness: **one place knows an endpoint exists, and the same
place knows what it does offline.** No parallel registry to drift — the same
property that makes descriptors the source of authorization truth.

[§7.2](../offline-pos-options.md#7-open-questions) records the honest cost — *"it
also adds a facet to ~120 descriptor files that most of them will set to
`passthrough`"* — and the current count is higher still, 181 under `api/*.js` plus
20 under `api/web/`. The mitigation §7.2 names is a **default-by-method rule**
(GET → `replica`, writes → `passthrough`), so only the interesting ones are
written out. Take it; the alternative is 200 files of noise for a signal that
lives in perhaps thirty of them.

### The audit

> **A correction worth recording.** [§3](../offline-pos-options.md#3-descriptors-declare-offline-policy)
> and the brief for this program both cite `scripts/descriptor-audit.mjs`. The
> file is at **[`services/core/scripts/descriptor-audit.mjs`](../../../services/core/scripts/descriptor-audit.mjs)**.
> There is no `descriptor-audit.mjs` at the repo root or in
> `packages/api-provider/scripts/`.

That file is already the right tool, and describes itself as *"the AUTHORITATIVE
coverage gate"*: it imports every descriptor module, calls every endpoint-builder
export with placeholder arguments, reads the `{ path, method }` each returns, and
reports anything it cannot resolve *"so it can never be silently dropped from the
count."* Its existing job is comparing core's route table against *"what the
FRONTENDS ACTUALLY CALL"* — which is exactly the population an offline audit
needs.

- [ ] Extend it: an endpoint reachable from an offline-capable app with **no
      `offline:` policy FAILS the build.**
- [ ] **Parameterise the rule by app.** §3 writes it as `apps: ['sale']`;
      [§12](../offline-pos-options.md#12-amendment-2026-08-13--one-engine-three-apps)
      already ruled it must be per-app, *"so each app declares its own offline
      surface and each one's coverage is measurable on its own."* Hardcoding
      `sale` is how the engine comes out POS-shaped.
- [ ] The offline-capable app list is **data**, not a constant in the script.
      Adding Rider later must not mean editing the audit.
- [ ] Cross-check against
      [`validate-descriptor-apps.mjs`](../../../packages/api-provider/scripts/validate-descriptor-apps.mjs),
      which already fails the build on an `apps: [...]` key absent from
      `domains.json`. An offline audit keyed on a misspelt app key would pass
      vacuously — that validator is what stops it, so the two must run together.

---

## The offline-readiness gate

**"Is app X offline-ready?" must be a build check, not an opinion** (ground rule
6). Three conditions, each mechanically checkable, all three required:

| # | Condition | Checked by |
|---|---|---|
| **G1** | Every endpoint reachable from `apps: ['x']` carries an `offline:` policy | `descriptor-audit.mjs`, extended per §5 |
| **G2** | Every read route the app uses is **ported in services/core** | `descriptor-audit.mjs` in its existing job |
| **G3** | A smoke test runs the app against the bridge **with the upstream killed** | New, in the desktop pipeline |

### G2 is the real ceiling

An unported custom action answers **`501 NotPortedError`**
([`services/core/src/http/server.js:284`](../../../services/core/src/http/server.js)),
and core logs the split at boot: *"mounted N routes … P custom ported; C custom →
501"*.

Offline, a 501 is not a degraded read. It is a **dead feature** — the button does
nothing, and no amount of caching or queueing helps, because there is no local
implementation to reach. This, not the descriptor annotation, is what actually
determines which apps can join the desktop and when.

It is measurable **today**, before any of this is built. Run the audit per app
and the answer is a number.

- [ ] Publish the per-app 501 count as a standing metric, so "can Rider join?" has
      an answer that does not require a meeting.
- [ ] G2 covers **read** routes specifically. A write route that 501s offline is
      acceptable if its descriptor says `mode: 'queue'` — the bridge never calls
      core for it, it goes to the outbox. A **read** that 501s is a blank screen.
      Do not conflate the two, or the gate will demand a port that L3 makes
      unnecessary.

### G3 is the one that catches what the others cannot

G1 and G2 are static. They prove the policy exists and the route is ported; they
prove nothing about what the app *does* when the answer arrives from a replica
instead of from production.

- [ ] Launch the app in the shell against the bridge, kill the upstream, and drive
      the core flow: for POS, a complete sale; for Mail, open a cached folder and
      queue a flag; for Studio, open a project and render.
- [ ] Assert the **queue drains correctly** afterwards, not just that the UI
      survived. Half the failure modes in this program are invisible until replay.
- [ ] Run it in the packaged container, not `next dev`. Baked origins, lazy
      servers, hidden-window throttling and the updater are all things only the
      packaged build has — and each has its own way of turning a green dev run
      into a broken install.

### What the gate does not cover

Stated so nobody mistakes a green gate for a solved problem:

- **The mirror is a photograph.** Two tills can still sell the same unit during an
  outage while both replicas say it is in stock. That is
  [§6](../offline-pos-options.md#6-lan-mode)'s correctness argument and it is
  answered by the LAN host (D7), not by any gate.
- **Offline JWT validation is shape-and-expiry only.** A real weakening,
  unchanged.
- **The FBR mandate window** ([§10.5.4](../offline-pos-options.md#105-still-open))
  bounds how long a sale may stay unsubmitted.
  [§10.4](../offline-pos-options.md#104-connection-dependent-services-the-deferred-fulfilment-qr)
  turned it from an architecture-forcer into a parameter, but the reading is still
  owed before D4 is specced.
- **Cash register across an outage** ([§10.5.2](../offline-pos-options.md#105-still-open))
  and **offline shift change** ([§10.5.3](../offline-pos-options.md#105-still-open))
  are product decisions, not gate conditions. v1 may honestly ship as *"only
  already-signed-in users can operate offline."*
