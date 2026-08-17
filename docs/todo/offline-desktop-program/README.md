# Offline & Desktop Program

> **Status (2026-08-13): specification only.** Nothing in this program is built.
> There is no Electron dependency anywhere in the repo today — a repo-wide search
> of every `package.json` outside `node_modules` returns zero matches. This is a
> greenfield container around code that already exists.
>
> **Status update (2026-08-17): no longer specification-only.** The phase-1
> pass-through bridge is built — [`packages/sync-core`](../../../packages/sync-core/README.md),
> per [`offline-pos-options.md` §13.7](../offline-pos-options.md#137-what-this-replaces);
> [05](05-sqlite-viability.md) is a completed investigation (2026-08-14) and
> [06](06-sync-back-granularity.md) is decided. The Electron shell itself is
> still unbuilt, and the zero-Electron-dependency search result above still holds.
>
> This program **does not reopen** [`offline-pos-options.md`](../offline-pos-options.md).
> That document's §§1–5 and §10 are the working design and are treated here as
> settled. These four documents generalize it from one app to a framework and
> cross-reference it by section number.

## The thesis: offline is a property of the HOST, not the app

Every one of the 22 Next.js apps in this repo resolves its API origin in exactly
one place — [`lib/api-url-resolver.js`](../../../packages/api-provider/lib/api-url-resolver.js) —
and funnels its requests through exactly one axios seam,
[`lib/api.js`](../../../packages/api-provider/lib/api.js). An app therefore becomes
offline-capable by being **hosted differently** — pointed at a local bridge — not
by being rewritten.

```
app code → generated client → authApi.post(path, body) → axios → API_URL
                               (lib/api.js)                       (api-url-resolver.js)
                                    ▲                                   ▲
                        the TRANSPORT seam                   the ORIGIN seam
                        (timeouts, idempotency)         (what the desktop repoints)
```

**Dual-mode app code is the single largest source of bugs in offline retrofits**
— [`offline-pos-options.md` §9.1](../offline-pos-options.md#91-the-inversion-that-makes-it-simple)
says so plainly, and avoiding it is this design's main goal. If offline logic lived
in app code, this would be 22 ports and 22 sets of dual-mode bugs: 22 places where
"am I online?" is asked, 22 places where the answer is cached wrongly, 22 sets of
tests that only ever exercise the online branch. Because it lives in the host,
**the app does not know it is offline-capable**, and there is no second branch to
test.

The reverted 0.3 build is the counter-example, and it is in this repo's own
history: offline logic living in `saleApi` — one flow's solution to a platform's
problem — reverted at `365cf4c`.

### What "the seam is guarded" does and does not mean

Worth stating precisely, because the guard is narrower than it is usually described:

| Seam | How total is it | What guards it |
|---|---|---|
| **Origin** (`api-url-resolver.js`) | Near-total for the v1 set. `pos-sale` and `rutba-mail` contain **zero** direct reads of `NEXT_PUBLIC_API_URL`; `rutba-social` has exactly one, in [`pages/api/media-proxy.js:38`](../../../rutba-social/pages/api/media-proxy.js) | Nothing automated |
| **Transport** (`lib/api.js`) | 5 files repo-wide import axios directly outside `api-provider` / `pos-strapi` / `rutba-core`: [`pos-shared/context/AuthContext.js`](../../../packages/pos-shared/context/AuthContext.js) and 4 under `rutba-web/src/services/`. **None is in the v1 desktop set.** | [`validate-endpoint-usage.mjs`](../../../packages/api-provider/scripts/validate-endpoint-usage.mjs) |

> **A correction worth recording.** `validate-endpoint-usage.mjs` is a real CI gate
> (`npm run validate` in `packages/api-provider`, which its `build` script runs),
> but it validates **generated-client member names** against the scaffolded `.d.ts`
> files across a hardcoded list of 11 consumer directories. It does **not** detect
> a consumer that imports axios and bypasses the seam entirely. The seam is real;
> the automated guard on it is about method typos, not about transport. Do not
> cite it as proof that nothing bypasses `api.js` — the five files above do.
>
> `AuthContext.js` is the one that matters for the desktop: it reaches
> `/auth/refresh` (line 427) and `/users/me` (line 154) with raw, unbounded axios.
> It still resolves `API_URL` through the origin seam (imported at line 4), so the
> desktop repoint does reach it — but the timeout in
> [04 §1](04-server-prerequisites.md#1-bounded-timeout-in-the-axios-seam) would
> not. Those are the first two calls a cold desktop start makes.

`rutba-web` reads `process.env.NEXT_PUBLIC_API_URL` through its own `apiUrl()` in
[`src/static/const.ts:2`](../../../rutba-web/src/static/const.ts) and never touches
the resolver. It is the storefront, it is not in the v1 bundle, and it is the one
app for which the thesis does not currently hold. Recorded so nobody assumes
otherwise later.

## Measured scope (2026-08-13, dev branch)

| Surface | Measurement |
|---|---|
| Next.js app workspaces in [`package.json`](../../../package.json) | **22** (excluding `packages/*`) |
| Apps bundled in desktop v1 | **3** — `pos-sale`, `rutba-mail`, `rutba-social` |
| Descriptor modules in [`api-provider/api/*.js`](../../../packages/api-provider/api) | 181 (179 + 2 `__`-prefixed helpers); 20 more under `api/web/` |
| …carrying an `offline:` facet today | **0** |
| axios calls in `packages/api-provider` with a bounded `timeout` | **0** |
| Files bypassing the transport seam (outside api-provider / pos-strapi / core) | 5 — **0 of them in the v1 set** |
| DB clients mapped in [`rutba-core/src/config/env.js:108`](../../../rutba-core/src/config/env.js) | **2** (`mysql`→`mysql2`, `postgres`→`pg`) |
| Unported custom actions in rutba-core | answered `501 NotPortedError` ([`src/http/server.js:284`](../../../rutba-core/src/http/server.js)) |
| Service ports allocated in [`scripts/rutba_apps.sh`](../../../scripts/rutba_apps.sh) | 4000–4023 |
| `electron` references in any repo `package.json` | **0** |
| video-maker A/B harness gates | **60** frame comparisons (5 looks × 12 stamps) + **6** sound checks |

## Decisions already taken

Recorded here so no document below reopens them.

| # | Decision | Where it was taken |
|---|---|---|
| 1 | **One "Rutba Desktop" container hosting many apps**, not one installer per product. One install, one updater, one bridge, one replica, one signed-in session. | This program |
| 2 | **The desktop IS the launcher.** Reuse `getAppCatalogGroups` / `rankByUsage` / `appUsage.js` from `pos-shared`; the app list comes from the server-owned catalogue. | [admin-console 01](../admin-console-program/01-app-catalogue-entitlements.md) |
| 3 | **v1 bundles POS, Mail and Studio only.** | [offline-pos-options §12](../offline-pos-options.md#12-amendment-2026-08-13--one-engine-three-apps) |
| 4 | **The Electron main process hosts the bridge** — no separate Windows service. _(Superseded 2026-08-17: the bridge runs in a `UtilityProcess` inside the Electron app, not the main process — [§13.1](../offline-pos-options.md#131-the-engine-runs-in-a-utilityprocess-not-the-main-process); the installer/lifecycle argument stands.)_ | [offline-pos-options §11](../offline-pos-options.md#11-amendment-2026-08-13--electron-hosts-the-bridge) |
| 5 | **Local reads come from `rutba-core` against SQLite**, never a second implementation of the domain. | [offline-pos-options §10.1](../offline-pos-options.md#101-shape), §6 |
| 6 | **The replayer replays the captured stock-unit references**, falling back to allocation only when one cannot be honoured. Divisible lines stay product+qty. **The outbox payload carries both shapes.** | [06](06-sync-back-granularity.md) — settles [§10.5.1](../offline-pos-options.md#105-still-open) |

**Rider, inventory and manufacturing are strong later candidates** — connectivity
genuinely fails in a delivery van, a warehouse aisle and a stitching floor, which
is a better argument than any of the three v1 apps can make for itself. They are
explicitly out of scope for now. The four-layer model in
[03](03-app-policies.md) is what makes adding them cheap rather than a port.

## Ground rules

1. **Offline is a property of the host.** No app learns that it is
   offline-capable. Any proposed change that adds an `if (offline)` branch to app
   code is the wrong change, and the reviewer should say so rather than
   negotiating it. The correct homes for that branch are the bridge and the
   descriptor.
2. **One container, not one installer per product.** The tradeoff is real and
   accepted: app release cadence couples to desktop releases
   ([02 §Updates](02-desktop-shell.md#updates)). What it buys — one signed
   artifact, one updater, one bridge, one replica, one session — is worth more
   than independent cadence for three apps that ship from one monorepo anyway.
3. **No second implementation of the domain.** Local reads are `rutba-core`
   answering the app's real routes against SQLite. A hand-written local query
   that duplicates a core service is a defect, not an optimization.
4. **Reuse the engine that exists.** [`rutba-core/src/platform/events.js`](../../../rutba-core/src/platform/events.js)
   is already a correct transactional outbox. The replayer is that shape — see
   [01 §The replayer is events.js](01-sync-core.md#the-replayer-is-eventsjs-in-a-different-costume).
5. **Speak the wire contract, never the database.** Inherited verbatim from
   [core-server-multitenancy 06](../core-server-multitenancy-program/06-plugin-replacement-map.md).
   It is what lets one engine serve four consumers instead of four engines
   serving one each.
6. **Coverage is measurable or it is not claimed.** "Is Mail offline-complete?"
   must be answerable by a build check, not an opinion —
   [04 §The offline-readiness gate](04-server-prerequisites.md#the-offline-readiness-gate).
7. **Refusing loudly is a feature.** `mode: 'reject'` with a reason a cashier can
   read beats silently queueing something that can never be replayed
   ([offline-pos-options §3](../offline-pos-options.md#3-descriptors-declare-offline-policy)).
8. **§§1–5 and §10 of `offline-pos-options.md` are settled.** Cite them; do not
   re-derive them. Where this program extends one, it says which section and why.

## The documents

| # | Document | What it owns |
|---|---|---|
| 1 | [`01-sync-core.md`](01-sync-core.md) | `@rutba/sync-core`: proxy, response cache, replicator, outbox + provisional ids, replayer. The engine, and its four consumers. |
| 2 | [`02-desktop-shell.md`](02-desktop-shell.md) | The Electron container: process shape, the build-time/runtime origin problem, security posture, Electron hazards as release gates, updates, packaging. |
| 3 | [`03-app-policies.md`](03-app-policies.md) | The four-layer adoption model, and what each of POS / Mail / Studio actually needs. |
| 4 | [`04-server-prerequisites.md`](04-server-prerequisites.md) | Five small, independently-correct, gating server changes — and the offline-readiness gate. |
| 5 | [`05-sqlite-viability.md`](05-sqlite-viability.md) | **Measured, not specified.** Does rutba-core actually run on SQLite? What ports, what breaks, and whether the "bridge = rutba-core on SQLite" assumption survives contact with a real database file. |
| 6 | [`06-sync-back-granularity.md`](06-sync-back-granularity.md) | **Decision.** What the replayer replays for an offline POS sale — captured unit references, with allocation as the repair. Fixes the outbox payload shape, so it gates D4. |

## Phases

| Phase | Contents | Size | Depends on | Maps to |
|---|---|---|---|---|
| **D0** | Server prerequisites 1–4: bounded timeout, SQLite driver, `Idempotency-Key`, distinguishable 409s | S×4 | — | §8 slice 0, §10.2 phase 0 |
| **D1** | `@rutba/sync-core` v0: transparent proxy + `/bridge/status` + L1 response cache. Headless, no shell. | M | D0.1 | §10.2 phase 1 |
| **D2** | Desktop shell: launcher, lazy per-app Next servers, **runtime origin injection**, security posture, release gates | L | D1 | §11 (new) |
| **D3** | rutba-core on SQLite + replicator + local reads. Writes still fail visibly offline. | M | D0.2 | §10.2 phase 2 |
| **D4** | Outbox + provisional ids + ordered idempotent replay + the queue/conflicts screen in shell chrome. **The hard phase.** | L | D0.3, D0.4, D3 | §10.2 phase 3 |
| **D5** | Descriptor `offline:` facet + audit gate; per-app L2/L3 policies for POS, Mail, Studio | S + M×3 | D4 | §3, §12 |
| **D6** | Packaging: electron-builder, signing, electron-updater feed, release-tag pipeline | M | D2 | §10.2 phase 4, minus service supervision |
| **D7** | LAN host — same core, second host. Brings the TLS question with it. | M | D3, D4 | §6, §11.2 |

**D1 and D2 are deliberately boring, and that is the point.** The bridge earns
trust as a pass-through proxy, and the shell earns trust as a window around
unchanged apps, before either is allowed to be clever
([offline-pos-options §10.2](../offline-pos-options.md#102-phases)). Run a real
till through D2 for days with no offline logic in it at all.

D0 is four independent small changes with four independent justifications; none
of them needs the rest of this program to be worth landing. Start there.

## What this replaces

- **The standalone Windows service.** [§10.2 phase 4](../offline-pos-options.md#102-phases)
  and [§10.3](../offline-pos-options.md#103-trust-and-packaging-decisions) specced
  packaging via nssm or node-windows. Already retired by
  [§11](../offline-pos-options.md#11-amendment-2026-08-13--electron-hosts-the-bridge);
  this program is what replaces it. There is no second artifact to sign, ship,
  supervise or version-match.
- **The in-browser proxy tier.** Dropped in the 2026-08-08 decision, and
  [§11.2](../offline-pos-options.md#112-6-keeps-its-job-the-multi-till-shape) gives
  its job — the tier underneath the LAN bridge — to the desktop bridge instead.
  One Node core, one SQLite adapter, rather than a second storage adapter with a
  second lifecycle.
- **Per-app offline retrofits**, including the reverted 0.3 build's offline logic
  in `saleApi` (reverted at `365cf4c`).

It replaces **nothing** in `offline-pos-options.md` §§1–5. Those sections are the
mechanism; this program is where the mechanism is hosted and how it reaches three
apps instead of one.

## Risks

- **The origin problem is discovered late.** Next bakes `NEXT_PUBLIC_API_URL` at
  build time; the desktop needs a runtime origin. If this is not solved in D2 it
  surfaces as "the desktop build works only against a hardcoded port", which is
  the kind of thing that gets papered over with a fixed port and then collides.
  → [02 §The build-time/runtime API origin problem](02-desktop-shell.md#the-build-timeruntime-api-origin-problem).
- **Contract drift between MySQL and SQLite.** `dbConfig()`'s `decimalNumbers` /
  `dateStrings` options exist specifically for Strapi serialization parity and
  have no SQLite equivalent. The driver map is the easy half.
  → [04 §2](04-server-prerequisites.md#2-a-sqlite-driver-for-rutba-core).
- **The 501 ceiling.** An app is only as offline-capable as rutba-core's port of
  its routes. An unported custom action answers 501 — offline that is not a
  degraded read, it is a dead feature. This is the real limit on which apps can
  join, and it is measurable today.
- **Provisional-id rewriting is subtly wrong.** Named in
  [§2](../offline-pos-options.md#2-the-hard-part-provisional-ids) as "the part
  most likely to be got subtly wrong". It wants real tests before it carries a
  real till.
- **Electron hazards that look like app bugs.** A frozen `requestAnimationFrame`
  in a hidden window presents as "Studio renders stall" *and* "the app never
  hydrates" — two symptoms, one cause, neither of which points at the window.
  → [02 §Electron hazards](02-desktop-shell.md#electron-hazards-that-must-become-release-gates).
- **Coupled release cadence.** Ground rule 2's accepted cost. It becomes a real
  problem the first time a Mail hotfix has to wait for a Studio regression to
  clear the gate. The mitigation is process, not architecture: the desktop ships
  on its own tags and can ship often.
