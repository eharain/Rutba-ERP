<!-- verify-docs: runtime -->
# docs/todo — what is live, and what is reference

Every document here is either **work someone still has to do** or **a decision worth not
relitigating**. Anything that was purely an implementation plan for shipped work has been deleted —
git history has it, and a folder of finished plans buries the three files that actually matter.

**Start here:** [erp2-program/](erp2-program/README.md) §3a. It carries the current standing, the
reworked phase order, and the one item blocking everything else.

---

## The active program

| | |
|---|---|
| [erp2-program/](erp2-program/README.md) | **The umbrella.** Strapi → core migration, cells, tenancy. §3a is the live sequence; §8 of [03-repo-restructure.md](erp2-program/03-repo-restructure.md) is the nine findings the restructure cost. |
| [erp2-program/03a-deploy-runbook.md](erp2-program/03a-deploy-runbook.md) | **Blocking.** The deploy boxes still hold the old env prefixes and unit names. **§0 runs before Strapi is ever started on a box** — skipping it is what dropped the api-pro tables locally. |
| [erp2-program/04-baseline-metrics.md](erp2-program/04-baseline-metrics.md) | The measured core-vs-Strapi comparison. Regenerate with `npm run baseline`; diff the `.json`, not the table. |
| [core-server-multitenancy-program/](core-server-multitenancy-program/README.md) | The strangler's own program folder — tranche detail the umbrella summarises. |

## Product roadmap

- [ROADMAP.md](ROADMAP.md) — the four horizons. H0 is the beachhead gate.
- [market-strategy/](market-strategy/README.md) · [rightapp-gap-analysis/](rightapp-gap-analysis/README.md) — why the roadmap is shaped that way.
- [fiscalization-multi-region.md](fiscalization-multi-region.md) — **plan, nothing scheduled.** Its one demand on ROADMAP 0.1 is negative: do not hardcode Pakistan.

## Module programs with open work

- [inventory-manufacturing-program/](inventory-manufacturing-program/00-overview-and-roadmap.md) · [helpdesk-program/](helpdesk-program/00-overview-and-roadmap.md) · [email-program/](email-program/00-overview-and-roadmap.md) · [admin-console-program/](admin-console-program/README.md)
- [offline-desktop-program/](offline-desktop-program/README.md) + [offline-pos-options.md](offline-pos-options.md) — own track; shares P1's schema baseline and sync engine.
- [cms-sync/](cms-sync/README.md) — gaps the P1 sync engine must close.
- [order-lifecycle-plan.md](order-lifecycle-plan.md) · [contact-entity-unification.md](contact-entity-unification.md) · [storefront-launch-backlog.md](storefront-launch-backlog.md) · [campaigns-implementation.md](campaigns-implementation.md) · [hr-org-chart-and-reporting-line.md](hr-org-chart-and-reporting-line.md) · [site-settings-multi-tenant.md](site-settings-multi-tenant.md)
- [google-shopping-integration.md](google-shopping-integration.md) · [rutba-instance-fulfillment-and-conversation-sync.md](rutba-instance-fulfillment-and-conversation-sync.md) — specs, nothing built.
- [video-studio-v5-rail-plan.md](video-studio-v5-rail-plan.md) — the only video-studio doc still open; the built ones were removed. Work lands in the **Rutba-Social-Poster** repo, not this one.

## Standing conventions — read before changing the shape of things

- [project_api_provider_named_policy_architecture.md](project_api_provider_named_policy_architecture.md) — has a status block that supersedes its own narrative.
- [project_api_provider_wire_codec.md](project_api_provider_wire_codec.md) — deliberately sequenced **after** Strapi retirement.
- [feedback_strict_rollout_no_warn_phase.md](feedback_strict_rollout_no_warn_phase.md) — red-to-green sweeps, no warn phase. Bake windows are the one declared exception.
- [feedback_generated_code_verbosity.md](feedback_generated_code_verbosity.md) · [seeding-roadmap.md](seeding-roadmap.md) · [api-pro-descriptor-whitelist-gap.md](api-pro-descriptor-whitelist-gap.md) · [restore-safety-sync-quarantine.md](restore-safety-sync-quarantine.md)
- [tech-debt-cleanup.md](tech-debt-cleanup.md) — the running list. [accounting-completion-spec.md](accounting-completion-spec.md) records what the 0.4 audit actually found.

---

**Keeping this honest:** `npm run verify:docs` fails on a link to a file that does not exist, so
deleting a doc means fixing its referrers in the same commit. When a plan ships, delete it rather
than leaving a `✅ done` header — the status line at the top of a finished plan is the thing that
makes the next reader waste ten minutes.
