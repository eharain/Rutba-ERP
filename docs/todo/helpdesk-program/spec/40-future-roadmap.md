# 40 — Future Roadmap

[← 39 Mobile Requirements](39-mobile-requirements.md) · [Index](00-index.md)

---

## 40.1 Purpose

What comes after the module works — and, as importantly, what is deliberately deferred and why.

## 40.2 Position on the master roadmap

The [master roadmap](../../ROADMAP.md) sequences the ERP across four horizons. Helpdesk is not
currently on it. Where it belongs:

| Horizon | Fit | Argument |
|---|---|---|
| **H0 — Finish & comply** | Partial | The module closes a real operational gap: today a storefront contact form has no thread, and employee requests have no queue, SLA or owner. That is an *operational completeness* item for tenant #1 |
| **H1 — Parity & channels** | **Best fit** | A service desk is table stakes at the 2025-26 SME-ERP bar, and it rides the same WhatsApp and email channel work H1 already schedules |
| **H2 — Productize** | Enabler | Every SaaS competitor ships a desk; and the configurability contract (§32) is exactly the self-serve onboarding capability H2 gates on |
| **H3 — Differentiate** | Where it wins | Cross-module intelligence and the AI copilot ground on the ticket corpus |

**Recommendation:** place the module in **H1**, with the W0 platform prerequisites (event bus,
workflow promotion, migrations) pulled into **H0** — because those three are platform
capabilities several other modules need, and building them for Helpdesk alone undersells them.

Placement is the user's call; this section states the case, it does not edit the roadmap.

## 40.3 Near-term (post-launch, 0–6 months)

| # | Item | Value | Depends on |
|---|---|---|---|
| N1 | **Remote support** — device inventory → consented remote control | Closes IT support end to end | [epic-5](../epic-5-remote-support.md) |
| N2 | **WhatsApp channel** | Where PK customers actually are | H1 WhatsApp work |
| N3 | **Inbound email** | The default B2B channel | MTA ingress |
| N4 | **CSAT maturity** — NPS, follow-up surveys, trend by agent | Quality signal | §16 |
| N5 | **Customer-facing SLA display** for contract customers | Paid-support differentiator | §12 |
| N6 | **Ticket templates library** per vertical | Faster onboarding | §32 |
| N7 | **Agent performance coaching view** — quality alongside volume | Retention and fairness | §19 |

## 40.4 Medium-term (6–18 months)

| # | Item | Value |
|---|---|---|
| M1 | **AI copilot** — grounded drafting, summarisation, next-best-action, all human-gated | The largest agent productivity lever, and the reason to accumulate a clean ticket corpus now |
| M2 | **Predictive SLA** — warn before breach from historical patterns, not just at 80% of the clock | Turns SLA from reactive to preventive |
| M3 | **Cross-module intelligence** — "eleven tickets this month name the same product batch" raises a quality investigation | The capability no standalone helpdesk can offer, and the clearest proof the desk belongs inside the ERP |
| M4 | **Low-code automation builder** — visual rules for non-technical admins | Self-serve configuration, H2 gate |
| M5 | **Customer communities / public Q&A** | Deflection at scale; only worth it at volume |
| M6 | **Voice / call logging** — log calls against tickets, optional transcription | Phone is still a major PK channel |
| M7 | **Field-service dispatch** — scheduling and technician routing | Explicitly out of scope at launch (§01.4); revisit if the Field Service desk proves demand |
| M8 | **Contract & entitlement management** — support contracts, entitlement checks, billable support | Monetises support |
| M9 | **Multi-language KB with AI translation** | Reach |
| M10 | **Workflow marketplace** — shareable desk configurations | Rides the H3 app-marketplace work |

## 40.5 Long-term (18 months+)

| # | Item |
|---|---|
| L1 | **Agentic resolution** — AI resolves narrow, well-bounded, low-risk categories end to end, with a human-reviewable audit trail and a hard blast radius. Only after M1 has years of measured accuracy |
| L2 | **IoT / device alerts** — equipment raises its own tickets; a natural extension of §13's event-to-ticket mechanism into hardware |
| L3 | **Predictive support** — contact the customer before they contact you, from delivery and quality signals |
| L4 | **Sentiment-driven routing and retention triggers** into CRM |
| L5 | **Support-as-a-differentiator analytics** — link CSAT to repeat purchase and lifetime value |

## 40.6 Deliberately not planned

Stated so that nobody re-proposes them without a new argument:

| Not doing | Why |
|---|---|
| **Absorbing `order-message`** | Order-scoped conversation with two-way peer sync is a working, distinct concern. Helpdesk surfaces it; merging them would take on the sync complexity for no user benefit |
| **A second identity system** | api-pro owns roles and claims. A helpdesk-local user model would fragment authorization |
| **A second content system for public help** | The CMS already owns public pages, menus and SEO (§11.2) |
| **Full ITIL** (CMDB, change advisory, release management) | Incident and request management fit SME reality; the rest is enterprise ceremony that would slow every desk |
| **Telephony / PBX** | Phone is a recordable source, not a product to build |
| **Full offline ticketing** | Conflict resolution on a concurrently-edited aggregate is a subsystem, not a feature (§39.7) |
| **Autonomous approval by AI** | An approval is a human accountability record. A machine-made one is not an approval |

## 40.7 Success gates

Do not start the next tier until the current one is demonstrated.

| Gate | Criteria |
|---|---|
| **Launch → Near-term** | 90 days live · ≥3 desks in use · SLA compliance ≥85% · agents prefer it to the old pages |
| **Near-term → Medium** | ≥2 channels beyond web · CSAT ≥4.0 with ≥20% response rate · auto-assignment ≥70% |
| **Medium → Long** | AI draft acceptance ≥50% · ≥3 tenants live · deflection ≥20% |
| **Any tier → Agentic (L1)** | Measured accuracy over a sustained period, a hard blast radius, and a reviewable audit trail — not a demo |

## 40.8 The one thing to protect

Every item above depends on the same foundation: **a complete, honest, well-structured record of
what was asked, what was done, and how long it took.**

The AI copilot is only as good as the ticket corpus. Predictive SLA needs accurate business-time
measurement. Cross-module intelligence needs the subject links to be real. Reports are only worth
reading if the measurement rules held.

So the priority order when trading off scope is: **data integrity first, then the agent
experience, then automation, then intelligence.** A fast desk built on sloppy data produces
confident wrong answers at scale — which is worse than the manual process it replaced.

---

## Acceptance criteria for this section

- [ ] Roadmap placement agreed and the master roadmap updated (owner's decision).
- [ ] W0 platform prerequisites scheduled independently of Helpdesk's own timeline.
- [ ] Success gates agreed with measurable definitions before launch.
- [ ] "Deliberately not planned" reviewed and accepted, so it is a decision rather than an
      omission.
