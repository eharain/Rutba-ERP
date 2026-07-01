# Rutba ERP — upgrade to latest stack (parity with TrustList as of 2026-07-01)

Concrete playbook for bringing every workspace to the same versions TrustList
was just brought to, plus what to watch for based on what actually broke there.

Rutba ERP is *ahead* of where TrustList started — already on Next 16.2.1 +
React 19.2.4 — so most of this is patch bumps, one Tailwind 4 migration (only
`rutba-web` uses Tailwind), and a Strapi minor bump. **No `middleware.ts` →
`proxy.ts` rename needed** — `rutba-web/src/proxy.ts` already exists. **No
`webpack:` config to remove** — all 16 Next apps already opt out of Turbopack
via `next dev --webpack`.

## 1. Current state vs. target

| Package                     | Where                       | Current    | Target    | Risk        |
| --------------------------- | --------------------------- | ---------- | --------- | ----------- |
| `next`                      | root workspace              | `16.2.1`   | `16.2.9`  | patch       |
| `eslint-config-next`        | root                        | `16.2.1`   | `16.2.9`  | patch       |
| `react` / `react-dom`       | root                        | `19.2.4`   | `19.2.7`  | patch       |
| `marked`                    | root                        | `^17.0.5`  | `^18.0.5` | major       |
| `eslint`                    | root                        | `^9.39.4`  | `^10.6.0` | major       |
| `@strapi/strapi` (+plugins) | `pos-strapi`                | `5.45.1`   | `5.49.0`  | minor       |
| `stripe` (Node SDK)         | `pos-strapi`                | `^21.0.1`  | `^22.3.0` | major       |
| `mysql2`                    | `pos-strapi`                | `3.20.0`   | `3.22.5`  | patch       |
| `react` / `react-dom`       | `pos-strapi` (admin bundle) | `^18.3.1`  | KEEP 18   | do not bump |
| `typescript`                | `rutba-web`                 | `^5.9.3`   | `^6.0.3`  | major       |
| `tailwindcss`               | `rutba-web`                 | `^3.4.19`  | `^4.3.2`  | major       |
| `@types/node`               | `rutba-web`                 | `^22.0.0`  | `^26.1.0` | major       |
| `@types/react`              | `rutba-web`                 | `^19.2.14` | `^19.2.17`| patch       |

**Do not bump these** (verified pitfalls, not oversights):
- `pos-strapi` → keep `react@18`, `react-router-dom@6`, `styled-components@6`.
  Strapi 5 admin bundles its own React and pins its admin ecosystem
  internally. Forcing v19 / v7 fragments the tree and can break the admin
  panel. Strapi has an open RFC for React 19 support — wait for it.
- `@types/mime` — npm outdated may show a *downgrade* (e.g. 4→3). That
  reflects a version-alignment change upstream, not a bump. Skip until you
  actually consume the `mime` package with a specific major pinned.

## 2. Execute in this order (one commit per successful upgrade)

Each step:  `npm install --legacy-peer-deps` → build the affected workspaces
→ smoke-test → commit. Never batch across risk classes.

### Step 1 — safe patches (single commit)

Bump these in `package.json` and commit as one:

```json
// root package.json
"next": "16.2.9",
"react": "19.2.7",
"react-dom": "19.2.7",
"eslint-config-next": "16.2.9",
"mysql2": "3.22.5"   // move to pos-strapi if not at root
```

```json
// pos-strapi/package.json
"@strapi/strapi": "5.49.0",
"@strapi/plugin-users-permissions": "5.49.0",
"@strapi/provider-email-nodemailer": "5.49.0",
"mysql2": "3.22.5"
```

```json
// rutba-web/package.json  (devDependencies)
"@types/react": "^19.2.17",
"@types/react-dom": "^19.2.3"
```

Then `npm install --legacy-peer-deps` from repo root, build every workspace,
commit.

### Step 2 — TypeScript 6 (rutba-web only)

`typescript ^5.9.3 → ^6.0.3` in `rutba-web/package.json`.

**Watch for:** TS 6 narrows Buffer's element-type generic — `new Response(buf, ...)` or `new NextResponse(buf, ...)` calls in Node runtime routes fail to type-check. Fix pattern (matches what TrustList did):

