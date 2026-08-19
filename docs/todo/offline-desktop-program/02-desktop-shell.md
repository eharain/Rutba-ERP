# 02 — The desktop shell

> **Status: specification only.** There is no Electron dependency in the repo
> today. This is the container decided in
> [`offline-pos-options.md` §11](../offline-pos-options.md#11-amendment-2026-08-13--electron-hosts-the-bridge)
> — one "Rutba Desktop" hosting many apps, with the bridge inside its main
> process — specified as a build.

## Process shape

One process tree, one install, one session.

```
Electron main process (Node)
├── launcher shell            the desktop IS the app catalogue
├── ONE @rutba/sync      proxy + cache + replicator + outbox + replayer
├── ONE services/core on SQLite  local reads answer the apps' real routes
└── lazy per-app Next servers 127.0.0.1:<ephemeral>, started on first open
    ├── apps/sales/pos      ─┐
    ├── apps/content/mail     ├─ each is its own Next project → its own server
    └── apps/content/social  ─┘
```

**One bridge, one replica, one outbox — for all three apps.** That is the whole
argument for the container over one installer per product, and it is what makes
the connectivity indicator and the queue screen shell-level rather than
per-app.

**Lazy per-app Next servers, because there is no alternative.** All 22 app
workspaces are Next projects, each with its own `pages/` tree, its own
`next.config` and its own build output. Next cannot serve two projects from one
server, so N open apps means N servers. (They do at least share one hoisted
`next` — `16.2.12` in the root [`package.json:131`](../../../package.json) — so
there is one runtime version to reason about, not 22.) The consequences are the
design:

- [ ] **Start on first open, not at boot.** Cold-starting three Next servers to
      show a launcher is a slow, memory-hungry splash screen for something the
      user may never click.
- [ ] **Idle-stop after a configurable window.** A till that opened Mail once at
      9am should not still be paying for it at 6pm. Never idle-stop an app with
      unsaved editor state — Studio is the case that will bite.
- [ ] **Ports allocated on `127.0.0.1`, ephemeral, never fixed.** The 4000–4023
      range in [`scripts/rutba_apps.sh`](../../../scripts/rutba_apps.sh) is the
      *server* allocation and means nothing on a till machine, which may be
      running anything. Ask the OS for a free port; record the mapping in the
      main process. This is what makes the origin problem below unavoidable
      rather than optional.
- [ ] **A crashed app server takes its window, not the shell.** Restart it on
      next open, surface the crash, keep the bridge alive. The bridge dying is
      the one failure that must take the whole app down visibly —
      [§11](../offline-pos-options.md#11-amendment-2026-08-13--electron-hosts-the-bridge)'s
      argument that a shopkeeper can see and act on a dead window but not on a
      silently dead background service.

### The launcher is `pos-shared`, not a new component

Reuse, do not rebuild:

| Piece | Source |
|---|---|
| Grouped app catalogue | `getAppCatalogGroups(appAccess, currentApp)` — [`roles.js:326`](../../../packages/shared/lib/roles.js) |
| Top-N frecency ordering | `rankByUsage(keys)` — [`appUsage.js:109`](../../../packages/shared/lib/appUsage.js) |
| Usage recording | `recordAppUse` / `recordAppVisit` — same file |
| Reference implementation | [`NavAppSwitcher.js:39, 63`](../../../packages/shared/components/NavAppSwitcher.js) |

The app list itself is **server-owned**, per
[admin-console-program/01](../admin-console-program/01-app-catalogue-entitlements.md):
the catalogue rides `/me/permissions`, with a public unauthenticated variant for
pre-claim rendering. The desktop is a strong argument for that public variant —
its launcher renders before any app window exists.

Two rules carried over from that document, both of which apply verbatim here:

- **Filter against the live catalogue *before* ranking**, or a disabled app keeps
  its slot by history.
- **Server catalogue wins per app key**; `APP_META` is a build-time fallback used
  only when the server list is entirely absent, never unioned with a live-but-
  shorter one.

One thing the desktop gets for free: `appUsage`'s cookie is host-only for bare
IPs and **cookies ignore ports** (stated in its own docblock, and `cookieDomain()`
returns `null` for `/^[\d.]+$/` hosts at [line 33](../../../packages/shared/lib/appUsage.js)).
So every app window at `127.0.0.1:<anything>` shares one `rutba_app_usage` jar
already, with no desktop-specific plumbing. Verify it rather than assume it — one
Electron `session` across all `BrowserWindow`s is what makes it true.

- [ ] The desktop's own catalogue must additionally filter to **apps bundled in
      this release**. A tile for an app whose bundle is not in the container is
      worse than no tile. Non-bundled entitled apps either open in the system
      browser or do not appear — decide once, in v1.

## The build-time/runtime API origin problem

**Name it now or it bites late.** This is the single most likely source of a
late, expensive surprise in D2.

Next inlines `process.env.NEXT_PUBLIC_*` **at build time**. The deploy guard in
[`scripts/rutba_apps.sh:285`](../../../scripts/rutba_apps.sh) exists precisely
because of this, and says so in its own comment:

> *"The apps bake `NEXT_PUBLIC_API_URL` in at build time, so a mismatch here ships
> nineteen apps pointing at a server this deploy does not start — and fixing it
> means another full rebuild, not an env edit."*

The desktop needs the opposite: a **runtime** origin pointing at a bridge port
that was allocated seconds ago.

### What the resolver actually does today

Verified, and narrower than it is usually described:

| Line | Behaviour |
|---|---|
| [`api-url-resolver.js:23`](../../../packages/api-provider/lib/api-url-resolver.js) | `API_URL_INTERNAL` is seeded from `process.env.NEXT_PUBLIC_API_URL` at module load — the baked value |
| `:29` | `export let API_URL` — a **live ES-module binding** |
| `:50` | `initApiConfig(_options = {})` — the parameter is named with an underscore and **never read** |
| `:61` | `initialized` latches, so a second call is a no-op |
| `:90` | Browser on `localhost` / `127.0.0.1` → **returns the env value unchanged** |
| `:106–110` | Otherwise: swaps only the **hostname**, keeping the env **port** |
| [`api.js:11`](../../../packages/api-provider/lib/api.js) | Calls `initApiConfig({ testPath: '/../admin' })` at import time |

> **A correction worth recording.** There is no working runtime-adoption path
> today. `initApiConfig` accepts an options object and discards it — the one
> existing call site at `api.js:11` already passes an option nothing consumes.
> And the runtime path that *does* exist, hostname adoption, does not help the
> desktop twice over: at a `127.0.0.1` renderer origin it returns early at line
> 90, and even when it fires it preserves the env port (lines 109–110), which is
> exactly the wrong axis for a dynamically-allocated bridge.
>
> What *is* real, and is the hook: `API_URL` is `export let`, and `api.js`
> interpolates `${API_URL}${path}` per call (e.g. lines 190, 235) rather than
> capturing it in a `const`. A reassignment inside the resolver module therefore
> reaches every subsequent request. This file has a history — the hostname-swap
> bug documented in its own lines 100–105 — so **it changes under test, not
> casually**.

### Three options, and a recommendation

| | Approach | Cost |
|---|---|---|
| **A** | Bake a **fixed** bridge port into the desktop build of each app | Zero code change, but a fixed port on a machine we do not control will eventually collide, and the failure is a silent wrong-origin, not a bind error |
| **B** | **Runtime origin read by the resolver**, preferred over the baked env value | One change to one file, no app edits. **Recommended.** |
| **C** | Put the bridge in **front** of each Next server so app and API share one origin, and bake a relative `/api` | Elegant in the browser; breaks Node-side axios, which needs an absolute URL. A reverse-proxy hop per request for a problem B solves without one |

**Take B.** It needs two runtime sources, because two different processes read
the origin and only one of them is a browser:

- [ ] **Renderer**: the resolver checks a global (e.g. `globalThis.__RUTBA_API_ORIGIN__`)
      before `process.env.NEXT_PUBLIC_API_URL`. Electron preload scripts run
      before page scripts, and `contextBridge.exposeInMainWorld` reaches the main
      world under `contextIsolation: true` — so the value is present by the time
      the app bundle evaluates. **Ordering is the whole trick**; a global set
      after `api.js` imports is a global set too late.
- [ ] **Per-app Next server** (SSR and `pages/api` routes): a **non-`NEXT_PUBLIC_`**
      env var — Next does not inline those, so the child process reads it at
      runtime. The shell sets it when it spawns each server.
- [ ] Preserve today's behaviour exactly when neither source is present. Every
      non-desktop build must be byte-identical, and the golden case to test is
      the production storefront split (`rutba.pk` page → `api.rutba.pk` API) that
      the hostname-swap bug broke once already.
- [ ] Repoint [`apps/content/social/pages/api/media-proxy.js:38, 75`](../../../apps/content/social/pages/api/media-proxy.js),
      the one file in the v1 set that reads `process.env.NEXT_PUBLIC_API_URL`
      directly rather than through the resolver.
- [ ] Decide whether `IMAGE_URL` follows the bridge or stays pointed at the media
      file server. Media is large and immutable; routing it through the bridge
      buys little and costs throughput. Deriving it from `API_URL` (line 24,
      `.replace(/\/api$/, '')`) means the decision is made for you unless it is
      made deliberately.

## Security posture

| Setting | Value | Why |
|---|---|---|
| `contextIsolation` | `true` | Non-negotiable. The renderer runs app code that renders server-supplied HTML (mail bodies, CMS content). |
| `nodeIntegration` | `false` | Same reason. |
| `sandbox` | `true` | Same reason. |
| Preload IPC surface | Minimal and explicit | See below. |
| `backgroundThrottling` | `false` | Not a security setting — a correctness one. [§Electron hazards](#electron-hazards-that-must-become-release-gates). |

- [ ] The preload exposes a **named, enumerable** API and nothing else: the
      runtime API origin, the bridge status stream, and the shell commands the app
      chrome needs. No generic `invoke(channel, ...args)` passthrough — that is
      `nodeIntegration: true` wearing a hat.
- [ ] Renderers load `http://127.0.0.1:<port>` only. Navigation to any other
      origin is blocked in `will-navigate` / `setWindowOpenHandler` and opened in
      the system browser instead.

### The secure-context dividend — this is what fixes LAN capture

`http://127.0.0.1` **is a secure context** (the loopback exemption). Record this
explicitly, because it is a real capability the desktop unlocks rather than a
technicality:

In-browser capture is gated on a secure origin. `getUserMedia` /
`getDisplayMedia` are simply **undefined** at `http://192.168.x.x:<port>` — the
browser hides the microphone and camera entirely. That is why
[`RecorderDialog.js`](../../../packages/shared/components/RecorderDialog.js)
computes `support` from `!!navigator?.mediaDevices?.getUserMedia` (line 85) and
renders a dedicated failure card (line 464) saying recording needs
*"a secure origin — https, or localhost"*. It is also why capture works on dev and
on rutba.pk and **cannot work at all on the LAN deploy box**.

A desktop host serves from a secure-context origin. The same decision that lets
the POS reach its bridge without mixed-content ceremony
([§11.1](../offline-pos-options.md#111-what-this-replaces-in-10)) **gives the
Video Studio its recorder back on machines that currently have no recorder to
give** ([§12](../offline-pos-options.md#12-amendment-2026-08-13--one-engine-three-apps)).

- [ ] Verify it rather than assume it: `window.isSecureContext === true` and
      `navigator.mediaDevices.enumerateDevices()` returns labelled devices after
      permission, inside the shipped shell.
- [ ] Electron's permission handler must actually grant `media`. A secure context
      that the app then denies is the same blank screen with a different cause.

### Loopback by default; LAN is opt-in

Unchanged in effect from
[§10.3 bullet 1](../offline-pos-options.md#103-trust-and-packaging-decisions), and
now structural rather than a setting: an in-process bridge has no listener to
expose until the LAN tier is deliberately turned on.

Turning it on brings the whole of §10.2a back — registration, assignment,
fingerprint verification — plus the unresolved **TLS question**
([§7.5](../offline-pos-options.md#7-open-questions),
[§10.5.5](../offline-pos-options.md#105-still-open)): a local cert, or accepting
plain HTTP on a trusted VLAN. That question is not solved here. D7 owns it.

### Where the SQLite file lives, and what is in it

The replica holds **cost prices**. With Mail it also holds message bodies and
attachments; with Studio, project media. This is the most sensitive thing the
desktop puts on disk.

- [ ] One SQLite file per branch, in the app's **`userData` directory** —
      [§11.1](../offline-pos-options.md#111-what-this-replaces-in-10) replaced
      §10.3's "a directory the service owns" with exactly this. On Windows that is
      per-user under `%APPDATA%`, so OS ACLs already keep other users out. Do not
      put it beside the executable in `Program Files`.
- [ ] The outbox is **append-only**; nothing deletes a queued write except a
      confirmed replay.
- [ ] Evaluate at-rest encryption with the key held in the OS credential store
      (Electron's `safeStorage`, DPAPI-backed on Windows). State the honest limit:
      it defends a stolen disk and a copied file, not a logged-in attacker at the
      till. Decide in D6, not later — retrofitting encryption onto a live replica
      means a migration on every install.
- [ ] Offline, the bridge cannot verify a JWT signature without the key, so it
      validates **shape and expiry only** — a real weakening, stated plainly in
      [§6](../offline-pos-options.md#6-lan-mode) and unchanged by the desktop host.
      In-process this is much less exposed than on a LAN, because there is no
      listener for an attacker to reach.

## Electron hazards that must become release gates

All three are documented **in this repo already**, discovered the hard way, and
each presents as something other than what it is. Promote them from comments to
gates.

### 1. Hidden windows freeze `requestAnimationFrame`

`rAF` only fires while the page is actually being composited. In an offscreen or
non-rendering context it **never ticks at all** — so an rAF-driven loop hangs
forever rather than merely stuttering. Recorded verbatim at
[`video/index.js:2778–2783`](../../../packages/video/index.js), which
is why the render loop is paced by `setTimeout` and not by rAF.

Two symptoms, one cause, and neither points at the window:

- **Studio renders stall** — the frame loop never advances.
- **Next never hydrates** — React's scheduler leans on the same frame signal, so
  the app renders its server HTML and then sits there, inert. This reads as "the
  app is broken", not as "the window is hidden".

- [ ] `backgroundThrottling: false` on every `BrowserWindow`, including hidden
      render windows. Already named as the fix in
      `video-studio-v4-plan.md:331`.
- [ ] **Probe `document.visibilityState` before believing any UI failure.** Make
      this a first-line diagnostic in the shell's own error reporting, not folk
      knowledge — a hidden-window hang and a genuine app bug look identical in a
      screenshot.
- [ ] A window that must render while not visible is `show: false` **plus**
      `backgroundThrottling: false`, and it is verified by the gate below, not by
      inspection.

### 2. Offscreen windows produce undersized output

`canvas.captureStream(fps)` samples the canvas **off the compositor**, and a
hidden or unfocused window barely composites — so it silently drops most of what
was painted. The recorded symptom, at
[`video/index.js:2686`](../../../packages/video/index.js): a render in
an offscreen Electron window came out *"a fraction of the size of the same render
in a visible tab"*.

The fix is already in the code: `captureStream(0)` plus explicit
`videoTrack.requestFrame()` per painted frame, which removes the compositor from
the path entirely, with a rate-based fallback only for engines lacking
`requestFrame`.

- [ ] The gate is that the manual-frame path is the one taken. If
      `manualFrames` is false in the shipped Electron, every render silently
      regresses to the broken behaviour — assert it, do not hope for it.

> The brief for this program cited `packages/video/index.js:2497` for this
> hazard. That line is audio duck-envelope code. The offscreen-output hazard is at
> **:2686** and the rAF hazard at **:2778**. Corrected here so the next reader
> lands on the right comment.

### 3. The A/B harness is the gate

[`packages/video/harness/`](../../../packages/video/harness) already
exists and already encodes the right two checks. `serve.cjs` materializes
`baseline.js` out of git history at `AB_BASELINE_REF` (default `90e15fa`) and
serves `ab.html` on port 4890, so old and new render side by side and are
byte-compared.

| Gate | What it asserts | Where it surfaces |
|---|---|---|
| **60/60** | Every frame byte-identical — 5 looks × 12 timestamps (10 evenly spaced + the title boundary + midpoint, the instants where inclusive/exclusive window bugs live) | `window.__AB` |
| **6/6** | Sound checks: both clips audible in their windows, clip B silent before its instant, the legacy bed form still records, file duration sane | `window.__SOUND` |

- [ ] **Run the harness inside the desktop shell**, not only in a browser tab.
      That is the entire point: it is the only automated thing in this repo that
      would catch hazards 1 and 2, and it only catches them if it runs where they
      occur. A green harness in Chrome proves nothing about a hidden
      `BrowserWindow`.
- [ ] Run it in a **visible** window and in a **hidden** one, and require both to
      pass. Divergence between them *is* the hazard.
- [ ] Block the release on it. Note the harness is a page, not a CLI — wiring it
      into a headless run is part of D6, and both result objects are already
      exposed on `window` for exactly that.

## Updates

- [ ] **electron-updater, one feed for the container.** App bundles ship *inside*
      a container release; there is no per-app update channel.

**The tradeoff, stated plainly: this couples app release cadence to desktop
releases.** A one-line Mail fix ships as a desktop release, waits for the Studio
gate, and is downloaded by every till including the ones that never open Mail.

That is accepted, and it is the same argument
[§11](../offline-pos-options.md#11-amendment-2026-08-13--electron-hosts-the-bridge)
used to kill the standalone service: *"a bridge one release behind its POS is a
data-shape bug waiting to happen, not a cosmetic one."* Independently-updatable
app bundles recreate exactly the version-skew problem the container removed. The
mitigation is process — ship the desktop often, on its own tags — not a second
update channel.

- [ ] Signed installer. An unsigned binary asking a shopkeeper to click through
      SmartScreen is a support cost and a training-users-to-ignore-warnings cost.
- [ ] Staged rollout with a pinned previous version, and a documented downgrade.
      A bad desktop release stops a shop trading; a bad web deploy does not.
- [ ] The updater must never restart the app with a **non-empty outbox** without
      saying so. Queued sales surviving an upgrade is a promise the append-only
      outbox already makes; verify it across an actual version bump.

## Connectivity and the queue live in shell chrome

Both live in the **shell**, not in any app, **because the outbox is shared**. One
bridge, one queue, one conflicts list, across all three apps. Per-app queue
screens would have to reconstruct a global ordering from a partial view, and
would disagree with each other about it.

This is a direct payoff of the container choice, and it is the clearest
user-visible one.

- [ ] Connectivity indicator in the shell frame, driven by `/bridge/status`:
      online / offline / draining, with replica age.
- [ ] One queue & conflicts screen: what is queued, per app, in replay order;
      what conflicted and why; what a human must decide. `onConflict: 'flag'`
      ([§3](../offline-pos-options.md#3-descriptors-declare-offline-policy)) has to
      land somewhere a human looks.
- [ ] `mode: 'reject'` refusals surface with the descriptor's `reason` string. The
      cashier reads *"An exchange needs a live lookup of the original sale"*, not
      a stack trace.
- [ ] Apps get **read-only** awareness of connectivity through the preload — an
      app may grey out a button, but it must not branch its data path on it
      (ground rule 1).

## Build and deploy impact

The repo already builds ~22 apps sequentially per deploy: `build:all` is
`node scripts/js/run-app.js build` ([`package.json:113`](../../../package.json)).

- [ ] **The desktop artifact is a SEPARATE pipeline on release tags. Not part of
      `build:all`.** Three reasons, each sufficient on its own:
      1. The desktop build needs a different origin configuration from the server
         deploy — the whole point of
         [§The build-time/runtime API origin problem](#the-build-timeruntime-api-origin-problem).
      2. It needs code signing and an electron-builder toolchain that the LAN and
         VPS deploy paths must not depend on.
      3. Adding it to the critical path makes every ordinary web deploy slower and
         gives it a new way to fail.
- [ ] Only the bundled apps build for the desktop — 3 of 22 in v1, not all of them.
- [ ] The desktop pipeline must **not** poison the committed lockfile. This repo
      has been bitten by `npm link` and by workspace lockfile churn; a new
      toolchain in a new pipeline is exactly where that recurs.
- [ ] Keep the desktop's own version distinct from the monorepo's app versions,
      and put both in `/bridge/status`. "Which build is this till running" is the
      first question of every support call.
