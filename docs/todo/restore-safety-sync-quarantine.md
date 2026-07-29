# Restore safety: stopping a restored database from syncing

## The problem

LAN master data is periodically restored onto the live server. A Strapi database
dump carries far more than content — it carries **the identity and the licence to
act**:

| what the restore brings | why it is dangerous on the target |
| --- | --- |
| `marketplace-account` rows incl. `api_key`, `extra_config.base_url` | the live box can now authenticate against the peer |
| content-sync-pro config: peer base URL, API token, shared secret, `instanceId` | the live box can now push/pull content |
| sync profiles with `executionMode: 'live'` / `'scheduled'` | schedulers start on boot, lifecycle hooks fire on every write |
| watermarks (`last_orders_synced_at`, `last_status_pushed_at`, `last_messages_synced_at`, content-sync `last-sync-timestamps`, deletion snapshots) | meaningless on the new box; drive replay or skip |
| `syncDeletions` toggles | mass deletion propagated to the peer |

The restored instance believes it is the master. Left alone it will, within
minutes of boot: push CMS content *from* live *back to* the LAN (overwriting the
real master), push order statuses, and potentially sync against **itself** if the
restored peer URL happens to point at the live host.

## Why today's identity does not protect us

content-sync-pro already has an `instanceId` — but it is stored in the **plugin
store, i.e. in the database** (`server/src/services/config.js:142`). It is used
during pairing, not as a runtime guard. A restore copies it verbatim, so the
target's identity becomes the source's identity. pos-strapi has no env-based
instance identity at all.

**The governing principle: an instance's identity must live somewhere a database
restore cannot overwrite.** Everything below follows from that one sentence.

---

## The design

### Layer 1 — Env-anchored ownership stamp (the core protection)

Each box gets an immutable, per-host environment variable:

```
RUTBA_INSTANCE_ID=lan-master        # or: rutba-pk-live
```

The database carries an **ownership stamp** — the instance id that last claimed
it — in a plugin store key or a tiny `system-identity` single row.

On boot, compare the two:

| env id | DB stamp | state | behaviour |
| --- | --- | --- | --- |
| `lan-master` | `lan-master` | **owned** | normal |
| `rutba-pk-live` | *(empty)* | **unclaimed** | claim it, stamp, normal |
| `rutba-pk-live` | `lan-master` | **foreign** | **QUARANTINE** |
| *(unset)* | anything | **unidentified** | quarantine (fail safe) |

A restore is precisely the third row, and it is detected before a single sync
runs. Note this correctly does *not* fire for an ordinary same-box backup
restore, which is what you want.

Expose the result once at boot as `strapi.rutbaInstance = { id, state, role }`
so every consumer reads the same verdict rather than re-deriving it.

### Layer 2 — Quarantine semantics

Quarantine must stop *outbound action* while leaving the instance fully usable —
a restored site still has to serve customers.

**Refuse, don't mutate.** Do not flip `is_active=false` on accounts or delete
config. Mutating the restored data makes the state confusing and the eventual
adoption lossy. Refuse at the chokepoints instead:

- `strapi.plugin('strapi-content-sync-pro')` — `syncNow`, `executeProfile`,
  `bulkTransfer.start`, and **`initializeSchedulers()` must not arm** on boot
- live-mode lifecycle hooks return immediately
- the new `/content-sync/run` endpoint returns 409 with the reason
- marketplace: `pushOrderStatusForAccount`, `syncOrdersForAccount`,
  `syncCatalogForAccount`, `syncInventoryForAccount`, `syncOrderMessagesForAccount`

**The single highest-value chokepoint** is
`GET /marketplace-accounts/:id/secrets`. The worker is a separate process and
cannot obtain credentials any other way — refusing there disables every
marketplace flow in one place, including flows added later. Do that *as well as*
the per-function guards, not instead of.

### Layer 3 — Self-target refusal

Independent of ownership, refuse to sync against yourself. Both peers already
expose a ping (`/api/strapi-content-sync-pro/ping`, and the rutba adapter's
`validateConnection`). Have ping return the **env-anchored** instance id, and
before any run:

