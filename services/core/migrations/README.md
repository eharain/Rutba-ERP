# Core-owned SQL migrations

Tables that rutba-core owns outright. Everything else in the database is still
derived from pos-strapi's `schema.json` files through `src/schema/`, and
`scripts/validate-schema.js` must keep exiting clean — a migration that touches
a registry-owned table's shape breaks that gate and, with it, the `documents()`
shim.

Helpdesk is the pilot (program prerequisite P7, spec
`docs/todo/helpdesk-program/spec/37-database-and-domain-model.md` §37.3–37.4).
The consequence was decided consciously: **tables created here are invisible to
the schema registry, to `documents()` and to Strapi admin.** Code that reads
them uses knex via `getDb()` directly.

## Commands

```bash
npm --prefix rutba-core run migrate:status          # applied vs pending vs drift
npm --prefix rutba-core run migrate                 # apply everything pending
npm --prefix rutba-core run migrate -- --dry-run    # print the plan, touch nothing
npm --prefix rutba-core run migrate -- --name=004-helpdesk-desks
npm --prefix rutba-core run migrate:down            # roll back the last applied
npm --prefix rutba-core run migrate:down -- --name=004-helpdesk-desks
```

`node rutba-core/scripts/migrate.js status|up|down` works identically — core
loads the repo-root `.env` itself, so it needs no `load-env.js` wrapper. Every
command prints the target database first; check it before pressing on.

**Migrations never run at boot.** Nothing in `src/index.js` requires the runner.
Applying schema changes to a database a live pos-strapi is also serving is an
explicit, operator-timed act.

## File contract

```
rutba-core/migrations/<NNN>-<kebab-name>.js
```

```js
module.exports = {
  name: '001-core-events',
  async up(knex) { /* ... */ },
  async down(knex) { /* ... */ },
};
```

- `NNN` is zero-padded. Files are applied in **filename order** — the padding is
  what makes byte order equal apply order.
- `name` must equal the filename without `.js`; applied migrations are recorded
  under it. Renaming a file that has already been applied makes it run again.
- `down` is mandatory as either a function or a literal `null`. `down: null`
  declares the migration one-way; the runner then refuses to roll it back with a
  message rather than reporting a rollback that never happened. Always leave a
  comment saying why. Reverse a one-way migration with a new forward migration.
- `knex` is the transaction the migration is running in. Use it — opening a
  separate connection escapes the transaction.

## Rules

**Idempotent, always.** Guard with `knex.schema.hasTable` / `hasColumn` before
creating. This is not tidiness: MySQL implicitly commits on every DDL statement,
so a migration that fails after its second `CREATE TABLE` leaves the first table
behind while the tracking row is never written. The re-run has to walk over its
own wreckage, and the guards are what let it.

**Additive only on tables that hold live rows.** `contact_tickets` is the
standing example — never drop, rename or narrow an existing column; new columns
are nullable or defaulted. The legacy Strapi routes keep serving that table
throughout.

**No cascade delete on any foreign key**, anywhere.

**Reference data ships as migrations**, not `src/seed/data` JSON.

**An applied migration is frozen.** The runner stores a SHA-256 of each file
(LF-normalized, so `autocrlf` does not fake drift) and refuses to run anything
once an applied file's contents no longer match. Express the change as a new
migration. Editing an applied one is how dev, the LAN box and live end up at
three different schemas all claiming the same version.

Before running against anything that matters: back up, and test against a copy
of live data asserting row counts before and after. Backfills are the risky
ones — they are the only chance to recover existing data correctly.

## Tracking table

`core_migrations` — `id`, `name` (unique), `applied_at`, `checksum`. Created on
the first `up`. `status` and `--dry-run` never create it, so both are safe
against a database that has never been migrated.
