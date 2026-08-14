# 05 — Does rutba-core actually run on SQLite?

> **Status (2026-08-14): investigation complete, verdict below.** This document
> de-risks one sentence the whole offline design rests on:
> *"local reads come from rutba-core run against local SQLite, not from new code"*
> ([`offline-pos-options.md` §10.1](../offline-pos-options.md)). Phase 2 of the
> bridge — replicator plus local reads — is built directly on it.
>
> Everything below was **run**, not reasoned about. Where a result is an
> artefact of the test rig rather than a property of SQLite, it says so.

## Verdict in three lines

1. **The database layer ports.** Migrations, transactions, the filter dialect
   and the transactional outbox all work on SQLite. Not one test failed because
   of a SQL-dialect difference.
2. **The application does not boot, for a reason that has nothing to do with
   SQLite:** rutba-core has no code that can *create* the 469-table base schema.
   It only knows how to *read* a schema Strapi built.
3. **The §10.1 assumption holds for the code and fails for the data.** It needs
   one added sentence about where the schema comes from. The cheapest fix
   already exists in the repo and is not new code.

---

## 1. What was run, and against what

The SQLite driver from `claude/nostalgic-thompson-49a36b` is **already merged to
`dev`** (commit `9505328`). This branch was fast-forwarded to `dev` (`80c8975`)
rather than re-implementing anything.

Every run below used a scratch database outside the repo. No repo schema was
modified — as scoped.

**One environment note that is itself a finding.** `npm --prefix rutba-core
install` fails on this machine: npm auto-runs `node-gyp rebuild` for
`better-sqlite3` (it has a `binding.gyp` and no `install` script), and node-gyp
cannot find a usable Python. But **better-sqlite3 13.0.3 ships prebuilt binaries
inside the tarball** — `prebuilds/win32-x64.node` and seven siblings — and
`lib/binding.js` prefers them over any local build. `npm install
--ignore-scripts` therefore produces a fully working install:

<!-- verify-docs: external prebuilds/win32-x64.node lib/binding.js -->


```bash
npm --prefix rutba-core install --ignore-scripts
```

