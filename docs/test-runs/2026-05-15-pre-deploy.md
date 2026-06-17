# Test Run — 2026-05-15 (pre-deploy audit)

> **Historical snapshot — 2026-05-15. Superseded; do NOT update.** The headline fails are resolved: the `/api/products/public/list` pageSize bug is fixed (`clampInt` in the pos-strapi product controller now bounds it to 1–100), and api-pro enforcement + `/me/permissions` are resolved (hybrid + denyByDefault, no policy = 403; populate fixed). Carry-forward items still worth a fresh check on the next deploy: the CORS whitelist for any extra ports (T4.38 — 4020/4030 unwhitelisted at the time), the anonymous Public-role over-grant on products/categories/brands/customers/sales (T0.6), and the manual-only tiers (T4.39 email, T4.40 backup/restore). Kept as the pre-deploy audit trail.

Automated portion of [../pre-deployment-test-plan.md](../pre-deployment-test-plan.md)
executed against the running Strapi at `localhost:4010`. User: id=2,
roleType `rutba_app_user`, 49 `app_roles`.

The UP-permissions seeder added in [pos-strapi/src/seed/up-permissions-seed.js](../../pos-strapi/src/seed/up-permissions-seed.js)
is in place but has **not run yet** — pos-strapi still on previous bootstrap.
Items affected by that note are flagged.

Legend: ✅ pass · ❌ fail · ⚠️ partial / inconclusive · ⏸ requires restart · 🔒 manual / out-of-band.

---

## Tier 0 — Security / Authorization

### T0.1 api-pro interceptor enforcement

| Probe | Expected | Actual | Result |
| --- | --- | --- | --- |
| Unauth → `/api/products` | 401 | **200 (652 b, full data)** | ❌ |
| Auth, no app/role headers → `/api/products` | 400/403 | **200** | ❌ |
| Auth + bogus role `not_a_real_role` → `/api/products` | 403 ROLE_NOT_ASSIGNED | **200** | ❌ |
| `cms_staff` → `/api/sale-orders` (cms not in apps) | 403 | **200** | ❌ |
| App-role mismatch (`x-rutba-app: accounts`, role `cms_staff`) → `/api/products` | 400/403 | **200** | ❌ |
| Valid claim `cms_staff` → `/api/products` | 200 | 200 | ✅ |

**Verdict: api-pro is not enforcing any of its declared invariants.** The
interceptor is effectively a no-op (see [../pre-deployment-findings-2026-05-15.md](../pre-deployment-findings-2026-05-15.md)
for root cause analysis — middleware ordering in plugin bootstrap).

### T0.2 Per-policy scope injection

Not testable until T0.1 passes. **⏸ blocked**.

### T0.3 UP permission surface for `rutba_app_user` (cms_staff claim)

Endpoints returning non-200 today:

| Endpoint | Code | Cause |
| --- | --- | --- |
| `/api/delivery-methods` | 403 | UP grant missing — ⏸ fixed by new seeder once Strapi restarts |
| `/api/delivery-zones` | 403 | same |
| `/api/hr-teams` | 403 | same |
| `/api/notification-templates` | 403 | same |
| `/api/riders` | 403 | same |
| `/api/sale-audit-logs` | 403 | same |
| `/api/return-requests` | 404 | descriptor stub — no server route exists |

All other 44 endpoints in the sweep returned 200.

### T0.4 `/me/permissions` correctness

```
roleType:                 rutba_app_user
appRoles count:           49
domains count:            49
rolesByApp keys:          0       ← ❌ empty; client RoleSwitcher cannot render
permissions content-type: 0       ← ❌ should reflect ~1794 seeded policies
strapiPermissions count:  0
```

❌ — the response shape is correct but `permissions` and `rolesByApp` are
empty. Likely a populate failure in `loadPoliciesForRoles` (see findings doc).

### T0.5 JWT lifecycle

Not auto-tested. 🔒 Manual: log in, idle 2 h, verify refresh; log out from one
tab, confirm other tabs lose access.

### T0.6 Public / anonymous routes

| Endpoint | Code | Size | Notes |
| --- | --- | --- | --- |
| `/api/products/public/list?pageSize=1` | 200 | **3 110 140 b** | ❌ **pageSize ignored** — returned all 1341 products (meta.pageSize=1, data.length=1341) |
| `/api/products/public/search?q=a&pageSize=1` | 200 | **2 500 006 b** | ❌ same pageSize bug |
| `/api/products/public/highest-price` | 200 | 2 040 b | ✅ |
| `/api/product-groups` | 200 | 562 b | ✅ |
| `/api/brands` | 200 | 324 b | ✅ |
| `/api/categories` | 200 | 335 b | ✅ |
| `/api/cms-pages` | 200 | 3074 b | ✅ |
| `/api/collections` | 404 | 94 b | ❌ descriptor present but route missing |
| `/api/site-setting?status=published` | 404 | 94 b | ❌ no published row on this DB |
| `/api/product-reviews/` | 404 | 94 b | ❌ descriptor present but route missing |
| `/api/sale-offers` | 200 | 81 b | ✅ |

