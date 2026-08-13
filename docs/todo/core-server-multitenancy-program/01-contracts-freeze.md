# Phase 0 — Contracts freeze + golden contract tests

<!-- verify-docs: planned docs/contracts/ scripts/contract-tests/ -->
<!-- The frozen contract corpus and its test harness are what this tranche creates. -->

Everything downstream (tenant provisioning, backend swap) depends on the wire contract
and DB contract being written down and mechanically verifiable. Today they live in code
and in heads.

## 0.1 Document the wire contract

One markdown per concern under `docs/contracts/` (checked in, versioned):

- [ ] **Request envelope**: `Authorization: Bearer <UP JWT>`, `X-Rutba-App`,
      `X-Rutba-App-Role`, API-token requests (marketplace worker) and how api-pro skips
      them, guest access (`auth: false` + manual token parse + `requireAppRole`).
- [ ] **Response envelope**: Strapi 5 shapes the frontends actually consume —
      `{ data, meta.pagination }` for lists, `documentId` identity, populated relation
      shape, component shape, media shape, error body shape (status/name/message/details).
      Capture real samples, not the Strapi docs' idealized ones.
- [ ] **Descriptor semantics**: verb whitelist, `method:` requirement, `scope` per
      method, custom-action = handler-name rule, `$user.*` policy tokens, ownership via
      `owners`, `/me/permissions` response shape. Most of this exists in scattered docs —
      consolidate.
- [ ] **Pagination/filter/sort dialect** as used by the 18 apps: enumerate actual
      operators in use (grep generated clients + descriptors), so the shim implements the
      used subset first, not all of Strapi's dialect.
- [ ] **DB contract**: table/column naming rules (snake_case, `_lnk` join tables,
      `document_id`, `published_at`, `created_by_id`), the tables downstream apps read
      directly (from the pos-strapi integration contracts memory/doc).

## 0.2 Golden contract test suite

Extend the `probe-auth-gates.js` approach into a general harness:

- [ ] `scripts/contract-tests/` — a runner that takes a base URL + seeded snapshot DB
      and executes a per-module YAML/JS list of requests (auth matrix × representative
      CRUD × populate-heavy reads × custom actions), snapshotting normalized responses.
- [ ] Normalizer: strip volatile fields (timestamps, ids where unstable), sort arrays
      deterministically.
- [ ] Modes: **record** (against pos-strapi, produces golden files) and **verify**
      (against any base URL, diffs). `verify` against rutba-core is the per-module
      migration gate; `verify` against a freshly provisioned tenant is the provisioning
      acceptance gate.
- [ ] Seed a dedicated **contract-fixture dataset** via the seeding registry (small,
      deterministic, covers relations/components/draft-publish/divisible stock).
- [ ] Wire into CI (or at minimum a pre-flip checklist command).

## 0.3 Baseline metrics

- [ ] Log and record: pos-strapi boot time, RSS after warm-up, p95 latency on the top ~20
      routes (enable request-duration logging), per-cron runtime. These are the numbers
      that later prove the core server's win and catch fleet regressions.

**Exit criteria**: contracts docs merged; contract suite green in record→verify
round-trip against the same pos-strapi instance; baseline numbers recorded.
