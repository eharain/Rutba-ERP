# api-pro descriptor whitelist drops real endpoints

## The failure mode

`isDescriptorMethodName` in `packages/strapi-api-pro/server/src/services/seeder.js`
pre-filters descriptor members by a **name prefix** before the seeder ever looks
at what the method returns. A descriptor method whose name does not start with a
listed verb is skipped silently: no `api_pro_interface_methods` row, therefore no
policy, therefore `403 no policy for role '<role>' on <uid>.<action>` forever.

Nothing reports it. It looks like a permission problem at runtime and like
nothing at all at seed time — the seed log's method count is simply lower than
it should be.

`submit` was added to the whitelist (2026-08-06) because it left the appraisal
self-assessment and manager-review endpoints — the ones carrying the
per-competency ratings — permanently unreachable. **The rest of this list is
still outstanding.**

## Why a prefix list is the wrong shape

The pre-filter is redundant. The loop that follows already invokes each method
and drops anything that is not an object carrying a `path`, that has no
resolvable uid, no action, or no grants. Those structural checks are what
actually distinguish an endpoint from a helper — and they do it correctly:
`media-utils.isImage` returns a boolean, `stock-helpers.relationConnects`
returns an object with no `path`, async savers are excluded outright. A scan of
the full descriptor set found the structural checks correctly rejecting all 27
non-endpoint members with no help from the name list.

So the name check contributes nothing except false negatives, and every new verb
someone invents (`enroll`, `dispatch`, `instantiate`, …) silently breaks another
endpoint. It should be deleted rather than extended. That is a broader
access-control change than the `submit` fix, so it wants a deliberate review.

## What is still unreachable

api-pro policies are keyed on `(uid, action)`, not on the descriptor method
name, so a dropped method only breaks something when no *whitelisted* sibling in
the same descriptor already produces the same `(uid, action)`. That is why POS
kept working: `payments.postCreate` is dropped, but `payments.create` covers
`(api::payment.payment, create)`.

Filtering for genuinely-uncovered pairs leaves **28**, of which these carry a
distinct explicit action and no covering sibling:

| Endpoint | Action | Descriptor |
| --- | --- | --- |
| `POST /hr-asset-assignments/:id/return` | `returnAsset` | `hr-asset-assignments.js:returnAsset` |
| `POST /hr-expense-claims/:id/reimburse` | `reimburse` | `hr-expense-claims.js:reimburse` |
| `POST /hr-generated-documents/generate` | `generateDocument` | `hr-generated-documents.js:generate` |
| `POST /hr-incident-reports/report` | `reportIncident` | `hr-incident-reports.js:report` |
| `POST /hr-training-enrollments/enroll` | `enrollMe` | `hr-training-enrollments.js:enroll` |
| `POST /hr-training-enrollments/:id/complete` | `markComplete` | `hr-training-enrollments.js:complete` |
| `POST /pay-advances/request` | `requestAdvance` | `pay-advances.js:request` |
| `POST /pay-loans/request` | `requestLoan` | `pay-loans.js:request` |
| `POST /sale-orders/:id/attach-stock-item` | `attachStockItem` | `sale-orders.js:attachStockItem` |
| `POST /sale-orders/:id/attach-divisible` | `attachDivisible` | `sale-orders.js:attachDivisible` |
| `POST /sale-orders/:id/verify-payment` | `verifyPayment` | `sale-orders.js:verifyPayment` |
| `POST /sale-orders/:id/request-cost-change-ack` | `requestCostChangeAck` | `sale-orders.js:requestCostChangeAck` |
| `POST /sale-orders/:id/override-cost-change-ack` | `overrideCostChangeAck` | `sale-orders.js:overrideCostChangeAck` |
| `PUT /sale-items/:id` | `disconnect` | `sale-items.js:disconnect` |
| `PUT /sales/:id` | `saveNotes` | `sales.js:saveNotes` |
| `POST /site-setting/discard` | `discard` | `site-setting.js:discardResolved` |
| `POST /mfg-production-templates/:id/instantiate` | `instantiate` | `mfg-production-templates.js:instantiate` |
| `POST /media-library/upload` | `uploadToFolder`, `uploadFile` | `media-library.js` |
| `POST /media-library/files/move` | `moveFiles` | `media-library.js:moveFiles` |
| `PUT /media-library/folders/:id` | `renameFolder` | `media-library.js:renameFolder` |

Verify each against a running server before acting — some may be dead client
helpers, and `enums.js:values` appears in the raw scan only because its uid is
path-inferred rather than declared, so treat inferred-uid rows as unconfirmed.

## Second, independent gate

Seeding an api-pro policy is not sufficient. UP route permissions are
per-action, so each custom action also needs an entry in `CUSTOM_ACTIONS` in
`pos-strapi/src/seed/up-permissions-seed.js` or it still answers 403. The whole
phase 10–14 HRMS surface (goals, training, grievances, incidents, compliance,
generated documents, rosters, benefit enrolments, assets, bonuses, loans,
advances, expense claims and the eight self-owned ESS entities) is missing from
that map.

## Reproducing the scan

Walk `packages/api-provider/api/*.js`, mirror the seeder's structural checks
(invoke argless → require `path` → resolve uid → resolve action → require
grants), and report members that pass them but fail `isDescriptorMethodName`.
Group by `(uid, action)` and subtract the pairs a whitelisted sibling already
covers.

## After changing the whitelist

The plugin loads from its bundle (`package.json` `main` → `./dist/server/index.js`),
so `npm run build` in `packages/strapi-api-pro` is required — editing
`server/src` alone changes nothing. Then reseed from the repo root:

```
npm run seed -- --only=api-provider,up-permissions
```

The `api-provider` entry takes ~5 minutes and rewrites the whole policy table.