```ts
const buf = await fs.readFile(file);
return new NextResponse(buf as unknown as BodyInit, { headers: ... });
```

Grep first, then bump:

```
grep -rn "new NextResponse(buf\|new Response(buf" rutba-web/src
```

### Step 3 — Tailwind CSS 4 (rutba-web only)

Only `rutba-web` has Tailwind. Use the **hybrid path** — bump to v4 but keep
the legacy JS config via `@config`. Zero token / theme rewrites.

**a.** In `rutba-web/package.json`:

```json
"tailwindcss": "^4.3.2",
"@tailwindcss/postcss": "^4.3.2"
// keep @tailwindcss/typography, tailwindcss-animate — both are v4-compatible
// keep tailwind.config.ts unchanged
```

**b.** Rewrite `rutba-web/postcss.config.js`:

```js
module.exports = {
  plugins: {
    "@tailwindcss/postcss": {},   // replaces both tailwindcss + autoprefixer
  },
};
```

The new plugin bundles vendor prefixing; drop the `autoprefixer` line.

**c.** In `rutba-web/src/app/globals.css` (or wherever the `@tailwind`
directives live), replace this:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

with this:

```css
@import "tailwindcss";
@config "../../tailwind.config.ts";   /* relative from the CSS file */
```

**Watch for:** the build passing doesn't mean pixel-parity. Tailwind 4
changed some defaults — default border color (`gray-200` → `currentColor`),
preflight normalization, a few utility renames. Compare a page-heavy screen
(product grid, cart, checkout) against staging before merging.

### Step 4 — marked 17 → 18

Root-level bump. `marked` v13+ made `.parse()` async by default. Grep for
usages first:

```
grep -rn "from 'marked'" rutba-web/src pos-strapi/src
```

If you find `marked.parse(input)`, either pass `{ async: false }` explicitly
or `await` the result. If parsing runs server-side, `await` is fine. If it's
in a plain synchronous helper, use `{ async: false }`. TrustList's shared
`renderMarkdown()` already used `{ async: false }` so v18 was a no-op.

### Step 5 — Strapi-side Stripe SDK 21 → 22

`pos-strapi/package.json`: `"stripe": "^22.3.0"`.

**Watch for:** the SDK is called as `Stripe(key)` without `new` in TrustList's
adapter — that continued to work at v22. If your Rutba adapter uses `new
Stripe(key)`, no change needed. The API version pinned by the SDK does move
forward between majors — if you have integration tests against Stripe test
mode, run them against v22 before deploying.

### Step 6 — ESLint 9 → 10

Root: `"eslint": "^10.6.0"`.

Rutba already has ESLint 9 (flat config territory) and uses
`eslint-config-next`. ESLint 10 also uses flat config so this is mostly a
peer-dep and API surface bump. If `@eslint/eslintrc` (legacy compat shim)
is still declared, you may be able to drop it — try removing after the bump
and see if any config still references it.

Delete `"lint": "next lint"` scripts from every workspace: Next 16 removed
`next lint`. Replace with `eslint .` (or drop the script until a real
project-wide flat config is authored).

### Step 7 — @types/node 22 → 26 (rutba-web only)

Straight bump. `@types/node` tracks upstream Node — v26 works fine against
the Node 22 LTS runtime the workspace targets. No code changes expected.

## 3. What NOT to do (learned from TrustList)

- **Don't bump `react-router-dom` in `pos-strapi` to v7.** Strapi 5.49 pins
  6.30.4 across its admin ecosystem (@strapi/admin, @strapi/content-manager,
  @strapi/content-type-builder, @strapi/i18n, etc.) — a direct v7 dep
  fragments the tree.
- **Don't rewrite `packages/ui/tailwind-preset.js` as CSS `@theme` blocks
  unless you actually want that refactor.** The `@config` directive keeps
  the JS preset working under Tailwind 4 with zero rewrites.
- **Don't run `npx @next/codemod@canary upgrade latest` blindly.** For
  Rutba it's already on Next 16, so the codemod would go looking for
  15→16 changes and either no-op or introduce noise. Only reach for it
  if a specific breaking change (async request APIs, middleware rename)
  actually applies — and neither does here.
