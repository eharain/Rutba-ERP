# Repo restructure — P3, planned and tooled

Status: **executed 2026-08-18.** Brought forward from [P3](README.md) at the user's request.
The move is done: 27 directories relocated, six app keys and seventeen role keys renamed in
the tree and in the database, all 22 apps building, `verify:wiring` 25/25, `verify:docs` clean,
`smoke-policy` 44/44.

The target was declared first in [config/apps.manifest.json](../../../config/apps.manifest.json)
under `rename` blocks and executed by
[scripts/js/restructure.js](../../../scripts/js/restructure.js). Those blocks have since been
promoted to the canonical fields and removed — the manifest now records the new world, and
`envPrefix`/`urlVar` are stored explicitly because the old derivation from the workspace
directory name died with the move (§8).

```bash
node scripts/js/restructure.js            # dry run — counts every change, touches nothing
node scripts/js/restructure.js --plan     # the mapping table
node scripts/js/restructure.js --phase=all --yes
```

## 1. Why now, and why not yet

[D8](README.md) says the restructure waits for Strapi retirement, because restructuring under a
live migration multiplies every conflict. That reasoning still holds, and the tooling is built
so the *decisions* are settled and reviewable now while the *execution* waits for a quiet tree.

"Quiet" is not a figure of speech. Measured 2026-08-18, the checkout had five uncommitted files
belonging to a concurrent session, and **9 of 16 worktrees were dirty — two with ~280 files**.
`restructure.js` refuses to run in that state, and prints exactly what is in the way. Every one
of those files would otherwise be stranded on a path that no longer exists.

## 2. The target

