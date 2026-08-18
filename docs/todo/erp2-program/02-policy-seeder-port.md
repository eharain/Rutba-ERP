# Policy seeder port — P1

Status: **built and verified 2026-08-17.** The first P1 deliverable from the
[program plan](README.md): the api-pro descriptor seeder now runs inside
services/core, so a descriptor change reaches the route table with no Strapi
process alive.

## Why this one first

[§1.2](README.md) named it "the hardest residual dependency". Core reads its
**entire** route table out of `api_pro_interfaces` / `api_pro_interface_methods`
([server.js:87](../../../services/core/src/http/server.js)), and api-pro answers
every authorization question from `api_pro_method_policies` — but only
`packages/strapi-api-pro/server/src/services/seeder.js` could write those rows,
and it cannot run outside a Strapi process: it resolves content-type uids
through `strapi.contentTypes` and writes through `strapi.db.query`. Core's
compat layer has no `db.query(...).create` at all
([strapi.js:248](../../../services/core/src/compat/strapi.js)), so "just call the
plugin's seeder through compat" was never an option.

Everything else in P1 is easier once this lands, because every other task can
be developed with Strapi stopped.

## What shipped

[services/core/src/policy/](../../../services/core/src/policy/) — the beginning of the
`src/policy/` decomposition P1 calls for, so the plugin wrapper has somewhere to
retire into during P2:

| File | Role |
|---|---|
| [descriptors.js](../../../services/core/src/policy/descriptors.js) | contract → endpoint list. No database, no Strapi. |
| [scope.js](../../../services/core/src/policy/scope.js) | the scope shorthand → the four template columns. |
| [seeder.js](../../../services/core/src/policy/seeder.js) | endpoint list ↔ tables: plan, then write. |
| [checkpoint.js](../../../services/core/src/policy/checkpoint.js) | boot fast path. |
| [tokens.js](../../../services/core/src/policy/tokens.js) | API-token minting, in Strapi's formats. |

Plus [scripts/seed-policy.js](../../../services/core/scripts/seed-policy.js) (CLI),
[scripts/api-token.js](../../../services/core/scripts/api-token.js) (CLI),
[scripts/smoke-policy.js](../../../services/core/scripts/smoke-policy.js) (the
proof), migration
[021-policy-seed-checkpoint](../../../services/core/migrations/021-policy-seed-checkpoint.js),
and a boot hook in [src/index.js](../../../services/core/src/index.js).

The inference rules — action, uid, grant expansion, the alias-dedup pass, the
scope vocabulary — are **ported unchanged**. They decide which role may call
which route, so a "cleaner" rule that disagrees by one endpoint is a silent 403.

## Three deliberate improvements

1. **It diffs instead of upserting.** The Strapi seeder issues a findOne plus an
   update for every one of ~6,300 rows on each run — which is why it carries
   retry logic for pool exhaustion
   ([api-provider-seed.js:39](../../../services/strapi/src/seed/api-provider-seed.js)).
   Core computes the desired state, reads the current state in six queries, and
   writes only what differs. The steady state writes nothing, and the plan can
   be printed before it runs (`--dry-run`).

2. **It reports stale rows.** The old seeder never deleted, so a removed
   descriptor left its rows behind forever. In core that is not cosmetic — the
   router is built from those rows, so a stale row mounts a route the contract
   does not define, and a stale policy row is a grant the contract already
   revoked. See "What it found" below. Removal is opt-in (`--prune`), matching
   the standing rule that narrowing a descriptor never silently revokes, and
   `--prune` **never touches an admin-tuned row** (`templateVersion > 1`) even
   when no descriptor declares it: the Policy Editor can author a policy for a
   method the contract does not produce, and the DB has historically had a
   second writer in the plugin's file-store sync. Those are reported and kept.

3. **Table and column names come from the schema registry**, not string
   literals, so the seeder cannot drift from the schema the `documents()` shim
   reads.

Preserved exactly: an admin-tuned policy (`templateVersion > 1`, set by the
Policy Editor) is never overwritten, and an existing policy's `name` is left
alone.

## Boot behaviour

Reading the contract means importing 178 ESM descriptor modules — ~1.3s, which
is real boot-time cost for something that has not changed 99% of the time. So
boot hashes the input files and compares the row counts first, and only walks
the descriptors when either moved. Measured: **1,284ms cold, 40ms warm.**