- **Don't remove `--webpack` from the dev/build scripts** unless you're
  ready to also validate every app boots under Turbopack. Rutba explicitly
  opted out of Turbopack in every Next app's scripts, presumably for a
  reason (custom webpack plugin? loader?). Verify before switching.
- **Don't `npm audit fix --force`** after any bump — it will resolve
  vulnerabilities by pinning transitive deps to old versions and can
  undo the upgrade.

## 4. Verification (do per app, don't batch)

For each Next.js app (16 of them):

```
npm run build:<app>
```

Every build must be **✓ Compiled successfully**. TS errors surface here;
runtime issues do not.

Then start the app and click through the golden path. Non-negotiable checks:
- Login (`pos-auth`)
- Any page that renders markdown (v18 async change)
- Any Stripe surface in `pos-strapi` (webhook, checkout, refund)
- rutba-web product grid + checkout + cart (Tailwind 4 visual regressions)
- Strapi admin panel (`pos-strapi` served) — most likely to surface Strapi
  5.49 quirks

## 5. Rollback per commit

Because each bump is a separate commit, `git revert <sha>` reverses one
upgrade without touching the others. Order matches the numbered steps above.

## 6. TL;DR command sequence

```
cd D:/Rutba/ERP

# Step 1 — safe patches
# (hand-edit the versions in root + pos-strapi + rutba-web per §2 step 1)
npm install --legacy-peer-deps
npm run build:strapi && npm run build:web && npm run build:auth
git commit -am "chore: bump Next/React patches, Strapi 5.45→5.49, mysql2"

# Step 2 — TS 6
# (edit rutba-web/package.json → typescript ^6.0.3)
npm install --legacy-peer-deps
npm run build:web    # fix any Buffer→BodyInit cast issues
git commit -am "chore: TypeScript 5.9 → 6.0.3 in rutba-web"

# Step 3 — Tailwind 4
# (edit rutba-web/package.json + postcss.config.js + globals.css per §2 step 3)
npm install --legacy-peer-deps
npm run build:web    # visual verify before merging
git commit -am "chore: migrate rutba-web to Tailwind 4 (hybrid @config path)"

# Step 4 — marked 18
# (edit root/package.json → marked ^18.0.5)
grep -rn "from 'marked'" rutba-web/src pos-strapi/src
npm install --legacy-peer-deps
npm run build:web && npm run build:strapi
git commit -am "chore: marked 17 → 18"

# Step 5 — Stripe SDK
# (edit pos-strapi/package.json → stripe ^22.3.0)
npm install --legacy-peer-deps
npm run build:strapi
git commit -am "chore: Strapi-side stripe 21 → 22"

# Step 6 — ESLint
# (edit root/package.json → eslint ^10.6.0)
# (remove "lint": "next lint" from every workspace package.json)
npm install --legacy-peer-deps
git commit -am "chore: eslint 9 → 10, drop dead next lint scripts"

# Step 7 — @types/node
# (edit rutba-web/package.json → @types/node ^26.1.0)
npm install --legacy-peer-deps
npm run build:web
git commit -am "chore: @types/node 22 → 26 in rutba-web"
```

## 7. Reference — what a TrustList commit series looks like

Same-scope upgrade on TrustList produced 8 commits on `feature/frontend-uplift`:

```
9f21d28 chore: migrate to Tailwind CSS 4.3.2
fb9ead6 chore: bump eslint 8.57.1 → 10.6.0, drop broken next-lint scripts
6567b5f chore: bump @types/node 22.15.3 → 26.1.0
7ddb1b8 chore: bump Strapi-side stripe 18→22 and html-react-parser 5→6
23005b8 chore: bump marked 12→18, isomorphic-dompurify 2→3
a960626 chore: upgrade TypeScript 5.8 → 6.0.3
03b5c97 chore: upgrade Next.js 15→16 + React 18→19 across all frontends
8e6b1e7 chore: bump Strapi 5.44→5.49 + safe patch bumps
```

Rutba's series should be smaller (already on Next 16 + React 19, no
middleware rename, only one Tailwind consumer). Aim for **6–7 commits**.