Six categories, already in the manifest and already load-bearing (the category drives the app
launcher's accent colour), become directories:

```
apps/
  sales/       pos* orders* crm rider marketplace helpdesk portal*
  inventory/   stock control* manufacturing
  people/      hr ess
  finance/     accounts payroll
  content/     storefront* cms social campaigns mail
  admin/       console* auth seed
services/      core strapi
packages/      api-provider shared sync video strapi-api-pro strapi-provider-upload-media
```

`*` = the app key changes too, not just the directory.

### 2.1 Every move

| Today | Target | Key | Roles |
|---|---|---|---|
| `pos-sale` | `apps/sales/pos` | `sale` → `pos` | `sale_*` → `pos_*` |
| `rutba-order-management` | `apps/sales/orders` | `order-management` → `orders` | `order_*` → `orders_*` |
| `rutba-web-user` | `apps/sales/portal` | `web-user` → `portal` | `webuser_*` → `portal_*` |
| `rutba-crm` | `apps/sales/crm` | — | — |
| `rutba-rider` | `apps/sales/rider` | — | — |
| `rutba-marketplace` | `apps/sales/marketplace` | — | — |
| `rutba-helpdesk` | `apps/sales/helpdesk` | — | — |
| `pos-stock` | `apps/inventory/stock` | — | — |
| `rutba-inventory` | `apps/inventory/control` | `inventory` → `control` | `inventory_*` → `control_*` |
| `rutba-manufacturing` | `apps/inventory/manufacturing` | — | — |
| `rutba-hr` | `apps/people/hr` | — | — |
| `rutba-ess` | `apps/people/ess` | — | — |
| `rutba-accounts` | `apps/finance/accounts` | — | — |
| `rutba-payroll` | `apps/finance/payroll` | — | — |
| `rutba-web` | `apps/content/storefront` | `web` → `storefront` | `web_public/user` → `storefront_*` |
| `rutba-cms` | `apps/content/cms` | — | — |
| `rutba-social` | `apps/content/social` | — | — |
| `rutba-campaigns` | `apps/content/campaigns` | — | — |
| `rutba-mail` | `apps/content/mail` | — | — |
| `rutba-admin` | `apps/admin/console` | `admin` → `console` | `admin_*` → `console_*` |
| `pos-auth` | `apps/admin/auth` | — | — |
| `rutba-seed` | `apps/admin/seed` | — | — |
| `rutba-core` | `services/core` | — | — |
| `pos-strapi` | `services/strapi` | — | — |
| `packages/pos-shared` | `packages/shared` | `@rutba/shared` | — |
| `packages/sync-core` | `packages/sync` | `@rutba/sync` | — |
| `packages/video-maker` | `packages/video` | `@rutba/video` | — |

### 2.2 The six key renames, and why each earns its cost

A key rename is not free — it is the `X-Rutba-App` header, the api-pro domain, and the prefix of
every role. Fourteen apps keep theirs. These six do not:

- **`sale` → `pos`.** `apps/sales/sale` is the repetition this sweep exists to remove, and the
  app is the point-of-sale terminal.
- **`inventory` → `control`.** `apps/inventory/inventory` is absurd, and `stock` versus
  `inventory` has never been separable by name. Its pages are levels, transfers, counts,
  adjustments, valuation, expiry and reorder — inventory control. `stock` keeps products and
  purchasing.
- **`admin` → `console`.** `apps/admin/admin` and the role `admin_admin` are both self-parody.
- **`web` → `storefront`.** "web" names the technology, not the thing. It is the public shop.
- **`web-user` → `portal`.** Reads as a user type, not an app. It is the customer portal.
- **`order-management` → `orders`.** The longest name in the estate, and its roles already
  disagreed with it (`order_*` under domain `order-management`).

### 2.3 What is deliberately left alone

- **`POS_STRAPI__`** stays. It carries the `DATABASE_*` values rutba-core falls back to, and ~20
  keys of it live in every deploy env including the LAN box's off-git master file. The whole
  block dies with pos-strapi in P2; renaming it now buys two coordinated live-env edits and
  nothing that outlives them.
- **`packages/strapi-api-pro`** and **`packages/strapi-provider-upload-media`** keep their names —
  both retire in P2, and renaming a component with a scheduled death date is churn.
- **`packages/api-provider`** is already right; renaming it would rewrite 390 files for nothing.
- **The `delivery` domain** is carried unchanged. The drift report (A3) called it undecided;
  measured 2026-08-18, **15 users hold `delivery_admin/manager/staff`**. Whatever its origin it
  is live, so the decision stays owed and nothing is revoked by accident.
- **`accounts-ap` / `-ar` / `-viewer`** keep their keys: they name permission scopes, not apps.

The one thing actively deleted is the **`users` domain alias** — `users_admin/manager/staff` are
held by **zero** users, so it protects nothing and is dropped rather than carried into the new
tree. That closes D2 from the [drift report](01-registry-drift-report.md).

**Naming collision to note:** claiming `console` for the tenant admin app means P5's control
plane can no longer be `rutba-console`. It becomes `services/control-plane`, which is the
clearer name anyway.

## 3. What the dry run measured

| Phase | Occurrences | Files |
|---|---|---|
| `paths` | 27 directory moves | — |
| `refs` (paths + npm names) | 3,835 | 806 |
| `identity` (env, url, unit, key, role) | 1,070 | 253 |

The largest single rewrite is `@rutba/pos-shared` → `@rutba/shared`: **917 occurrences in 406
files**.

## 4. The trap the dry run caught

The first draft matched every rename as a substring. Against the same files, that reported
**`sale` 417 times** and **`web` 201** — because those hits are `api::sale-order.sale-order`,
`sale-orders.js`, `webhook` and `website`. It would have produced `api::pos-order.pos-order` and
`storefronthook`.

Narrowing to a whole quoted token fixed those and exposed something worse: **`'admin'` still
matched 1,177 times**, because every descriptor carries `approle: ['admin', 'manager', 'staff']`
— where `'admin'` is a role *level*, not an app key. A quoted-token sweep would have rewritten
the authorization model of all 178 descriptors.

So app keys are not matched by text at all. They are rewritten only in the syntactic slots that
hold one, each named in `KEY_SLOTS`:

| Surface | Slot |
|---|---|
| `packages/api-provider/api/*.js` | inside `apps: [...]` and `domains: [...]` only — never `approle:` |
| `config/domains.json` | the top-level object key |
| `config/roles.json` | each role's `domain` value |
| `roles.js` | `APP_URLS` / `APP_META` keys, `VALID_APP_KEYS` entries |
| `pages/_app.js` | `setAppName('...')` |
| `config/apps.manifest.json` | `key` and `domains` |

That took `admin` from 1,177 to **57**, and every candidate file resolves to a known slot (168 of
168 for `admin`). A file that matches no slot is reported, never guessed at. Verified on real
descriptors: only `apps:`/`domains:` lines change; `approle:`, uids and `path:` are untouched.

## 5. Execution order

Each phase is one commit, red-to-green.

1. **`--phase=paths`** — 27 `git mv`s. History is preserved; nothing else is touched, so the tree
   is broken between this commit and the next by design.
2. **`--phase=refs`** — path strings, npm package names, imports. After this, installs and
   builds work again.
3. **`--phase=identity`** — env prefixes, URL vars, systemd units, app keys, domains, role keys.
   **Ships with the database migration below, in the same release**, or api-pro denies every
   request from a renamed app.
4. **`--phase=surfaces`** — `npm run verify:wiring` names whatever still disagrees with the
   manifest; each is a few lines by hand. Regenerating these from the manifest outright is the
   follow-up that makes adding an app a one-file change.

### 4a. The database half

[services/core/migrations/022-rename-app-keys.js](../../../services/core/migrations/022-rename-app-keys.js)
renames six `api_pro_app_domains.key` and seventeen `api_pro_app_roles.key` rows, then drops the
dead `users` domain.

**Grants survive on their own** — `up_users_app_roles_lnk` references `app_role_id`, not the key
string — so this touches zero link rows even though 69 of the 79 roles are held by real users.
The migration re-checks the `users` grant count at run time and refuses to drop it if anyone
holds one by then.

Policy rows are not patched there: the seeder owns them. After the migration,

```bash
npm --prefix rutba-core run seed:policy -- --prune
```

mints the policies for the new role keys and removes the old ones — the first real use of the
prune built in [P1](02-policy-seeder-port.md).

### 4b. Deploy-box steps, which no script can do

- `.env.production` on the VPS **and** the LAN box's off-git master env: rename every changed
  `PREFIX__` and `NEXT_PUBLIC_*_URL`.
- `systemctl disable --now` the old units before the new ones can bind their ports. Nine units
  change name.
- Rebuild all 22 frontends together: `X-Rutba-App` is baked in at build time, so a half-deployed
  fleet has apps sending keys the database no longer knows.

## 6. How it is caught if it goes wrong

- `npm run verify:wiring` — 25/25 must stay green; it checks the manifest against the registry,
  workspaces, env files, `roles.js`, `domains.json`, the descriptor scan list, Dockerfile,
  compose and `dev-start.bat`.
- `npm run verify:docs` — every relative link and backticked path in 162 markdown files; the
  restructure will break many, and this is what finds them.
- `npm --prefix rutba-core run seed:policy -- --dry-run` — exits 2 if the seeded tables and the
  renamed descriptors disagree.
- `npm --prefix rutba-core run smoke:policy` — 44 checks, inside a rolled-back transaction.
- `npm run build:all` — the real gate. Every app must build before any of this is committed.

## 7. Rollback

Phases 1–3 are a single `git revert` each, because nothing in them is destructive: `git mv`
preserves history and the text rewrites are mechanical. The migration has a real `down` that
restores the previous keys exactly.

The one-way step is the dropped `users` domain — deliberately not recreated on rollback, because
it was dead by measurement and seeding an alias nobody holds back into the database is not a
restoration.

## 8. What executing it actually cost

The dry run caught two classes before anything moved (§4). Execution found six more that no
amount of planning would have surfaced — every one of them silent, and every one caught by a
gate rather than by reading the diff.

**1. A path rule is not a name rule.** `rutba-web` is both a directory and an npm package name.
The first refs pass rewrote 23 `package.json` `"name"` fields into `"apps/content/storefront"` —
not a legal npm name — and rewrote `--workspace=rutba-web` in 69 root scripts into a path. Phase
2 was discarded and re-run after splitting the two: package names became `@rutba/<key>` through
their own slot-aware rule, ordered *before* path rules, because root `package.json` holds both
forms of the same string — `workspaces` (a directory) and `--workspace=` (a name).

**2. Prefix collisions on unrelated files.** `rutba-web-launch-backlog.md` is a document, not the
app; `lib/rutba-admin.js` is a module inside the marketplace app; `.gitignore` pinned
`/pos-strapi/scripts/rutba-cms-seed-data.xlsx`. A path rule matching a bare prefix rewrote all
three into nonsense — `rutba-web-launch-backlog.md` became `apps/content/storefront-launch-backlog`
plus the extension. Fixed by requiring the match
to be followed by something that is not `-` or a word character. The three docs were renamed to
drop the old app prefixes, which is the consistency this sweep is for.

**3. The tool corrupted its own inputs.** Phase 2 rewrote the manifest's `workspace` fields to
the new paths; phase 3 then derived each app's *old* env prefix from that same field and
produced `APPS/CONTENT/STOREFRONT__`, matching nothing — so env prefixes and URL vars were
silently skipped. Worse, the tree-wide role rule rewrote the left column of `ROLE_RENAMES`
inside migration 022 itself, turning all 17 pairs into `['pos_admin', 'pos_admin']`; the
migration ran, reported `0 role(s)` renamed, and would have looked like a success in a less
suspicious log line. Both are the same lesson: **a rename tool must never read its "from" values
out of state a previous phase can mutate.** Migrations and the mapping table are now excluded
from the sweep for exactly the reason applied migrations are checksummed — they are historical
records, not live references.

**4. Applied migrations are checksummed.** Rewriting a path inside a *comment* in seven applied
migrations tripped the drift guard and blocked every later migration. They were restored to
their frozen bytes; they still name `rutba-core` and `pos-strapi`, which is correct, because
those were the paths when they ran.

**5. Depth.** Apps went from one level below the root to three, services to two. Twenty-two
`next.config.js` files reached `../scripts/js/next-config-base`, and seven files computed the
repo root as `path.resolve(__dirname, '..', '..', '..')`. The string form was fixed by resolving
each candidate and only deepening it when the deeper path actually existed — which is what kept
an app's own internal `../components/x` untouched. The `__dirname` form is code, not a string,
and had to be found by hand: core's `REPO_ROOT` landed on `services/`, so no `.env` was found
and every database credential resolved to empty.

**6. Deleting a domain is structural, not textual.** Dropping the dead `users` alias meant
removing an object key from `domains.json`, three roles from `roles.json`, 36 entries from six
descriptors' `apps:` arrays, and one entry from the manifest — none of which is a string
substitution. The tool reports it and stops; `validate:descriptor-apps` is what named all 36.

**7. A green build proved nothing about env.** `load-env.js` detected its target from the
`--workspace=` / `--prefix` argument and derived the env prefix by upper-casing it. Phase 2
changed those 69 flags from directory names to package names; npm accepts either form, so every
build kept passing while every app silently lost its env block — the target resolved to
`@RUTBA/POS`, and `POS_STRAPI__*` matched nothing because `getAppDirs()` derived strapi's prefix
as `SERVICES/STRAPI`. The signal was 125 `WARN: Missing …` lines inside a run with zero failures.
Both functions now resolve `envPrefix` through `config/apps.manifest.json`, accepting a package
name, a workspace path or a bare key; the 24 known prefixes match `.env.development` exactly.

**1b. Finding 1 recurred during the merges, in the tool written to clean up after them.** The
three branches merged after the sweep were authored against the old paths, so their content was
swept with a small mapping script — which mapped `pos-shared → packages/shared` and duly rewrote
the npm specifier `@rutba/pos-shared` into `@rutba/packages/shared`, breaking `build:hr`. The
correct package name is `@rutba/shared`. Same lesson as finding 1, one layer up: **the cleanup
tool needs the same name/path separation the sweep needed.** Caught by `build:all`.

**8. The rename had a third half nobody listed: the identity on the wire.** §4a moved the app
keys in the repo and migration 022 moved them in `api_pro_app_domains`. Both were verified. But
each frontend also *announces* its identity — one bare `setAppName('<key>')` call in `_app.js`
that becomes the `X-Rutba-App` header api-pro matches against `api_pro_app_domains.key`. Nothing
referenced those strings, so the sweep never saw them, and **all six renamed apps were left
announcing a domain that no longer exists** — pos as `sale`, orders as `order-management`,
control as `inventory`, portal as `web-user`, console as `admin`, storefront as `web`. Every one
builds, boots, serves its public routes, and has every *authenticated* request denied. The server
side agreed with the stale value (`requireApp(ctx, 'web')`), which is exactly why nothing failed:
client and server were consistent with each other and inconsistent with the database.

The same header also keys `site_settings.app_slug`, which resolves an app's branding row. That
half fails *soft* — no error, just the default instance logo and the default tracking ids, the
symptom the console's own editor warns is "the usual reason someone concludes tracking is
broken". Migration `023-site-settings-app-slug.js` carries those rows across.

`verify:wiring` now asserts that every app's announced name is a real domain — the property that
actually matters, since `rider` legitimately announces `delivery`. Proven non-vacuous by
restoring the pre-fix value and confirming the gate fails.

**9. A dangling `file:` symlink made Strapi silently drop its own tables — and 13 users' grants.**
Found 2026-08-18, a day after the move, by a harness that simply started Strapi. `npm` had
resolved `services/strapi`'s three `file:` dependencies while the tree was mid-move and written
links one directory too shallow — `services/packages/strapi-api-pro` instead of
`packages/strapi-api-pro` — for the api-pro **plugin**, the upload provider, and api-provider.
The declarations in `package.json` were correct the whole time; only the install was wrong.

Strapi discovers plugins from `node_modules` and then runs a schema sync that **drops any table
no loaded plugin claims**. It booted without complaint and took all 13 `api_pro_*` tables with
it, plus `up_users_app_roles_lnk`.

The damage split cleanly along a line worth internalising. The 6,347 contract rows came back
**exactly** — `seed:policy` rebuilt them from the descriptors, `smoke-policy` passed 44/44 and
the follow-up dry run reported zero drift. That is precisely the property P1's seeder was built
for, and this is the first time it earned its keep. But `up_users_app_roles_lnk` is *data*, not
contract: no descriptor knows which user holds which role. Binary logging was on in `ROW` format
with 30-day retention, and it still could not rebuild the table — the auto-increment ids showed
the grants were inserted long before the retention window, so only a handful of recent mutations
survived. **A contract can be regenerated; an assignment cannot.**

`verify:wiring` now fails on any `file:` dep that does not resolve, distinguishing a *dangling
link* (delete it, then reinstall) from a *missing* one (just install) — `fs.existsSync` follows
symlinks, so a dangling link reads as absent and an earlier draft of the check reported the wrong
fix. It also checks the root `node_modules`, because npm workspaces hoist and the first draft
cried wolf over every hoisted dependency. Proven non-vacuous by recreating the exact broken link
and watching the gate name it.

Two things make this the worst of the nine. It is the only one that **destroyed data**, and it is
the only one where *every gate was green* — the tree was correct, the build passed, the manifest
agreed with itself. Nothing in the repo was wrong; the failure lived entirely in an install
artifact that no version-controlled file describes.

Four of these — the corrupted mapping table, the skipped env rules, the broken env target, and the
stale announcements — produced a **green-looking run that had done nothing**, which is the failure
mode worth remembering: the sweep's own output said `763 occurrence(s) rewritten` while the half
that mattered had quietly matched zero, a 22-app build went green while no app could read its own
port, and every gate passed while six apps announced a dead identity. The lesson is the same each
time — *assert on the end state, never on the tool's report of its own work*. Findings 7 and 8
share a sharper edge: both were **self-consistent**. The env target matched nothing but was
derived the same wrong way everywhere; the announced app name matched the server's check exactly.
A pair of values that agree with each other tells you nothing about whether either agrees with the
system of record — so check identity against the DB, not against its own mirror in the code.

### The gates that caught them

| Gate | Caught |
|---|---|
| `verify:wiring` | dead env derivation, `users` still in the manifest, Docker stage names |
| `verify:docs` | 36 broken links: bare package names, corrupted doc filenames, README depth |
| `npm run build:all` | `next.config.js` depth, the `lib/rutba-admin` collision |
| `migrate status` | seven applied migrations edited in place |
| `seed-policy --dry-run` | 1,328 superseded policy rows after the role rename |
| `smoke-policy` | the whole policy layer still correct under the new keys |
| `seed:policy` (as a *repair*) | rebuilt all 6,347 contract rows after finding 9 dropped them |

Note what is *missing* from that table: **nothing caught findings 7, 8 or 9.** Each was found by
reading a build log, a database, and a crash — not by a gate. All three are now covered by
`verify:wiring`, which is the honest summary of this restructure: the gates that existed caught
the textual mistakes, and every mistake that survived was about *state the repo does not
describe* — the env the boxes hold, the identity the apps announce, the links npm installed.

**Correction to an earlier draft of this section**, which claimed `build:all` exits 0 even when an
app fails and filed "make the runner propagate exit codes" as a follow-up. It does propagate —
`scripts/js/run-app.js` ends with `process.exit(failed ? 1 : 0)`. The zero came from *how it was
invoked*: `npm run build:all | tail` reports **tail's** exit status, not the build's, so a
pipeline always looks green. Redirect instead (`> build.log 2>&1`) and check `$?`. The commit
message on the phase-2 commit repeats the wrong version; this paragraph supersedes it.

The one real gap is that a missing env variable is only a `WARN` — which is how 125 of them rode
through a green run unnoticed. A missing `PREFIX__PORT` for a service that declares a port should
be an error. Until that lands, read the log as well as the exit code.

## 9. Still owed

- **Deploy boxes — tool written and locally proven, not yet run on the boxes.** Every env file on
  this machine is converted (`.env`, `.env.development`, `.env.production`, `.env.example`,
  `.env.[ENVIRONMENT].example`, `.env.docker`, `sample.env.enviromentname.txt`). The VPS and the
  LAN box's off-git master env still carry the old names, and nine systemd units must be
  `disable`d before the new ones will bind. Steps: [03a-deploy-runbook.md](./03a-deploy-runbook.md),
  generated by `scripts/js/gen-deploy-runbook.js`.

  Do it with `scripts/js/rename-env-prefixes.js <file> --write`, not hand-written seds. It is
  dry-run by default, backs up, is idempotent (`already current`, exit 0) so it can gate a deploy
  step, and it **refuses** a rename whose target key already exists instead of creating a
  duplicate — which is not hypothetical: `NEXT_PUBLIC_CORE_URL` → `NEXT_PUBLIC_API_URL` collides
  with the var strapi already owns.

  Two lessons are baked in. The mapping is **derived** in `scripts/js/p3-rename-map.js`, not
  tabulated, after the generator's first draft repeated finding 3 and got four unit names wrong
  (`rutba_sale` for what is really `rutba_pos_sale`, likewise auth, stock and strapi); it now
  asserts against the unit list recorded at `1684f226~1` and both consumers exit non-zero on a
  mismatch. And the first runbook **covered only the 23 `PREFIX__` renames and missed the 7
  `NEXT_PUBLIC_*_URL` renames entirely** — the same identity, in the same file, in a different
  shape. Converting the local files is what surfaced it: `.env.docker` still said
  `NEXT_PUBLIC_SALE_URL` while `docker-compose.yml` had already moved to `NEXT_PUBLIC_POS_URL`.
- **The compose variable convention** (`PORT_WEB`, `WEB_NEXTAUTH_SECRET`) was deliberately left
  alone: renaming it means editing the compose env file in lockstep, and `INVENTORY` also
  appears inside `RUTBA_MARKETPLACE__CRON_INVENTORY_RULE`, so a prefix sweep would corrupt an
  unrelated setting.
- **`workspaces` is still an explicit 22-entry list** rather than `apps/*/*`; collapsing it
  needs the validator to understand globs.
- **The marketplace worker** still shares the app's workspace; extracting it to
  `services/marketplace-worker` needs its own package.json first.