Plus a **separate critical leak**: anonymous access to non-storefront
endpoints succeeds because UP's Public role has been granted find on several
private content-types:

| Anonymous probe | Result |
| --- | --- |
| `/api/products` | ❌ **200, 652 b (full product data, anonymous)** |
| `/api/categories` | ❌ 200 |
| `/api/brands` | ❌ 200 |
| `/api/customers` | ❌ **200, customer PII anonymous** |
| `/api/sales` | ❌ **200, sales data anonymous** |
| `/api/sale-orders` | ✅ 401 |
| `/api/cash-registers`, `/api/payments`, `/api/hr-employees`, etc. | ✅ 403 |

### T0.7 Mutation gating

| Probe | Expected | Actual | Result |
| --- | --- | --- | --- |
| `cms_staff` POST `/api/delivery-methods` (descriptor approle: admin/manager) | 403 | 403 | ⚠️ — UP rejects, not api-pro. Once UP seeder runs, this will leak to api-pro and likely pass through (T0.1 already shows api-pro non-enforcement). |
| `cms_staff` POST `/api/notification-templates` (descriptor approle: admin/manager) | 403 | 403 | ⚠️ — same |

---

## Tier 1 — Data integrity

Skipped — these require writes against a shared DB. 🔒 Manual.

---

## Tier 2 — Per-app smoke flows

Cannot drive UI from CLI. 🔒 Manual walkthrough per app.

The endpoint surface a CMS user sees is verified above (T0.3). Other apps'
endpoint surfaces inherit the same issue — anything not yet granted in UP for
`rutba_app_user` will 403 until the new seeder runs.

---

## Tier 3 — Cross-cutting client

Not auto-driven. 🔒 Manual.

---

## Tier 4 — Operational

### T4.35 / T4.36 Boot health

Seed checkpoint at [pos-strapi/.api-pro/seed-checkpoint.json](../../pos-strapi/.api-pro/seed-checkpoint.json):

```
seededAt:    2026-05-15T11:39:42.942Z
fingerprint: v2:913a6a5532b649b3214b83da341844f6abbaa9770d495b5e7297da3bfbf6086a
counts:      domains=19  roles=50  interfaces=51  methods=265  policies=1794
```

✅ seeder wrote rows. ⚠️ But policies are not retrievable via api-pro's
`/me/permissions`, suggesting either a populate or query bug — see T0.4.

### T4.38 CORS preflight

| Origin | Preflight | Headers echoed |
| --- | --- | --- |
| http://localhost:4001 | 204 | ✅ Allow-Origin, Allow-Methods, Allow-Headers including X-Rutba-* |
| http://localhost:4009 | 204 | ✅ |
| http://localhost:4013 | 204 | ✅ |
| http://localhost:4020 | **200** | ⚠️ no CORS headers returned — origin not whitelisted; preflight effectively rejected |
| http://localhost:4030 | **200** | ⚠️ same |

Action: confirm which apps run on 4020 / 4030 and whether they need
`CORS_ORIGINS` whitelisting in the active env file.

### T4.39 Email delivery

🔒 Manual — trigger a notification with valid SMTP creds in env.

### T4.40 Backup / restore

🔒 Manual.

### T4.41 Logs

Not inspected here. 🔒 Manual: tail pos-strapi log on next boot, watch for
`[up-perm-seed]` line and any `[api-pro]` warnings.

---

## Tier 5 — Performance sanity

T5.42 — implicit pass for list pages we hit (small bodies); ❌ the
`/api/products/public/list` ignoring pageSize is the dominant perf concern
right now (3 MB per page hit).

---

## Summary

| Tier | Pass | Fail | Blocked / Manual |
| --- | --- | --- | --- |
| T0  | 1   | 9   | 1 (T0.2 blocked on T0.1) |
| T1  | —   | —   | 8 manual |
| T2  | —   | —   | 13 manual |
| T3  | —   | —   | 6 manual |
| T4  | 1 (boot rows) | 2 (`/me/permissions` empty, 2 origins unwhitelisted) | 4 manual |
| T5  | partial | 1 (pageSize) | — |

**Deploy gates failing (must fix):**

1. **api-pro non-enforcement** — single biggest issue; touches T0.1, T0.4, T0.7.
2. **Anonymous access to products/categories/brands/customers/sales** — UP
   Public role over-granted. Either revoke those grants or move them into
   `/api/web/*` paths so they're explicitly storefront.
3. **`/api/products/public/list` ignoring `pageSize`** — controller-side bug.
4. **Missing UP grants for 6 content-types** — seeder added, ⏸ pending Strapi
   restart.
5. **Descriptor stubs without server routes**: `return-requests`, `collections`,
   `product-reviews` — either implement or remove the descriptor.
6. **`/api/site-setting?status=published` 404 on this DB** — needs the
   `ensureSiteSettingSingleton` path that creates a published row, or a manual
   publish.

**Manual verification still required:** every item in Tier 1 / Tier 2 / Tier 3,
plus T4.39 (email), T4.40 (backup), T4.41 (live logs).
