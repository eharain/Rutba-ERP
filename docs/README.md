# Rutba ERP — documentation

<!-- verify-docs: removed docs/SHOP-PAGE-REDESIGN-PLAN.md -->
<!-- That path is cited below as the example of a dead reference. Backticking it
     is what makes verify-docs check it — which is the point being made, and also
     why it needs this directive to stop the example failing the run. -->

Two kinds of document live under `docs/`, and mixing them up is what makes a
documentation tree stop being trusted:

- **`docs/`** — what the product **is**. Reference for someone using, operating or
  extending a module that exists today.
- **[`docs/todo/`](todo/README.md)** — what someone has **decided** or still has to
  **do**. Programs, specs and design records. Its own README is the index, and its
  rule is that a plan gets deleted when it ships rather than left with a `✅ done`
  header.

If you are looking for current standing rather than reference, start at
[`todo/erp2-program/README.md`](todo/erp2-program/README.md) §3a.

---

## Start here

| | |
|---|---|
| [modules.md](modules.md) | **Every module in the estate** — port, workspace, licence key, authorization domain and roles. Generated from the three registries (`npm run docs:modules`), so it cannot drift from them. |
| [../README.md](../README.md) | Repo overview, architecture sketch, quick start. |
| [DEPLOYMENT.md](DEPLOYMENT.md) | The full deployment guide — systemd estate, build/swap, rollback. |
| [portal-alignment.md](portal-alignment.md) | How this repo lines up with the rutba.io platform: workstreams E1–E6, the frozen entitlement keys, and what the portal owns rather than this repo. |

## Operating

- [DEPLOYMENT.md](DEPLOYMENT.md) — deploy, roll back, manage services.
- [BUILD-DEPLOYMENT-SETUP-TEMPLATE.md](BUILD-DEPLOYMENT-SETUP-TEMPLATE.md) — the per-app
  build template used when adding a unit to the estate.
- [pre-deployment-test-plan.md](pre-deployment-test-plan.md) — the Tier 1–5 test plan.
  Copy it per release into `docs/test-runs/YYYY-MM-DD-<release>.md`; those copies are
  frozen audit trails and are marked `verify-docs: historical` so nobody "updates"
  them into uselessness.
- [upgrade-to-latest-stack.md](upgrade-to-latest-stack.md) — dependency/stack upgrade notes.

## Architecture and design

- [accounting-architecture.md](accounting-architecture.md) — the ledger: chart of
  accounts, posting rules, the account-mapping indirection. Paired with
  [todo/accounting-completion-spec.md](todo/accounting-completion-spec.md), which records
  what the 0.4 audit actually found.
- [rutba-notification-system-design.md](rutba-notification-system-design.md) —
  template-driven notifications.

## Features

Per-feature reference for behaviour that is not obvious from the module list.

- [features/divisible-stock.md](features/divisible-stock.md) — selling one physical item
  as many sellable sub-units (a tablet box, a lace roll): allocation/release, FEFO, and
  the POS wiring on both sale surfaces.
- [features/rutba-instance-marketplace.md](features/rutba-instance-marketplace.md) — an
  instance acting as a marketplace for other instances.

## Keeping this true

Three checks, and each fails rather than warns:

```bash
npm run verify:docs      # links, cited paths, line numbers, ports, commit SHAs
npm run verify:wiring    # every service agrees with config/apps.manifest.json
npm run verify:modules   # docs/modules.md matches the registries it is generated from
```

`verify:docs` has one known blind spot worth knowing about: it checks markdown links
and backticked paths, but **not a bare path written in prose**. That is how
`docs/SHOP-PAGE-REDESIGN-PLAN.md` sat in the root README long after the file was gone.
Checking bare paths was tried and rejected — docs legitimately cite files that do not
exist yet, and a validator that reports intentions as failures is one people switch
off. Write a path as a link or in backticks and it gets checked.
