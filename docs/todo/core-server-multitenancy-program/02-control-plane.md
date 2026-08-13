# Phases 1 & 5 — Control plane, provisioning, fleet ops

A standalone app (**rutba-console**, suggested port 4024 — 4019 is taken by
rutba-campaigns and 4023 by rutba-helpdesk; `scripts/rutba_apps.sh` is the registry)
with its **own small database**
— it must not live inside any tenant's backend. Generalizes the existing rutba.pk
Docker-Compose + Caddy deployment into a fleet.

## 1.1 Tenant registry (data model)

- [ ] `tenant`: slug, display name, status (`provisioning|active|suspended|offboarding`),
      plan, resource tier, db_name, backend kind (`strapi|core`) + pinned image/version,
      media namespace, created/suspended dates, owner contacts.
- [ ] `tenant_domain`: hostname, kind (`subdomain|custom`), verified, tls state. Default
      grant: `<slug>.<fleet-domain>` wildcard subdomains; custom domains verified via DNS
      TXT before Caddy serves them.
- [ ] `tenant_secret`: APP_KEYS, JWT secret, admin JWT secret, API tokens, media-server
      credentials — generated at provision time, stored encrypted, never reused across
      tenants.
- [ ] `tenant_event`: audit log of provision/upgrade/backup/suspend actions.

## 1.2 Provisioning pipeline

Target: `provision <slug>` → tenant live in < 5 minutes, no manual step. Implemented as
an idempotent step-runner (each step records completion in `tenant_event`; re-run
resumes).

- [ ] **Step 1 — DB**: `CREATE DATABASE tenant_<slug>` on the shared **MySQL 8** server
      (`docker-compose.yml` runs `mysql:8.0`; `POS_STRAPI__DATABASE_CLIENT=mysql`);
      create a dedicated user granted only on that schema. In MySQL a database *is* a
      schema, so ground rule 4's database-per-tenant boundary and the least-privilege
      grant boundary are one and the same.
- [ ] **Step 2 — Secrets**: generate the `tenant_secret` set; render the tenant's env
      file. Gotcha: env layering — tenant containers must get an explicit, complete env
      (the workspace-root `.env` override behavior that bites dev must not exist in the
      fleet path; container env is the only source).
- [ ] **Step 3 — Schema**: for a Strapi backend, boot the container once and let
      auto-sync create the schema. For a core backend, run the SQL migration chain. Both
      paths end with the same schema version stamp.
- [ ] **Step 4 — Seed**: run the seeding registry's essential/reference seeds
      (`strapi-seed` one-shot / core equivalent) — this is the existing seeding control
      system doing its intended job. Tenant-specific copy stays out per the
      generic-vs-tenant data rule; onboarding data (branding, branches, opening stock)
      arrives later via admin import.
- [ ] **Step 5 — Media**: create the tenant namespace on Rutba-Media-FileServer
      (public/private prefixes) and register its credentials.
- [ ] **Step 6 — Routing**: render the tenant's Caddy site block from the registry
      (hostname → tenant backend upstream; keep the `uri replace "//" "/"` normalization)
      and reload Caddy. Use on-demand TLS keyed to a registry lookup endpoint so
      unknown hostnames never get certificates.
- [ ] **Step 7 — Launch**: render the tenant's compose file (or systemd unit) from a
      versioned template: backend container + nothing else (MySQL, Caddy, media,
      frontends are shared). Start, health-check, flip status to `active`.
- [ ] **Step 8 — Verify**: run the contract suite's smoke subset against the new tenant.

## 1.3 Console UI + API

- [ ] Minimal UI (same stack as other rutba-* apps): tenant list, provision form, status,
      per-tenant actions (suspend/resume, backup now, upgrade, open logs), event feed.
- [ ] Console auth: operators only (this is Rutba-the-company's tool, not a tenant app);
      do not wire it into the tenant role-switcher ecosystem.

## 5.x Fleet ops (Phase 5)

- [ ] **Upgrade rings**: ring 0 = rutba.pk (own shop as permanent canary), ring 1 = a few
      consenting tenants, ring 2 = rest. `upgrade <tenant> --to <version>` = pull image,
      run migrations, restart, contract-smoke; ring commands batch it. Per-tenant version
      pinning means a bad release never auto-propagates.
- [ ] **Backups**: nightly `mysqldump --single-transaction` per tenant DB (InnoDB, so
      that gives a consistent snapshot without locking the tenant out) + media-namespace
      snapshot, shipped off-box; retention policy per plan; `restore <tenant> <backup>`
      command; quarterly restore drill on a scratch tenant.
- [ ] **Monitoring**: per-tenant health endpoint scraped by the console; RSS/CPU/disk per
      container; p95 per tenant; alert on boot-loop, migration failure, cert issuance
      failure. Roll up into one fleet dashboard.
- [ ] **Suspension/offboarding**: suspend = Caddy routes hostname to a static "account
      suspended" page, container stopped, data retained; offboard = final backup handed
      to customer (mysqldump + media export), then teardown after retention window.
- [ ] **Quotas** (later): per-plan limits (storage, users, orders/mo) measured from the
      tenant DB, surfaced in console, enforced softly first.

## Billing (later phase, separate spec)

Plans, metering, invoices (dogfood: bill tenants through a Rutba instance), dunning →
suspension flow. Aligns with the market-strategy P1 (FBR + payments) work.

**Exit criteria (Phase 1)**: two real tenants (rutba.pk migrated under the control plane
+ one demo tenant provisioned from scratch) running side by side on one box, provisioned,
routed, backed up, and upgraded only through rutba-console.
