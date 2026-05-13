---
name: feedback-strict-rollout-no-warn-phase
description: "When adding validators, codegen enforcement, or architectural cutovers in this monorepo, ship as hard-fail from day one — no warn-only grace period and no two-surface cohabitation"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: fcd105ef-dfd6-48f9-a4bd-3519a8356db4
---

When introducing a new validator, codegen check, lint rule, or architectural cutover (e.g. wire-protocol redesign, naming convention enforcement, contract change), do **not** propose a warn-only phase or a parallel-surface migration period. The user wants strict enforcement from the moment the rule lands.

**Why:** User said "the rollout has to be strict no mercy" in the context of the api-provider → named-query-policy redesign. The project's posture has been consistent on this elsewhere — `strapi-api-pro` replaced AGP via salvage-and-rewrite ([[project_strapi_api_pro_scope]]), not gradual migration. Soft rollouts produce permanent half-migrated state, drift, and ambiguity about which surface is canonical. Strict cutover forces the work to actually finish.

**How to apply:**
- Validators / CI gates: land as **hard fail** from day one. Fix all existing drift *before* the validator merges, not after. No `--warn` flag, no soft phase.
- Architectural cutovers (e.g. replacing client-builds-URL with server-side named policies): every entity migration is a single red-to-green PR — rename + descriptor + call-site sweep + server-side registration + deletion of the legacy code path. No feature flags, no two-surface cohabitation, no "we'll clean up the old path later."
- Rename sweeps: all consumers updated in the same PR (or stacked PRs gated by the validator). Nothing half-migrated on `main`.
- Sequencing tip when proposing plans: structure the work as **long-lived branch / stacked PRs where the validator gates merge**, not as a phased production rollout. The user will accept "this is a multi-week branch" over "let's land a soft version first."
- Exception worth flagging up front: if a piece of behavior is genuinely behind external coordination (production traffic flip, third-party dependency), call that out explicitly — the strict-rollout rule applies to internal codebase changes the user controls.

Related: [[project_strapi_api_pro_scope]] (salvage-and-rewrite posture), [[feedback_generated_code_verbosity]].
