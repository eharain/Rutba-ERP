# @rutba/sync

<!-- verify-docs: planned 4030 -->
<!-- 4030 is the bridge's loopback default, bound in-process by the desktop
     shell that will host it (§11). It is deliberately not a deployed service,
     so it is absent from scripts/rutba_apps.sh and stays absent; the marker
     above is what keeps verify-docs from reading that absence as drift. -->

Two things live here, for one reason: **one sync engine, four consumers** —
the offline desktop replica, CMS staging→production promotion,
instance↔instance copy-over, and cloning golden content into a freshly
provisioned tenant ([erp2-program](../../docs/todo/erp2-program/README.md) §3a).
They differ in manifest, not in mechanism, so they get one implementation.

| | What it is | Status |
|---|---|---|
| [**the bridge**](#the-bridge) | a transparent pass-through proxy in front of the Rutba API | phase 1, done |
| [**the engine**](#the-engine) | contract-level replication — the replacement for `strapi-content-sync-pro` | v1: plan + apply, done; media hand-off and the core module next |

The two are independent today. The bridge's later phases (replica + outbox)
become a consumer of the engine rather than a second implementation of it.

---

# The engine

`import { planRun } from '@rutba/sync/engine'`

**It speaks the wire contract, never the database.** That is the one design
constraint everything else follows from, and it is what makes any pairing work
during and after the strangler — Strapi↔Strapi, Strapi↔core, core↔core. The
plugin it replaces synced through Strapi's internal document service, so it
broke the moment one side migrated and the other had not.

**It performs no I/O.** `planRun` takes a manifest, the schemas, and two
snapshots, and returns a plan: creates, updates, deletes, links, conflicts,
orphans, and everything it decided not to do. A plan can be printed, read by a
person, diffed against last time, and applied later. The plugin's only way to
find out what a run would do was to let it do it.

```js
import { parseManifest, planRun } from '@rutba/sync/engine';

const manifest = parseManifest({
    name: 'cms-promotion',
    origin: 'rutba-lan',                                   // this instance
    direction: 'push',
    target: { baseUrl: 'https://api.rutba.pk', tokenEnv: 'RUTBA_SYNC_TARGET_TOKEN' },
    types: [
        { uid: 'api::cms-menu.cms-menu',           plural: 'cms-menus' },
        { uid: 'api::cms-menu-item.cms-menu-item', plural: 'cms-menu-items' },
        // site-setting is a per-app collection, one row per app_slug — not a
        // single type, whatever the older cms-sync docs say.
        { uid: 'api::site-setting.site-setting',   plural: 'site-settings',
          identity: { strategy: 'naturalKey', fields: ['app_slug'] } },
    ],
});

const plan = planRun({ manifest, schemas, snapshots });
console.log(plan.summary);
// { creates: 3, updates: 0, unchanged: 0, conflicts: 0, deletes: 0, orphans: 0,
//   links: 4, linksSettled: 0, unresolvedLinks: 0, relationsOutOfScope: 1,
//   typesWithoutSchema: 0 }
```

Applying it is a separate call, so the plan above can be printed, approved, or
thrown away first:

```js
import { applyPlan, createClient } from '@rutba/sync/engine';

const client = createClient({ baseUrl: manifest.target.baseUrl, token: process.env[manifest.target.tokenEnv] });

const report = await applyPlan({ plan, manifest, client, snapshots, dryRun: true });
console.log(report.summary);
// { created: 3, updated: 0, deleted: 0, errors: 0,
//   linksApplied: 4, linksSkipped: 0, linkErrors: 0, typesAborted: 0 }
```

`dryRun` performs no writes and still reports the full shape of the work, so
"what would this do?" and "do it" are the same code path with one flag between
them.

## The five rules

The first four are bugs `strapi-content-sync-pro` shipped, turned into
invariants with a test that fails if they come back
([plugin-gaps.md](../../docs/todo/cms-sync/plugin-gaps.md)). The fifth is this
engine's own, found by running it against a live instance.

**1. `inversedBy` is the owning side.** Re-derived from
`@strapi/database/dist/metadata/relations.js` with the citation in the source,
because the plugin had it backwards and *no bidirectional relation ever
synced, in either direction* — menus with no items, page groups with no member
pages, every `seo-meta` row detached (GAP-1).

**2. Set difference never deletes.** A record on the target but not the source
can mean it was deleted at source, or that the source query filtered it out, or
that somebody created it directly on the target. Three situations, one
observation. The planner reports them as `orphans` and deletes only what a
tombstone names — and even then only when the type opts in (GAP-10, where the
plugin's comparator turned every *create* into a delete whenever deletions were
enabled).

**3. Writes and links are separate phases.** Fields first, relations second,
once both ends exist. Reference cycles — `cms-menu-item.parent`,
`cms-page` ↔ `cms-page-group` — stop being an ordering puzzle.

**4. Links replace, they do not append.** A link carries the complete
owner-side set, so a value removed at source is removed at target. The plugin
left the old file attached to a single-value `featured_image`, giving one field
two media rows (GAP-4).

**5. An idle run writes nothing — links included.** A relation already correct
on the target is reported as `linksSettled` and no request goes out. This is not
just about saving traffic: every write bumps the target's `updatedAt`, so a
`lastWriteWins` type whose links were re-asserted on every run would drift into
being permanently "target-newer" and turn every record into a conflict. Found by
running the engine against a live instance, where a repeat run wanted to re-PUT
all 175 links to change nothing.

> The settle check compares the target's *populated* relation against the
> source's. Build both snapshots the same way — with `populate` — or the
> comparison sees a bare id against an object, concludes they differ, and
> writes anyway.

Two more things the shape buys, rather than the rules:

- **An out-of-scope relation costs the field, never the record** (GAP-3). A
  relation's target is a property of the schema and the manifest, both known
  before a run starts — so `plan.scope.outOfScope` names it at configuration
  time and the run simply does not attempt it. The plugin discovered them one
  record at a time, at write time, and failed the whole record: a single
  `cms-page.owners` pointing at a users-permissions user took the page with it.
- **Single types sync** (GAP-5), via `identity: 'singleton'`. Worth noting that
  this repo has **no single type left** — `site-setting` became a per-app
  collection in `3a4348d8`, so the gap that once blocked it no longer applies
  here. The strategy costs one function and a future type may want it. What
  site-settings actually needs is the right *key*: `app_slug`, not a
  `documentId` two instances never agreed on.

## Identity

Two instances hold the same record under different primary keys, so identity is
declared per type. The repo's two existing conventions are kept rather than
replaced by a third:

| Strategy | Key | Used by |
|---|---|---|
| `documentId` | `record.documentId` | CMS entities, which carry the same `documentId` on every instance |
| `externalIds` | `record.external_ids.<origin>` | commerce entities — the proven `rutba` marketplace-adapter pattern |
| `naturalKey` | business fields, e.g. `['slug']` | types created independently on both sides |
| `singleton` | one record, one key | single types |

One rule holds across all four: **a key is a non-empty string or it is absent,
and absence is never a match.** Two records that both fail to produce a key are
two records the engine will not touch. A key claimed by two records is withheld
from both — "pick the first one" is how a sync silently overwrites the wrong
row, so an ambiguous key is reported and acted on by nobody.

### `documentId` identity depends on the target, and the failure is silent

Measured, because guessing here is expensive:

| Target | Keeps a `documentId` sent on create? | Why |
|---|---|---|
| `services/core` | **yes** | `documents.create` reads `data.documentId` before generating one, and core's REST layer passes `body.data` through untouched. Verified over the wire against a running core: create → 201 with the same id, `GET` by that id → 200. |
| Strapi | **no** | `@strapi/utils` `sanitizeInput` runs `omit(DOC_ID_ATTRIBUTE)` on **every** content-API write, before the document service sees it. The target assigns its own. |

The dangerous part is that Strapi still answers **201**. Nothing fails, the run
log looks perfect, and the *next* run matches nothing and creates every record
again — one complete duplicate copy per run, found in production or not at all.
(This is also why the plugin this engine replaces shipped its own
`/api/strapi-content-sync-pro/receive` route on the target: a plugin route
bypasses the content-API sanitiser. Speaking the wire is the right trade, but
it costs this.)

So:

- **Pushing to core** — use `documentId`. It works.
- **Pushing to Strapi** — use `naturalKey` on a real attribute (`slug`, `key`,
  `app_slug`). No sanitiser strips a declared field.
- Either way the apply phase calls `verifyIdentityEcho` on its **first create
  per type** and stops the run on a mismatch. Loud on run one beats silent
  until run two.

## Conflict policy

Per type. `sourceWins` (default) writes whenever the content differs;
`targetWins` never writes; `lastWriteWins` compares `updatedAt` and records a
`target-newer` **conflict** instead of overwriting. If either timestamp is
missing, `lastWriteWins` reports `missing-updatedAt` rather than guessing —
guessing is how the newer copy gets lost.

`publish` is separate: `mirror` (default) copies the source's published state,
while `draft` and `published` force one. Promotion runs want `draft`, so
staging content lands unpublished until somebody looks at it.

## What v1 does not do

- **No two-way sync.** Not "not yet implemented" — blocked on a schema
  decision. Safe bidirectional sync needs every synced record to carry where
  its last write came from, and there is nowhere to put that today. The
  plugin's loop guard keyed on a `syncId` field no schema declared, so
  `processData` dropped it silently and records ping-ponged between instances
  forever (GAP-8). `parseManifest` refuses `direction: 'two-way'` and says why.
- **No media hand-off yet.** Copying file bytes namespace-to-namespace through
  the media file server, tombstone collection, the run log
  (`sync_logs`/`sync_run_reports`), the cron and the `content-sync` core module
  are the next slice.
- **No components or dynamic zones yet.** They are classified and carried as
  content fields, which is right for the CMS types in scope; the plugin's
  corruption of them (GAP-6) came from writing at the database layer, which
  this engine does not do.

## Tests

```bash
npm test --workspace=@rutba/sync
```

114 assertions: 52 planner (`test/engine.js`), 16 apply (`test/apply.js`), and
the bridge's 46. The apply half runs a real HTTP server on loopback, the same
way the bridge's round-trip tests do, with a fake target that can behave like
core *or* like Strapi — because the difference between them is a measured fact
the engine has to act on.

The planner's last section is regressions: one case per plugin gap, each
asserting the engine does not have that bug. They were mutation-checked rather
than trusted — putting GAP-1 back into `isOwnerSide` fails 5 tests including
its own regression case; letting set difference delete fails rule 2's.

End to end, the engine has also been pointed at a **live core as its own
target** over the real wire: 52 records read, and the plan comes back
`creates: 0, updates: 0, links: 0, linksSettled: 175`. A run against a target
that already matches has to be completely silent, and that is the cheapest way
to prove identity and the fingerprint agree.

---

# The bridge

`import { createBridge } from '@rutba/sync'`

**This is phase 1 and phase 1 only: a transparent pass-through proxy.** No
caching, no replica, no outbox, no offline behaviour of any kind — see
[`docs/todo/offline-pos-options.md`](../../docs/todo/offline-pos-options.md) §10.2.

> Phase 1 in particular is deliberately boring: the bridge earns trust as a
> proxy before it is allowed to be clever.

The value of this phase is the seam, and the proof that going through it
changes nothing. A POS pointed at the bridge must behave exactly as one
pointed at the API. Everything here is in service of that.

## Use

```js
import { createBridge } from '@rutba/sync';

const bridge = createBridge({
    upstream: 'http://localhost:4020',   // the real API
    port: 4030,
    log: 'summary',
});

await bridge.listen();
console.log(bridge.url);                 // http://127.0.0.1:4030
console.log(await bridge.status());      // same payload as GET /bridge/status
// …
await bridge.close();
```

It is a **library with a thin CLI**, not a CLI. `createBridge` never calls
`process.exit`, never installs a signal handler and never reads a config file,
because the Electron main process is going to host it in-process (§11) and has
to stay in charge of its own lifecycle. Everything process-shaped lives in
[`bin/bridge.js`](bin/bridge.js).

The package is ESM. From a CommonJS host — an Electron main process that has
not moved to ESM — load it with a dynamic import:

```js
const { createBridge } = await import('@rutba/sync');
```

### CLI

```bash
node packages/sync/bin/bridge.js --upstream http://localhost:4020 --port 4030
```

```
--upstream <url>   base URL of the real API   (env RUTBA_BRIDGE_UPSTREAM)
--port <n>         port to listen on          (env RUTBA_BRIDGE_PORT, default 4030)
--host <addr>      interface to bind          (env RUTBA_BRIDGE_HOST, default 127.0.0.1)
--log <level>      off | summary | headers    (env RUTBA_BRIDGE_LOG, default summary)
--status-path <p>  the bridge's own route     (default /bridge/status)
```

Loopback by default (§10.3: "a single till never opens a port to the shop
network"). LAN exposure is phase 4's problem, and needs `--host` set
deliberately.

### Pointing the POS at it

`NEXT_PUBLIC_API_URL` already carries the `/api` suffix, so give the bridge
the upstream **origin** and let it map the path space 1:1:

```
RUTBA_BRIDGE_UPSTREAM=http://localhost:4020     # the API
NEXT_PUBLIC_API_URL=http://127.0.0.1:4030/api   # the POS
```

An upstream *with* a path also works — `http://localhost:4020/api` prefixes
`/api` onto every proxied request — but the origin form keeps `/bridge/status`
well away from anything the API serves, which is the point.

Prefer `127.0.0.1` over `localhost` in `NEXT_PUBLIC_API_URL` when the bridge
binds the default loopback address: on Windows `localhost` can resolve to
`::1` first, and a bridge bound to `127.0.0.1` is not there.

## `GET /bridge/status`

The one route the bridge answers itself.

```json
{
  "bridge":   { "version": "0.1.0", "mode": "passthrough", "startedAt": "…", "uptimeMs": 4364, "listening": "http://127.0.0.1:4030" },
  "upstream": { "url": "http://localhost:4020", "reachable": true, "statusCode": 404, "latencyMs": 23,
                "error": null, "lastContactAt": "…", "lastErrorAt": null, "lastError": null },
  "requests": { "proxied": 12, "failed": 0 }
}
```

- `reachable` is a `HEAD` on the upstream base, cached for a second. It means
  "spoke HTTP", not "returned 2xx" — that base is a 404 on both Strapi and
  services/core, and a 404 is a perfectly good proof of life. No credentials are
  sent, so it never depends on a session.
- `lastContactAt` / `lastError` come from **real proxied traffic**, which is
  the more honest signal of the two.
- `mode: "passthrough"` says this bridge has no offline behaviour, so a client
  need not infer that from a version number.

The reserved namespace is that **one exact pathname**. `/bridge/statuses`,
`/bridge/status/` and `/bridge` all proxy like anything else. The path is
reserved for every verb though — `GET`/`HEAD` answer, `OPTIONS` preflights,
anything else is a `405`. A route that answered `GET` and proxied `POST` would
be a trap, not a tight namespace.

## What "transparent" means here, precisely

**Forwarded verbatim:** method, path, query string, every request header, the
request body, and on the way back the status code, status message, every
response header (duplicates and casing included) and the response body.

**The body is never buffered.** `req` is piped straight into the upstream
request and the response is piped straight back. That is what keeps
`multipart/form-data` boundaries intact — the upload path in
`packages/api-provider/lib/api.js` posts a `FormData` — and it is why the
bridge imposes no body size limit at all. The upstream's limit is the only
one. It also means no copy of a request body exists for a log to leak.

**Error responses are forwarded, not interpreted.** An api-pro 403 and its
JSON payload mean something to the caller. Nothing in the proxy path reads a
status code.

**The header rules.** `Authorization` carries the JWT; `X-Rutba-App` and
`X-Rutba-App-Role` drive api-pro's claim resolution, and a dropped or
rewritten app header does not error — it silently changes which permissions
apply. So the rule is copy-everything, and only two categories are touched:

| | |
|---|---|
| **Hop-by-hop headers** (`Connection`, `Keep-Alive`, `Transfer-Encoding`, `TE`, `Trailer`, `Upgrade`, `Proxy-Authenticate`, `Proxy-Authorization`) and anything named by the peer's own `Connection:` | consumed, per RFC 9110 §7.6.1 — relaying them is a protocol error |
| **`Host`** | rewritten to the upstream's authority |

`Host` is the one rewrite and it is a rewrite *towards* transparency: the
upstream must see the `Host` it would have seen if the caller had dialled it
directly, or vhost routing and absolute-URL generation change underneath it.

**Nothing is added.** No `X-Forwarded-For`, no `X-Forwarded-Proto`, no `Via`.
A header the upstream would not see on a direct call is a behaviour change,
and rate limiting and request logging both read them.

## Known differences from talking to the upstream directly

A known difference is worth ten times an unnoticed one. There are three.

1. **The upstream sees the bridge's source address, not the caller's.** The
   consequence of not inventing `X-Forwarded-For`. Upstream access logs and
   any IP-based rate limiting see `127.0.0.1`. Fixing it would mean sending a
   header a direct call never sends, which is the larger sin. If the LAN tier
   (phase 4) ever needs per-till attribution, that is the phase to decide it
   in.

2. **An unreachable upstream drops the connection instead of answering.** The
   caller sees `ECONNRESET` rather than the `ECONNREFUSED` a direct call would
   have produced. Both are transport failures with no HTTP response, so
   `axios` reports them identically and phase 0's `isNetworkError` classifies
   them identically. Synthesising a `502` was the alternative and it is worse:
   it hands the caller an HTTP response it would never have seen, and phase
   0's detection would then read an outage as a server error. Dropping the
   connection is also the only option once response headers are already on the
   wire, so it keeps one behaviour instead of two.

3. **`Transfer-Encoding` is re-decided.** It is hop-by-hop, so it is dropped
   and Node re-chunks on its own when there is no `Content-Length`. The framing
   on the wire can therefore differ from the upstream's while the bytes of the
   body do not. This is what every conforming proxy does.

Everything else has been checked and is identical.

## What was verified, and how

Phase 1's deliverable is the proof, not the code. Against a live `services/core`
on `:4020` with the bridge on `:4030`:

- **Differential harness** — 20 unauthenticated and 17 authenticated request
  shapes fired at the upstream *and* at the bridge, comparing status, status
  message, every non-volatile response header and the body bytes. All
  identical, including a 187 KB product list, a 1.1 MB `/me/permissions`, a
  CORS preflight, `HEAD`, gzip negotiation, a 60-parameter query string, an
  api-pro `403 PolicyError` and a `401`.
- **A real POS session** — `apps/sales/pos` on `:4002` with `NEXT_PUBLIC_API_URL`
  pointed at the bridge: SSO sign-in, desk selection, stock search, cart, a
  paid cash sale (the full §2 write chain — `POST /sales` → `/payments` →
  `/sale-items` → `PUT /stock-items/:id`), invoice print, and a full sale
  return (`/sale-returns` → `/sale-return-items` → stock restored →
  refund payment → cash-register transaction). 182 requests proxied, zero
  upstream failures.
- **Role switching** — the `RoleSwitcher` flipping `pos_admin` →
  `pos_staff` changes `X-Rutba-App-Role` on the wire, and api-pro's 403
  message names the switched role. The header survives the hop.
- **Upload** — the same PNG posted direct and through the bridge produced
  byte-identical stored files.

## Logging

Logging is a feature of this phase, not debug cruft: diffing bridge traffic
against direct traffic is how the bridge earns trust. So it defaults to **on**,
at one line per request.

```
[bridge] GET    /api/me/stock-items-search?pagination[pageSize]=5 → 401 (4 ms, 106 B)
[bridge]   → {"Authorization":"Bearer <redacted:192>","X-Rutba-App":"sale","X-Rutba-App-Role":"pos_manager","Host":"127.0.0.1:4020"}
```

Two rules it never breaks:

- **`Authorization` values are never printed.** The auth scheme survives and
  the credential is masked with its length, so "did the Bearer token reach the
  upstream" stays answerable from the log without the token being in it.
  Cookies and `*-token` / `*-secret` / `*-key` headers are masked outright, as
  are sensitive query-string values (`?token=`, `filters[token]=`, …).
  `X-Rutba-App` and `X-Rutba-App-Role` are deliberately **not** masked — they
  are what you diff on.
- **Bodies are never logged.** Not truncated, not sampled — never read.

`log: 'off' | 'summary' | 'headers'`, and `onLog(record)` replaces the console
with your own sink (the Electron host will want this). A throwing sink can
never take a request down with it.

## Tests

```bash
npm run test:bridge --workspace=@rutba/sync
```

46 assertions (`test/engine.js` adds the engine's 44; `npm test` runs both), no
framework, no fixtures, loopback only. The round-trip half runs a real bridge
in front of a real upstream and uses `node:http` rather than `axios` or `fetch`
as the client, because both of those normalise headers and hide duplicates —
exactly the things this phase has to prove it preserves.

## Not here, on purpose

Response caching, collection mirroring, local reads, SQLite, services/core
hosting, the outbox, provisional `loc_` ids, replay, conflict handling,
`Idempotency-Key`, descriptor `offline:` policy, Electron packaging, and the
§10.2a discovery/attachment handshake (which exists only because a *browser*
till has to find and trust an *external* bridge — the desktop container starts
the bridge and knows its own port).

There are no abstractions "ready for" any of it either. Phase 2 gets to decide
its own shape — including how much of the engine above it reuses. The engine
being in the same package is a fact about where the code lives, not a claim
that the bridge already depends on it. It does not.
