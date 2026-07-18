# Rutba ERP — Master Roadmap

_Date: 2026-07-10. Consolidates [market-strategy](./market-strategy/README.md) (P1–P4) and the [RightApp gap analysis](./rightapp-gap-analysis/README.md) app builds into one sequenced plan._

**North Star:** rutba.pk is tenant #1 → make it **operationally complete** → make Rutba **sellable in Pakistan** → **productize as multi-tenant SaaS** → **differentiate & scale** as a globally-sellable SME commerce ERP.

> **On dates:** horizons are labelled with indicative quarters assuming a small focused team. They express **sequence and dependency**, not commitments — recalibrate the calendar to actual capacity. The _order_ is the load-bearing part.

---

## The four horizons at a glance

| Horizon | Theme | Window (indicative) | Exit gate |
|---|---|---|---|
| **H0 — Finish & comply** | rutba.pk solid + legally sellable in PK | Q3 2026 (now) | rutba.pk runs end-to-end on Rutba with FBR-compliant invoices & digital payments |
| **H1 — Parity & channels** | Match the 2025-26 SME-ERP bar | Q4 2026 – Q1 2027 | AI copilot + analytics live; owned marketing (WhatsApp + email) live |
| **H2 — Productize** | Turn the tool into a SaaS product | Q2 – Q3 2027 | A second tenant can self-serve sign up, onboard, and pay |
| **H3 — Differentiate & scale** | Win the white space | Q4 2027+ | Vertical packs + app marketplace + B2B; reseller/white-label ready |

**Tracks (parallel workstreams that run across horizons):**
`①Compliance&Payments` · `②Commerce&Ops` · `③Intelligence (AI+BI)` · `④Platform (SaaS)` · `⑤Growth modules`

---

## Swimlane timeline

```
                H0 (Q3'26)         H1 (Q4'26–Q1'27)      H2 (Q2–Q3'27)         H3 (Q4'27+)
①Compliance     FBR e-invoicing    ── localize tax ──►   pluggable tax/       multi-country
 &Payments      Raast/JazzCash/                          payments per tenant   tax packs, BNPL
                Easypaisa, offline
                POS
②Commerce       finish acct posting WhatsApp commerce    ── B2B foundations   B2B/wholesale,
 &Ops           + payroll engine    (order/notify)                             commerce⇄mfg unify,
                                                                               vertical packs
③Intelligence   —                   AI copilot MVP +      agentic actions      forecasting,
 (AI+BI)                            analytics/BI          (reorder/reconcile)   fin-exception AI
④Platform       (design tenancy)    (tenancy spike)       multi-tenancy,        app marketplace,
 (SaaS)                                                   onboarding, billing,  per-tenant theming,
                                                          tenant admin          white-label
⑤Growth         CRM core buildout   rutba-campaigns,      +more channels/       PLM + SRM (apparel),
 modules        (timeline+segments) CRM pipeline,         regions, private      agent-commerce (MCP),
                                    Amazon+eBay           Drive/sharing         social/marketplace depth
                                    marketplace conn.
```

---

## H0 — Finish & comply _(now — the beachhead gate)_

Make tenant #1 credible and legal before selling anything. Half-built internals + the PK compliance ticket.

| # | Item | Track | Why now / gate | Depends on | Size |
|---|------|-------|----------------|-----------|------|
| 0.1 | **FBR Digital Invoicing** — PRAL API (DI v1.12), IRN + verifiable QR on every invoice, sandbox cert, 6-yr archive, 18% GST, offline buffer | ① | **Legally mandatory** (phased mandate completed 31 Dec 2025); can't invoice compliantly in PK without it | sale/sale-order posting | L |
| 0.2 | **Local digital payments** — Raast + JazzCash + Easypaisa + QR acceptance at POS/checkout | ① | 88–92% of PK retail is digital; merchant acceptance is the national gap; cuts COD returns | pos-sale, checkout | M |
| 0.3 | **Offline-first POS hardening** — graceful degrade + reconcile-on-reconnect | ① | Table stakes for every PK POS; intermittent connectivity is the norm | pos-sale | M |
| 0.4 | **Finish accounting posting wiring** — web/cash/purchase/payroll → GL | ② | Books must be trustworthy before Rutba is the system of record | acc-* (mostly built) | M |
| 0.5 | **Payroll engine** — replace the current stub with real calc (attendance→salary→payslip) | ② | rutba.pk payroll can't run on a stub; also a sell-side module | pay-*, hr-* | M |
| 0.6 | **CRM core buildout** — typed activity timeline + saved-segment engine (from CRM plan §5.1/5.3) | ⑤ | Highest-ROI additive work; feeds H1 campaigns | crm-* (exists) | M |

