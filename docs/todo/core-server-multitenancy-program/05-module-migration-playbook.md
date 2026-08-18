# Phases 4 & 6 — Module migration playbook (strangler)

## Tranche order

Ordered by blast radius and side-effect coupling; each tranche must be independently
revertible by flipping Caddy routes back.

| Tranche | Modules | Why this order |
|---|---|---|
| 1 | **mfg-\*** (+ production templates, worker profiles) | Newest code, already document-middleware-based, self-contained ledgers, low external traffic. The playbook validator. |
| 2 | hr-\*, ess, pay-\* (payroll engine is still a stub — cheap to move) | Self-contained; exercises workflow engine + approvals in core. |
| 3 | crm-\*, person/address/contact cluster | Read-heavy, exercises dedup/merge endpoints and `owners` ownership deeply. |
| 4 | inventory extras: reorder policies, stock alerts, expiry sweeps (crons!) | First cron migration; stock-item core stays in Strapi until tranche 7. |
| 5 | cms-\*, menus, page-groups, site-settings, social | Draft/publish decision lands here (implement subset or flatten to published-only). Storefront reads flip here — highest-traffic reads, still low write risk. |
| 6 | marketplace, notifications, media library metadata | API-token request path + webhook/cron surfaces. |
| 7 | **sale + stock-item + payment + cash-register + order-management + acc-\*** | The chokepoint cluster: `executeTransition`, stock invariant, divisible stock allocate/release, GL posting, COD collection. Moves **as one tranche** so no cross-server write seam ever exists inside it. |
| 8 | auth/UP issuance, users, roles (Phase 7 endgame) | Last, per the issuer rule. |

Cross-tranche seam rule: a module may **read** entities owned by the other server freely
(same DB). It may **write** them only via the owning server's HTTP API (rare; enumerate
per tranche) or by waiting for tranche 7. Example: until tranche 7, anything that posts
GL stays in Strapi because sale lives there.

## Per-module checklist (repeat for every tranche)

1. [ ] **Inventory**: list the module's descriptors, routes, controllers, services,
       lifecycles, crons, and every cross-module call in/out (grep `api::<module>`
       across `src/api`). Output: a one-page migration sheet in this folder.
2. [ ] **Record goldens**: contract suite `record` for the module against services/strapi on
       the fixture DB (full auth matrix × routes).
3. [ ] **Port**: copy controllers/services into services/core; swap `strapi.documents`/
       `db.query` to the shim (mostly mechanical); port lifecycles onto the document-
       middleware hook or inline them; port cron entries; register routes from the same
       descriptors.
4. [ ] **Verify offline**: contract suite `verify` against services/core on a snapshot
       copy of the DB → deep-equal. Fix shim gaps found here (they feed 3.3's tests).
5. [ ] **Schema handover**: generate the module's baseline SQL migration (current DDL
       as migration 0); from now on schema changes for this module are SQL migrations.
       Strapi keeps the schema.json (never delete it — destructive auto-sync risk);
       lint rule/CI check that migrated modules' schema.json files stay frozen.
6. [ ] **Flip**: Caddy routes the module's path prefixes to services/core (tenant-by-
       tenant, canary ring first). Strapi's copies of those routes get a guard that
       503s if hit (catches routing mistakes loudly).
7. [ ] **Bake**: 1–2 weeks with error-rate/latency comparison vs baseline; revert =
       route flip back (schema unchanged, so revert is safe within the bake window —
       hold module schema changes until bake ends).
8. [ ] **Delete**: remove the module's controllers/services/lifecycles from services/strapi
       (schema.json stays). Update the module's migration sheet to "done".

## Phase 4 exit criteria (first module = playbook proof)

- mfg tranche live on services/core for rutba.pk + demo tenant, contract-clean, one bake
  cycle completed, and the playbook doc amended with everything that surprised you.
  Only then schedule tranche 2 — the first module sets the real per-module cost, which
  sizes the rest of the program honestly.

## Standing decisions to make along the way (record in this folder)

- [ ] D&P: implement subset vs flatten CMS to published-only (tranche 5 gate).
- [ ] Strapi admin panel: anything still used monthly? If yes, list it — each item needs
      a home in a rutba app before tranche 7 (the CRM/CMS consolidation rule already
      points there).
- [ ] `entityService` call sites (71, legacy): migrate to shim-`documents` during their
      module's port — do not build an entityService shim.
- [ ] Naming: retire "services/strapi" from integration docs in favor of "tenant backend" so
      contracts stop implying the implementation.