That matters for [02 §Updates](02-desktop-shell.md#updates): the desktop bundle
does **not** need a compiler toolchain on the target machine, but it does need
an install path that does not treat a failed optional source-build as fatal.

## 2. The migration chain on a fresh SQLite file

`node scripts/migrate.js status` → 11 pending, and one cosmetic bug:

```
[migrate] database: undefined
```

`scripts/migrate.js:58` prints `getDb().client.config.connection.database`. The
SQLite config has no `database` — it has `connection.filename`. The command whose
entire purpose is *"check which database you are about to alter before you press
on"* prints `undefined` under SQLite. Trivial to fix, worth fixing precisely
because of what the surrounding comment says it is for.

`node scripts/migrate.js up`:

```
[migrate] created core_migrations
[migrate] created core_events
[migrate] created core_event_deliveries
[migrate] up 001-core-events ok in 27ms
[migrate] failed: contact_tickets does not exist — this migration extends the live pos-strapi table
```

**001-core-events — the transactional outbox — applies perfectly on SQLite.**
Three tables and nine indexes, with knex emitting correct SQLite DDL:

```sql
CREATE TABLE `core_events` (`id` integer not null primary key autoincrement, ...)
```

`t.increments()` became `integer … autoincrement` (the AUTO_INCREMENT vs
AUTOINCREMENT risk is handled by knex), and MySQL's index length prefixes — the
`191` in `t.string('name', 191)` — were correctly dropped rather than emitted as
invalid SQLite.

Migration 010 then fails because `contact_tickets` does not exist. **6 of the 11
migrations reference tables pos-strapi owns.** This is a *dependency* failure,
not a dialect failure — and it is the whole story of this investigation.

## 3. The structural finding: core cannot create the base schema

This is the one that matters.

- The **only** `createTable` in all of `rutba-core/src/` is the migrations
  ledger itself ([`migrations.js:104`](../../../rutba-core/src/platform/migrations.js)).
- `src/schema/registry.js` exports exactly `buildRegistry` and
  `ENTITY_STANDARD_COLUMNS`. It *derives table and column names* so the
  `documents()` shim can query a database that already exists. It emits no DDL.
- The migrations README states the design directly: everything outside
  core-owned tables "is still derived from pos-strapi's `schema.json` files".

So a fresh SQLite file after the full migration chain contains **4 tables**
(`core_migrations`, `core_events`, `core_event_deliveries`, `sqlite_sequence`) —
not the 140 entity + 314 link + 15 component tables the registry was validated
byte-exact against on MySQL.

The schema registry was never a schema *builder*. Strapi built those tables; core
learned to read them. Nothing in the offline design noticed that distinction,
because on the server the tables are simply always there.

## 4. Verification tooling

| Tool | Result on SQLite |
|---|---|
| `scripts/check-sqlite.js` | **12/12 pass** — the prerequisite session's own gate still holds |
| `scripts/validate-schema.js` | **Cannot run.** MySQL-only |
| 21 × `smoke-*.js` | 1 full run, 4 blocked on missing tables, 15 blocked on environment, 1 self-skipped |

`validate-schema.js` fails immediately:

```
Undefined binding(s) detected when compiling SELECT. Undefined column(s): [table_schema]
query: select `TABLE_NAME` as `name` from `information_schema`.`tables` where `table_schema` = ?
```

It reads `information_schema`, which SQLite does not have, and binds the
database name, which SQLite does not have either. `information_schema` appears in
three files (6 sites): `src/schema/naming.js`, `scripts/schema-diff.js`,
`scripts/validate-schema.js`. **The gate that certifies the registry is
trustworthy cannot be run against the database the bridge would use.** That is a
gap in the safety net, not in core itself, but it means "the registry matches the
database" is currently an unverifiable claim on SQLite.

### The smoke sweep, classified by *root cause*

Every script was run against its own fresh copy of the migrated file:

- **Ran fully — `smoke-events.js`: 46 pass, 1 fail.** Detail in §5d.
- **Reached the database, failed on missing base tables (4):** `smoke-documents`
  (`no such table: products`), `smoke-platform` (`branches`), `smoke-workflow`
  (`workflows`), `smoke-writes` (`orders`). Same root cause as §3.
- **Blocked by this worktree's environment (15):** `src/auth/up.js:40` loads
  `bcryptjs` and `@strapi/utils` out of `pos-strapi/node_modules`, which a
  worktree does not have. **This is not a SQLite failure** and is reported as
  such. It is, separately, a packaging constraint worth recording: **rutba-core
  has a hard runtime dependency on pos-strapi's `node_modules` tree**, which an
  Electron bundle shipping core would have to satisfy.
- **Self-skipped (1):** `smoke-sla` guards on `contact_tickets` and skips
  cleanly.

**No smoke script failed because of a SQLite dialect difference.**

## 5. The six specific risks

### a. DDL inside transactions — *safer on SQLite, not more dangerous*

A migration that fails after its second `CREATE TABLE`:

```
after rollback: ddl_a exists=false, ddl_b exists=false   (MySQL would leave BOTH behind)
```

SQLite runs DDL transactionally, so `withTransaction()` protects migrations in a
way it never could on MySQL. The migrations README's reasoning — that the
`hasTable`/`hasColumn` guards "are the actual recovery mechanism, not a style
rule" — is MySQL-specific and becomes redundant here. Redundant, not wrong: the
guards stay correct and idempotent. **No action needed.**

### b. `withTransaction()` and AsyncLocalStorage — *queues, does not deadlock*

The check-sqlite.js header worries that "a stray setTimeout, an unawaited
promise" could escape the ALS context. Tested directly — it does not:

```
getDb() inside setTimeout        === trx ? true
getDb() inside setImmediate      === trx ? true
getDb() inside an EventEmitter cb === trx ? true
```

AsyncLocalStorage propagates through every standard async resource. The
**actual phase-2 workload** — an independent task reading while a replicator
holds a write transaction — behaves correctly:

```
D2 replicator shape: txn ok; read ok in 317ms   → QUEUED behind a 300ms txn, then succeeded
D3 sustained load:   25/25 succeeded, 0 failed  (5 write txns + 20 reads interleaved)
Two racing writers:  both committed in 14ms
```

The pool of one **serializes**; it does not corrupt or error. Throughput is the
cost, not correctness — and for a single-till bridge that is the right trade.

There *is* a real failure mode, and it is worth naming precisely because it is
narrow. A query issued on a knex handle captured **before** a transaction opened,
and then awaited **inside** that transaction, is a circular wait — it blocks for
the full `acquireTimeoutMillis` and then throws:

```
THREW after 30020ms :: Knex: Timeout acquiring a connection. The pool is probably full.
```

That requires a specific anti-pattern: a module-scope `const db = getDb()`.
**There are zero such captures across 191 `getDb()` call sites in `src/`.** The
hazard is absent today; it is a code-review rule for phase 2, not a defect.

### c. Foreign keys — *ON, and the prerequisite doc says otherwise*

`check-sqlite.js` note #3 says foreign keys "are OFF by default in SQLite and are
left off here". Measured through the actual knex pool:

```
PRAGMA foreign_keys → {"foreign_keys":1}
inserting a child row with no parent → REJECTED (FOREIGN KEY constraint failed)
```

better-sqlite3 enables foreign keys by default. **This is good news and should
not be "fixed":** `src/documents/write.js` deletes component and link rows "via
FK cascade", so enforcement is something core's write path actively relies on.
The note in `check-sqlite.js` is inaccurate and should be corrected so nobody
later "restores parity" by turning them off.

### d. Type affinity — *one divergence survives the shim*

At the raw knex level SQLite diverges in several places. The interesting result
is how much `documents()` already normalizes away:

| Type | Raw knex on SQLite | Through `documents()` | MySQL reference | Verdict |
|---|---|---|---|---|
| `decimal` | `100.5` number | `100.5` number | `100.5` number | ✅ matches |
| `boolean` | `1` number | `true` boolean | `1` number | ✅ (better) |
| `json` | **string** | **parsed object/array** | parsed object | ✅ shim handles it |
| `enumeration` | CHECK constraint **enforced** | `"simple"` | ENUM enforced | ✅ matches |
| `integer` | number | number | number | ✅ matches |
| `datetime` | **epoch millis number** | **epoch millis number** | ISO string | ❌ **diverges** |

ENUMs are worth calling out as a pleasant surprise: knex emits a `CHECK`
constraint, so the constraint MySQL's `ENUM` gives you is **not** lost.

The one real divergence is `datetime`, and it is not theoretical — it is exactly
the single failing assertion in the outbox smoke:

```
FAIL envelope carries the spec fields — {"occurred_at":1786721715262, ...}
```

`smoke-events.js:189` asserts `typeof envelopeSample.occurred_at === 'string'`
(spec 28.4). Every other field in the envelope matched. **The transactional
outbox — the component the sync engine depends on most — is one type-coercion
away from full parity.**

This is a **fix, not a design problem**: a `postProcessResponse` hook in the
SQLite branch of `dbConfig()`, or a typed read in the shim, closes it. It must be
fixed deliberately, though, because `dateStrings: ['DATE']` is a *contract*
guarantee the MySQL config makes on purpose (see `contract-diff.js`), and silently
returning numbers instead would drift the two backends apart in a way no test
currently catches on SQLite.

### e. AUTO_INCREMENT, index prefixes, raw SQL — *clean*

- `t.increments()` → `integer not null primary key autoincrement`. Correct.
- MySQL's `191` index length prefix dropped, not emitted. Correct.
- **Zero MySQL-specific SQL functions in `src/`.** A scan for `LOCATE`, `IFNULL`,
  `CONCAT_WS`, `GROUP_CONCAT`, `DATE_FORMAT`, `NOW()`, `UNIX_TIMESTAMP`,
  `JSON_EXTRACT`, `JSON_CONTAINS` returns nothing.
- The one substantial raw-SQL site, the KB relevance score in
  `kb.repo.js`, is built from `CASE WHEN … LIKE`, `LOWER()` and `COALESCE()` —
  all portable ANSI SQL. (`LOCATE()` was probed as a hypothesis; it is
  unsupported on SQLite, but core does not use it.)

### f. The query/filter dialect — *behaves identically*

Tested by building the real `api::product.product` table in SQLite **from the
registry's own derived column list** (39 columns) and running `documents()`
against it:

| Filter | Result |
|---|---|
| `$eq` on string | ✅ |
| `$eq: true` on boolean | ✅ 2 rows (correct — D&P excludes the unpublished third) |
| `$eq: 'true'` as a **string** | ✅ **same 2 rows** — the prior-art coercion bug does **not** reproduce |
| `$in`, `$contains`, `$null`, `$and`/`$or` | ✅ |
| `$contains` case-sensitivity | ✅ 2 rows for `'shirt'` — matches MySQL's case-insensitive collation |
| `$gt` / `$lte` on decimals | ✅ correct partitions |
| `sort`, `limit`, `count`, `findFirst` | ✅ |
| draft/published status semantics | ✅ |

The specific prior-art regression this was aimed at — `$eq: true` reaching the
database as the string `'true'` and matching nothing — **does not occur on
SQLite.** String and boolean forms return identical rows.

> Two notes on rigour. First, an earlier version of this probe used a `price`
> column that does not exist on `products` (the real columns are
> `selling_price` / `cost_price` / `offer_price`); its contradictory `$gt`/`$lte`
> results were **the test's bug, not SQLite's**, and were corrected before the
> table above. Second, that mistake exposed a genuine core-level asymmetry,
> unrelated to SQLite and present on MySQL too: **a filter on a non-existent
> attribute is silently ignored, while a sort on one throws.** Worth a separate
> look; out of scope here.

## 6. What breaks, and of what kind

| # | Break | Kind | Cost |
|---|---|---|---|
| 1 | **No code can create the 469-table base schema** | **Design gap** | §7 — the only real decision |
| 2 | `datetime` returns epoch millis, not an ISO string | **Fix** | Hours: a `postProcessResponse` in the SQLite branch, plus a contract test |
| 3 | `validate-schema.js` can't run (information_schema) | **Fix** | Days: a SQLite branch over `sqlite_master`/`PRAGMA table_info` |
| 4 | `migrate.js` prints `database: undefined` | **Fix** | Minutes |
| 5 | `check-sqlite.js` note #3 says FKs are off; they are on | **Fix (doc)** | Minutes |
| 6 | Hard dependency on `pos-strapi/node_modules` | **Packaging** | Must be solved for Electron regardless of database |
| 7 | Pool of one serializes all access | **Accepted trade** | None — correct for a single till, latency-bound only |

## 7. Does "bridge = rutba-core on SQLite" hold?

**Yes for the code. Not, as written, for the data.**

Everything §10.1 claims about *code* is true and now measured: the query layer,
the transaction helper, the migration runner and the outbox all run on SQLite
without new code. The four dialect risks that could have been design-breaking —
DDL transactionality, ALS under a single-writer lock, the filter dialect, raw SQL
portability — all came back clean or better than MySQL.

What the sentence omits is that rutba-core is a **reader** of a schema it does
not own. On the server that is invisible. On a fresh till it is the whole
problem: there is no Strapi to build the tables, and core cannot build them
itself.

This gap is not covered elsewhere in the program.
[02 §Where the SQLite file lives](02-desktop-shell.md#where-the-sqlite-file-lives-and-what-is-in-it)
specifies where the replica sits and what it holds — but not where its **schema**
comes from. That question had no owner before this document.

So §10.1 needs one added sentence, not a rewrite:

> Local reads come from rutba-core run against local SQLite, not from new code —
> **against a schema baseline generated by pos-strapi, because core derives table
> names but never creates tables.**

### Alternatives, and what they cost

**A. Generate the baseline with pos-strapi itself — recommended.**
`pos-strapi/config/database.js:4` already reads
`env('DATABASE_CLIENT', 'sqlite')` — **SQLite is its default client**, and the
`sqlite` connection block is fully configured. Boot pos-strapi once against an
empty SQLite file in CI, let Strapi's own schema builder create all 469 tables,
and ship the resulting file as the replica baseline.
*Cost:* one CI job and a published artefact. *Benefit:* keeps a single schema
source of truth — the same `schema.json` files — so the registry stays as
trustworthy on the till as on the server. *Risk to close first:* Strapi's SQLite
DDL will not be type-identical to its MySQL DDL, which is precisely what break #3
currently prevents anyone from checking. **Fix `validate-schema.js` first, then
use it to certify the generated baseline.** That ordering is the real
prerequisite for phase 2.

**B. Teach the registry to emit DDL.** Feasible — the probe in §5f did exactly
this for one model in about twenty lines, using `model.columns` and
`model.scalars`. *Cost:* substantially more than it looks, because it must also
emit 314 link tables, 15 component tables, indexes and foreign keys. *Real
objection:* it creates a **second schema source of truth** that must stay
byte-identical to Strapi's forever — the exact drift `validate-schema.js` exists
to prevent. Choose this only if A proves impossible.

**C. Ship an embedded MySQL-compatible engine.** No engine worth shipping inside
Electron. Rejected.

**D. Run a real MySQL per till.** Contradicts §10.1's premise and makes the
desktop bundle heavy. Rejected.

**Recommendation: A, gated on fixing break #3 first.** Phase 2's first task is
not the replicator — it is making `validate-schema.js` SQLite-aware, then
certifying a Strapi-generated baseline with it. That is a days-scale change to
tooling, not a redesign, and it is far cheaper than discovering three weeks into
a replicator that the tables underneath it were never verified.

## 8. Reproducing this

```bash
npm --prefix rutba-core install --ignore-scripts
```

```bash
RUTBA_CORE__DATABASE_CLIENT=sqlite RUTBA_CORE__DATABASE_FILENAME=/tmp/x.sqlite node rutba-core/scripts/migrate.js up
```

```bash
npm --prefix rutba-core run check:sqlite
```