**H0 exit gate:** rutba.pk runs its full sell→fulfil→account cycle on Rutba, issuing FBR-compliant invoices and taking digital payments. _Now it's a real proving ground._

---

## H1 — Parity & channels _(match the 2025-26 bar; light up owned marketing)_

Close the gaps every competitor already fills (AI, analytics) and turn on the WhatsApp + email channels PK buyers expect.

| # | Item | Track | Why / gate | Depends on | Size |
|---|------|-------|-----------|-----------|------|
| 1.1 | **AI copilot MVP** — NL query over sales/inventory/finance; draft descriptions; smart reorder hints. Claude-first, model-agnostic layer, **AI included (not paywalled)**. Aim for automated **synthesis** (generate the report/plan), not just Q&A — the "AI-OS" frame (cf. KeychainOS) | ③ | Rutba ships zero AI while every rival ships copilots — the single biggest competitive gap | pos-strapi data, analytics (1.2) | L |
| 1.2 | **Analytics / BI layer** (`rutba-analytics`) — cross-module dashboards, replenishment forecast, financial-exception detection | ③ | No analytics app exists (RANALYTICS gap); also powers CRM dashboards & the copilot | Strapi data | L |
| 1.3 | **WhatsApp commerce** — catalog, order-taking, order/shipping notifications, post-sale funnels | ②/⑤ | Core South-Asia channel, not a side feature | notification svc, rutba-social | M |
| 1.4 | **`rutba-campaigns`** — email template studio + audiences + campaigns over Rutba-MTA | ⑤ | Rutba-MTA (send engine) already ported; this is the tenant UI | Rutba-MTA, CRM segments (0.6) | M |
| 1.5 | **CRM pipeline** — opportunity/deal/stage/kanban (net-new; RightApp only faked it) | ⑤ | Completes CRM to competitive standard | CRM core (0.6) | M |
| 1.6 | **Tracked email-on-activity** — CRM ↔ Rutba-MTA opens/clicks | ⑤ | Ties CRM + campaigns + analytics together | 1.2, 1.4 | S |
| 1.7 | **Marketplace connector framework + Amazon + eBay** — generalize the existing provider-adapter (Daraz done) into a channel-connector layer; add **Amazon SP-API** and **eBay Sell API**: listing/catalog sync, order ingest, inventory + price push, settlement reconciliation, per-account region config | ②/⑤ | Omnichannel selling is table stakes (Cin7/Shopify lead with it); multiplies reach per region and rides the multi-country/regional seeding layer already being built | rutba-marketplace + worker (exist), product catalog, marketplace-* CTs | L |

**H1 exit gate:** a demo of Rutba shows an AI copilot, live dashboards, and WhatsApp+email marketing — i.e. it no longer looks a generation behind Odoo/Zoho/Shopify.

---

## H2 — Productize _(the gate from "internal tool" to "product")_

rutba.pk works single-tenant; selling to tenant #2 needs the platform layer. This is the biggest architectural investment.

| # | Item | Track | Why / gate | Depends on | Size |
|---|------|-------|-----------|-----------|------|
| 2.1 | **Multi-tenancy** — org/tenant model + data isolation in pos-strapi (decide row-scope vs schema/db-per-tenant early) | ④ | Cannot serve a 2nd customer without it; reuses api-pro claim/role machinery | pos-strapi, api-pro | XL |
| 2.2 | **Self-serve onboarding** — signup → setup wizard (business type, branches, tax, import products/customers) → live in minutes | ④ | Time-to-value is where Rutba beats $40K-implementation incumbents | 2.1, bulk-import | M |
| 2.3 | **Subscription billing + metering** — plans, seats/branches, usage limits, invoicing, dunning | ④ | No revenue mechanism today | 2.1, payments (0.2) | L |
| 2.4 | **Tenant admin console** — org profile, users↔app entitlements, branches, tax/locale, branding | ④ | Tenants must self-administer | 2.1 | M |
| 2.5 | **Pluggable tax/payments/locale** — un-hard-code PK specifics so other markets drop in | ①/④ | Turns the PK moat into a reusable localization framework (GCC/Africa/SE-Asia) | 0.1, 0.2 | M |

**H2 exit gate:** an external business signs up, onboards itself, and pays — without the Rutba team touching their instance.

---

## H3 — Differentiate & scale _(win the wedge, enable resale)_

