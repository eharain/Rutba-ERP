# Restore safety: stopping a restored database from syncing

<!-- verify-docs: external server/src/services/config.js -->
<!-- Inside the strapi-content-sync-pro plugin repo. -->

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

### Layer 0 — Bind the stored integration to the database server itself (preferred)

Rather than asking an operator to set an env var correctly on every box, derive
the identity from the database server the data is sitting on. You are on
**MySQL 8.0** (`docker-compose.yml:23`), which gives us exactly the right value:

```sql
SELECT @@server_uuid;   -- e.g. 3e11fa47-71ca-11e1-9e33-c80aa9429562
```

**Why this value and not another:** `@@server_uuid` is generated on first start
and persisted in `<datadir>/auto.cnf`. It is **not part of a mysqldump** — a
logical dump contains schemas and rows, never `auto.cnf`. So a dump restored onto
a different MySQL server comes up with a *different* `@@server_uuid`, while the
data is identical. That is precisely the signal we want, and it costs the
operator nothing to maintain.

**How to bind.** Stamp at *write* time, verify at *read* time:

- when the integration is saved — content-sync-pro's remote config, and each
  `marketplace-account`'s credentials — record the current `@@server_uuid`
  alongside it (`bound_server_uuid`)
- whenever those credentials are read for use — `config.getConfig({ safe: false })`,
  `GET /marketplace-accounts/:id/secrets` — compare the stored binding to the
  live `@@server_uuid`
- mismatch → **the integration is treated as not configured**, and no sync runs

Binding per stored integration, rather than once globally, means the check sits
at the exact point where credentials are handed out. A flow added later that
reads credentials inherits the protection automatically.

#### The strongest form: make it structural, not a check

content-sync-pro already encrypts its secrets (`secure-keystore-js`). If the
encryption key is **derived from `@@server_uuid`**, a restored database cannot
decrypt the peer's API token or shared secret at all. Sync then fails to run
because the credentials are unreadable — not because a check said no. There is no
comparison to bypass, no flag to flip, and no code path that forgets to ask.

The cost is honest and, I would argue, correct: if the database legitimately
moves to a new MySQL server, the peer credentials must be re-entered. That is a
reasonable ritual, and it forces a human to confirm intent at exactly the moment
you want them to.

#### Where this does and does not fire

| restore method | `auto.cnf` | detected? |
| --- | --- | --- |
| `mysqldump` → `mysql <` import (the usual path) | not copied → new uuid | **yes** |
| phpMyAdmin / SQL file import | not copied → new uuid | **yes** |
| fresh container + re-import into a new volume | new uuid | **yes** |
| **copying the Docker volume / datadir wholesale** | **copied → same uuid** | **no** |
| same-box backup restore into the same server | same uuid | no — correct, nothing moved |

**The gap is physical copies.** A volume snapshot carries `auto.cnf`, so the uuid
travels with the data and the binding still matches. If volume-level copying is
ever how data reaches the live box, `@@server_uuid` alone is not sufficient —
which is why it should be *one component of a composite fingerprint*, not the
whole thing.

#### Composite fingerprint

Bind to a small set, and quarantine when any **strong** component disagrees:

| component | source | survives logical restore? | survives volume copy? |
| --- | --- | --- | --- |
| `db_server_uuid` | `SELECT @@server_uuid` | no → detects | yes → misses |
| app instance token | file on the app host (or `RUTBA_INSTANCE_ID`) | n/a | no → detects |
| `db_host` + `db_name` | connection config | often changes | often changes |

The first two are complementary: the database-side value catches a dump imported
onto an existing server, and the app-side value catches a wholesale copy of the
database volume. Together they cover both restore styles. `db_host`/`db_name` are
weak signals — log them for diagnosis, do not quarantine on them alone.

#### Other engines

`DATABASE_CLIENT` defaults to `sqlite` (`pos-strapi/config/database.js:4`), so
the resolver needs a per-engine strategy rather than assuming MySQL:

- **mysql / mysql2** — `SELECT @@server_uuid` (MySQL 8). Note **MariaDB does not
  have `@@server_uuid`**; fall back to the app-side token there.
- **postgres** — `SELECT system_identifier FROM pg_control_system()`, which has
  the same "identifies the cluster, not the dump" property.
- **sqlite** — no server identity at all; use the app-side token.

Resolve once at boot and cache it. If the engine offers nothing usable, say so
explicitly in the diagnose output rather than silently degrading to "no
protection".

### Layer 1 — Env-anchored ownership stamp (fallback / second signal)

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
temptation is named up front. Note the server-uuid binding of Layer 0 is much
harder to wave away in a hurry — you cannot casually forge a MySQL server uuid —
which is a further reason to lead with it rather than with the env var.

**Does not cover:** a datadir/volume-level copy, where `auto.cnf` travels with
the data. That is what the app-side token in the composite fingerprint is for.

**Does not cover:** a restore performed while the worker is already running with
credentials in memory. Restores should stop the worker first; the runbook should
say so.

---

## Suggested build order

0. **Server-uuid binding** — resolve `@@server_uuid` at boot, stamp it when an
   integration is saved, verify it when credentials are read. This alone stops a
   dump-and-import restore from syncing, needs no operator setup, and is the
   smallest piece here. Do it first.
1. **Ownership stamp + quarantine state** — env var / app-side token, boot check,
   `strapi.rutbaInstance`, and the `/secrets` refusal. Adds the second signal that
   catches volume-level copies, and gives every consumer one verdict to read.
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
