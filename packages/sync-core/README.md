# @rutba/sync-core

<!-- verify-docs: planned 4030 -->
<!-- 4030 is the bridge's loopback default, bound in-process by the desktop
     shell that will host it (§11). It is deliberately not a deployed service,
     so it is absent from scripts/rutba_apps.sh and stays absent; the marker
     above is what keeps verify-docs from reading that absence as drift. -->

The offline sync-bridge. **This is phase 1 and phase 1 only: a transparent
pass-through proxy.** No caching, no replica, no outbox, no offline behaviour
of any kind — see [`docs/todo/offline-pos-options.md`](../../docs/todo/offline-pos-options.md) §10.2.

> Phase 1 in particular is deliberately boring: the bridge earns trust as a
> proxy before it is allowed to be clever.

The value of this phase is the seam, and the proof that going through it
changes nothing. A POS pointed at the bridge must behave exactly as one
pointed at the API. Everything here is in service of that.

## Use

```js
import { createBridge } from '@rutba/sync-core';

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
const { createBridge } = await import('@rutba/sync-core');
```

### CLI

```bash
node packages/sync-core/bin/bridge.js --upstream http://localhost:4020 --port 4030
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
  rutba-core, and a 404 is a perfectly good proof of life. No credentials are
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

Phase 1's deliverable is the proof, not the code. Against a live `rutba-core`
on `:4020` with the bridge on `:4030`:

- **Differential harness** — 20 unauthenticated and 17 authenticated request
  shapes fired at the upstream *and* at the bridge, comparing status, status
  message, every non-volatile response header and the body bytes. All
  identical, including a 187 KB product list, a 1.1 MB `/me/permissions`, a
  CORS preflight, `HEAD`, gzip negotiation, a 60-parameter query string, an
  api-pro `403 PolicyError` and a `401`.
- **A real POS session** — `pos-sale` on `:4002` with `NEXT_PUBLIC_API_URL`
  pointed at the bridge: SSO sign-in, desk selection, stock search, cart, a
  paid cash sale (the full §2 write chain — `POST /sales` → `/payments` →
  `/sale-items` → `PUT /stock-items/:id`), invoice print, and a full sale
  return (`/sale-returns` → `/sale-return-items` → stock restored →
  refund payment → cash-register transaction). 182 requests proxied, zero
  upstream failures.
- **Role switching** — the `RoleSwitcher` flipping `sale_admin` →
  `sale_staff` changes `X-Rutba-App-Role` on the wire, and api-pro's 403
  message names the switched role. The header survives the hop.
- **Upload** — the same PNG posted direct and through the bridge produced
  byte-identical stored files.

## Logging

Logging is a feature of this phase, not debug cruft: diffing bridge traffic
against direct traffic is how the bridge earns trust. So it defaults to **on**,
at one line per request.

```
[bridge] GET    /api/me/stock-items-search?pagination[pageSize]=5 → 401 (4 ms, 106 B)
[bridge]   → {"Authorization":"Bearer <redacted:192>","X-Rutba-App":"sale","X-Rutba-App-Role":"sale_manager","Host":"127.0.0.1:4020"}
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
npm test --workspace=@rutba/sync-core
```

46 assertions, no framework, no fixtures, loopback only. The round-trip half
runs a real bridge in front of a real upstream and uses `node:http` rather
than `axios` or `fetch` as the client, because both of those normalise headers
and hide duplicates — exactly the things this phase has to prove it preserves.

## Not here, on purpose

Response caching, collection mirroring, local reads, SQLite, rutba-core
hosting, the outbox, provisional `loc_` ids, replay, conflict handling,
`Idempotency-Key`, descriptor `offline:` policy, Electron packaging, and the
§10.2a discovery/attachment handshake (which exists only because a *browser*
till has to find and trust an *external* bridge — the desktop container starts
the bridge and knows its own port).

There are no abstractions "ready for" any of it either. Phase 2 gets to decide
its own shape.