`RUTBA_CORE_POLICY_SEED=auto` (default) | `off` | `force`. It never throws: a
core that cannot seed still boots and serves what the tables already hold, and
says so.

## Verification

The claim is that core writes the *same* rows Strapi wrote, so the check is a
direct comparison on the live database. `scripts/smoke-policy.js` runs entirely
inside one transaction that is deliberately rolled back, then confirms the
rollback: it snapshots Strapi's rows, empties the five tables and their link
tables, seeds from scratch with core, and compares column by column and link by
link.

**44/44 checks pass** against `pos_db` (2026-08-17):

- all 27 domains, 79 roles, 169 interfaces, 1,080 methods and 5,004 policies
  re-created — **6,359 rows and 6,163 link rows, every compared column
  identical**, no row the contract did not ask for;
- re-planning immediately after a seed finds nothing to do (idempotent);
- an admin-tuned policy survives a reseed;
- `--prune` removes exactly the stale rows and nothing else, and an
  admin-tuned orphan is reported separately and survives it;
- a minted API token is accepted by core's own auth middleware, and reveals
  back to the same plaintext key;
- every row count is unchanged after the rollback.

The suite was checked for teeth by injecting a defect (`resolverMode` strict →
lenient), confirming the failure, and reverting.

One expected divergence, normalized in the comparison and nowhere else: every
policy `name` Strapi wrote reads `Accounts Admin â†’ list`, because the plugin
seeder's own source file carries a mojibake arrow (U+2192 round-tripped through
cp1252). Core writes the real arrow. `name` is display-only and existing rows
keep whatever they have, so this never materialises on a live database.

Independently, `--dry-run` against the untouched live tables reports **0 inserts
and 0 updates** — the port reproduces the current state exactly.

## What it found

The stale-row report surfaced **54 rows the contract no longer declares**, all
of them invisible until now:

| Rows | What they are |
|---|---|
| 6 methods + 44 policies | `publish`/`unpublish` on `delivery-method`, `sale-return` and `supplier` — descriptors removed, rows left behind. Core mounts a route for each. |
| 2 policies | `acc-journal-entry:list` for `accounts_manager` and `accounts_staff`, after the descriptor narrowed to `approle: ['admin', 'accountant']` ([acc-journal-entries.js:32](../../../packages/api-provider/api/acc-journal-entries.js)) |
| 2 policies | `pay-payslip:list` and `pay-salary-structure:list` for `payroll_staff`, same cause |

The last four are live grants the contract already revoked — the concrete form
of the known "narrowing does not revoke" gap. Pruning them is a revocation, so
it is left as an explicit operator action:

```bash
npm --prefix services/core run seed:policy -- --dry-run --verbose   # read the list first
npm --prefix services/core run seed:policy -- --prune
```

## API-token minting

The other half of the P1 bullet. Core could already *verify* API tokens (the
marketplace worker, content-sync and inter-instance sync all authenticate with
one); issuing a new one still meant opening the Strapi admin panel. Tenant
provisioning ([P5](README.md)) has to mint one per tenant with no human in the
loop, so the formats are reproduced exactly — access key
`randomBytes(128).toString('hex')`, stored as
`HMAC-SHA512(API_TOKEN_SALT, key)`, plus an AES-256-GCM `encrypted_key` under
`sha256(ENCRYPTION_KEY)` in Strapi's `v1:iv:ct:tag` shape. Read off
`@strapi/admin`'s own api-token and encryption services rather than inferred,
and verified end to end in the smoke.

Custom-scope tokens (`type: 'custom'` with `strapi_api_token_permissions` rows)
are deliberately unsupported: the estate has never had one — the table holds
zero rows — and api-pro, not the token's action list, is what scopes access here.

## What this does not yet do

- **Enforcement still lives in the plugin.** `context`, `permission-engine`,
  `policy-resolver`, `request-interceptor` and `me-permissions` are still
  required straight out of `packages/strapi-api-pro/server/src/services/`
  through the compat layer. Moving them into `src/policy/` is P2 work, and this
  port exists partly to give them a destination.
- **The Policy Editor is still a Strapi-admin screen.** Re-homing it into
  `apps/admin/console` is its own P1 bullet.
- **Nothing was pruned.** The 54 stale rows are reported, not removed.