```
if (peer.instanceId === ownInstanceId) → hard stop
```

This catches the nastiest restore case — a peer URL that now resolves to the
host reading it — and is cheap enough to run on every execution, not just at
pairing.

### Layer 4 — Declared role, from env

```
RUTBA_SYNC_ROLE=master     # LAN
RUTBA_SYNC_ROLE=edge       # rutba.pk
```

The env value **overrides whatever the database claims**. An `edge` refuses the
outbound directions that only a master should perform: CMS content push, catalog
push, inventory push. It may still receive, and still push order statuses and
conversation messages, which legitimately flow edge → master.

This is defence in depth: even if ownership were somehow satisfied, a restored
master-configured DB running on the edge box still cannot push content.

### Layer 5 — Peer allowlist, from env

```
RUTBA_SYNC_PEER_ALLOWLIST=https://api.rutba.pk
```

Any peer base URL outside the list is refused. Protects against a restored DB
carrying a stale or unexpected peer, and makes the blast radius of a bad config
edit finite.

### Layer 6 — Adoption ritual

Quarantine needs a deliberate, visible exit — an operator screen, not an env
flag someone flips in a hurry. "Adopt this database" should:

1. re-stamp the ownership record with this box's env id
2. **reset every sync watermark to now** — otherwise an adopted DB replays weeks
   of history on its first run
3. **force `syncDeletions` off** on all profiles, requiring explicit re-enable
4. **clear content-sync-pro's deletion snapshots** (`synced-ids:*`), which encode
   the *other* box's view of what existed and would otherwise drive deletions
5. require the operator to re-confirm each marketplace account before it
   reactivates
6. write an audit record: who adopted, when, from which previous instance id

Points 2–4 matter as much as the quarantine itself: adopting without them simply
delays the damage to the moment someone clicks the button.

### Layer 7 — Make the state impossible to miss

- a persistent banner in every app: *"This database was restored from
  `lan-master`. Sync is paused."*
- the same on the content-sync-pro admin panel and the marketplace accounts page
- the health/diagnose endpoint reports `state: foreign` so deploy tooling sees it
- one alert through the existing alerts service on entering quarantine

---

## What this does and does not cover

**Covers:** LAN→live restores, live→LAN restores, a clone spun up for staging
that would otherwise sync against production, and self-targeting.

**Does not cover:** someone setting `RUTBA_INSTANCE_ID` on the live box to
`lan-master` to "make the warning go away". That is a deliberate override, and
the audit record is the mitigation. Worth stating plainly in the runbook so the
temptation is named up front.

**Does not cover:** a restore performed while the worker is already running with
credentials in memory. Restores should stop the worker first; the runbook should
say so.

---

## Suggested build order

1. **Ownership stamp + quarantine state** — env var, boot check, `strapi.rutbaInstance`,
   and the `/secrets` refusal. On its own this stops every marketplace flow. Small.
2. **content-sync-pro guards** — skip `initializeSchedulers`, refuse the run
   entry points. Needs a plugin change and a republish.
3. **Self-target refusal** — ping returns the env id; check before each run.
4. **Banner + diagnose reporting** — cheap, and turns a silent state into an
   obvious one.
5. **Adoption screen** — the largest piece; until it exists, adoption is
   "set the env var and restart", which is acceptable as an interim.
6. **Role + peer allowlist** — hardening once the above is in place.

Steps 1 and 4 together already remove the catastrophic outcomes; the rest is
depth.

## Decisions needed from you

- **Instance ids**: `lan-master` / `rutba-pk-live`, or something else? They end
  up in env files, logs and audit records, so pick names that read well in an
  incident.
- **Where the stamp lives**: plugin store key (no schema change, invisible to the
  admin UI) versus a small `system-identity` content type (visible, queryable,
  syncable — which we would then have to exclude from sync). Recommend the plugin
  store precisely because it is not a content type.
- **Quarantine strictness on the edge**: should a quarantined live site refuse
  *inbound* writes too, or only outbound? Refusing inbound as well is safer but
  means a restore also pauses the LAN's ability to push to it.
