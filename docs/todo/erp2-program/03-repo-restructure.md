# Repo restructure — P3, planned and tooled

Status: **target declared and tooled 2026-08-18; not executed.** Brought forward from
[P3](README.md) at the user's request. Nothing has moved: the target lives in
[config/apps.manifest.json](../../../config/apps.manifest.json) under `rename`, and
[scripts/js/restructure.js](../../../scripts/js/restructure.js) executes it when the tree is
quiet.

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

[rutba-core/migrations/022-rename-app-keys.js](../../../rutba-core/migrations/022-rename-app-keys.js)
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