| # | Item | Track | Why | Depends on | Size |
|---|------|-------|-----|-----------|------|
| 3.1 | **Native commerce⇄manufacturing unification** — one ledger raw-material → production → stock → POS/online sale | ② | The seam Katana/Cin7/Fishbowl leave (they bolt onto Shopify/QuickBooks) — Rutba's genuine differentiator | mfg-*, stock-*, sale-* | L |
| 3.2 | **Vertical starter packs** — **apparel/tailoring = _the_ flagship** (go deep, don't spread thin — cf. Keychain's CPG-food depth), then grocery, pharmacy, restaurant | ② | Candela & Odoo sell by vertical edition; depth in one vertical beats breadth; cuts onboarding time; leverages the industry-onboarding-pack seeding | 2.2, seeding packs | M |
| 3.3 | **App / module marketplace + per-tenant theming** — installable catalog, white-label for resellers | ④ | Monetizes the breadth; enables reseller channel | 2.1, 2.4 | L |
| 3.4 | **B2B / wholesale** — company accounts, price lists, payment terms | ② | Shopify made B2B standard in 2026; Rutba has buy-side, extend to sell-side | 2.1 | M |
| 3.5 | **Agentic AI actions** — auto-reorder, auto-reconcile, month-end assist | ③ | Buyers now ask for an agentic roadmap (NetSuite/Shopify set the expectation) | 1.1, 1.2 | L |
| 3.6 | **Embedded finance / BNPL** — installments at checkout (KalPay/Alfa-style) | ① | Early-mover edge for higher-ticket apparel | 0.2 | M |
| 3.7 | **Private Drive + sharing** — user file storage + PIN/signed share links | ⑤ | RSTORAGE-style capability; build on Rutba-Media-FileServer's visibility primitives | Rutba-Media-FileServer | M |
| 3.8 | **Agent-facing commerce (MCP)** — catalog into ChatGPT/Perplexity/Copilot | ⑤ | Watch/keep catalog MCP-exportable; act when the channel matures | catalog | S (watch) |
| 3.9 | **PLM / product-development + SRM** — design→tech-pack/spec→sample→BOM→sourcing→launch lifecycle, upstream of production; supplier relationship management (discovery, scorecards, source-of-truth) beyond transactional purchase | ② | The upstream Rutba lacks (today = production execution only); a real differentiator for made-to-order **apparel** (cf. Keychain 360's private-label PLM); pull earlier if apparel is the flagship | mfg-*, purchase/supplier, product | L |
| 3.10 | **Channel & region expansion** — more marketplaces on the 1.7 framework (Shopify, WooCommerce, Walmart, Etsy) + **per-region Amazon marketplaces** (US/UK/EU/GCC…); per-tenant channel accounts | ②/⑤ | Turns the connector layer into a multi-region omnichannel selling story for the SaaS; rides the regional tax/shipping seeding layer | 1.7, 2.1 (multi-tenancy), regional seeding | M |

---

## If only three things get built next
1. **FBR compliance (0.1)** — can't sell in PK without it (and it's already legally due).
2. **AI copilot (1.1) + analytics (1.2)** — can't be credible in 2026 without it.
3. **Multi-tenancy (2.1)** — can't be a product without it.

Everything else sequences around these three spines.

---

## Sequencing rationale & risks
- **Why H0 before selling:** shipping a half-built payroll/GL or non-compliant invoices to a paying tenant is reputational risk; fix on your own operation first.
- **Why AI/analytics (H1) before multi-tenancy (H2):** parity features are smaller, demoable, and de-risk the value proposition before the expensive tenancy rebuild.
- **Multi-tenancy is the long pole (XL):** design it in H0/H1 (a spike) even though you build it in H2 — retrofitting isolation is far costlier than designing for it. Keep [[project_erp_generic_vs_rutba_pk_implementation]] discipline (generic product vs tenant data) — it's the pre-work that makes 2.1 tractable.
- **Keep PK specifics pluggable (2.5):** or the beachhead moat becomes a global-expansion anchor. The **multi-country/regional seeding layer** (tax profiles + shipping) + industry-onboarding packs already in the repo are the substrate for this — per-region marketplace accounts (1.7/3.10) plug into the same regional model.
- **Marketplace connectors are a wedge, not an afterthought:** omnichannel (own store + POS + Amazon + eBay + Daraz) is a headline SME-ERP feature the specialists (Cin7) lead with. Build the **framework once** (1.7) so each new channel/region is config, not a rewrite — this is what makes the global multi-region SaaS story real. Start with Amazon + eBay; fan out in 3.10.
- **Don't chase up-market depth:** the story is "start in minutes, grow for years," not "enterprise ERP." Resist scope that pulls toward NetSuite/SAP territory.

## Cross-references
- Market rationale & competitor benchmark → [market-strategy/README.md](./market-strategy/README.md)
- App-level gap detail & CRM carry-over → [rightapp-gap-analysis/README.md](./rightapp-gap-analysis/README.md) + [app-feature-map.md](./rightapp-gap-analysis/app-feature-map.md)
- Standalone-service pattern (Rutba-MTA, Rutba-Media-FileServer) for infra builds → gap-analysis §1/§4a
