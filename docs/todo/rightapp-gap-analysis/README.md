# RightApp → Rutba ERP: Gap Analysis & App Plan

_Analysis date: 2026-07-10. Sources: `D:/Projects/RightApp` (2020–21 legacy suite), `D:/Rutba/Rutba-MTA` (ported MTA), `D:/Rutba/Rutba-Media-FileServer` (ported storage/media, RSTORAGE), `D:/Rutba/ERP` (current monorepo)._

> **The ecosystem extracts infra-type capability as standalone services** — own repo/DB/port, docs-first (README + SPEC/FUNCTION), zero/near-zero-dep modular `src/`, HTTP/webhook (not code-level) integration with pos-strapi. **Rutba-MTA** is a true port of RIGHTMTA + RSMTPREST. **Rutba-Media-FileServer** is _not_ a port of RSTORAGE — different lineage (see §4a): it began as a **public media-serving origin** and RSTORAGE was a **private user Drive**; they've only recently converged on shared primitives. New infra capability becomes **features of / new standalone services in this pattern**, not monorepo ERP apps.

RightApp was a multi-tenant SaaS ERP built as ~17 independently-deployed micro-frontends (Angular 8/9 SPAs + thin Express OIDC-BFFs) over a single Oracle data plane (RAPIS) with a central OIDC provider (RIDNTY). It was pulled off years ago for being too slow. Its MTA is now being ported to `Rutba-MTA` as the template for absorbing legacy modules. This doc inventories what RightApp had, maps it against today's Rutba ERP, and plans the apps to close the gap — with a dedicated CRM section.

---

## 1. RightApp module inventory

| # | Module | What it was | State in repo |
|---|--------|-------------|---------------|
| 1 | **RIDNTY** | OAuth2/OpenID **Identity Provider** — login UI, PKCE, TOTP MFA, registration/activation, single-logout | Working |
| 2 | **RAPIS** | Central **API gateway / data plane** over Oracle; per-tenant DB connection pools; `{apipath, action, client}` contract | Working |
| 3 | **RORGAD** | **Organization Admin** — org profile, users & per-service entitlements, MTA-domain DNS verify, analytics-site registration | Working |
| 4 | **RUSRPL** | **User self-service portal** — profile, password, MFA config, my-orgs, per-org services, **billing**, create-org | Working |
| 5 | **RGTAPP** | Marketing **landing shell** + registration hub (Bootstrap/jQuery) | Static |
| 6 | **RGTAPPWEB** | **Marketing website** — Strapi 3 headless CMS + Next.js, composable page/section/card/slide/pricing/comparison model | Working |
| 7 | **RCRMXX** | **CRM** — business/person/lead/activity, Twilio softphone + recording, email w/ tracking, web-visitor timeline, report-builder segmentation, file sharing | Working (see §5) |
| 8 | **RPRODX** | **Products (PIM)** — catalog, variants/SKU, multi-currency price lists, COA mapping, categories, **Amazon MWS** lookup/import | Working |
| 9 | **RORDER** | **Orders** — Sales **and** Purchase Orders, line items, tax inc/exc, per-item discount, multi-currency | Working |
| 10 | **RINVNT** | **Inventory** — stock docs (delivery/dispatch), stock checks/counts, barcode/QR/PDF417 label printing | Working |
| 11 | **RBOOKS** | Accounting/Books | **Empty stub** (COA/tax/currency lived in RAPIS) |
| 12 | **RTMPLT** | **Template builder** — email/content templates, folders, blocks, Mustache render, link-tracking rewrite, mail servers/agents | Working |
| 13 | **RMAILX** | **Mail / email-marketing UI** — mail servers/agents/clients, templates, contacts (+CSV), **campaigns**, reporting, open-tracking pixel, unsubscribe | Working |
| 14 | **RIGHTMTA** | **MTA send engine** — Kafka pipeline (parse→send/relay), DKIM local send, SES/SendGrid/Mandrill/MailJet relay, campaign runner, reputation throttling | Working → **ported to Rutba-MTA** |
| 15 | **RSMTPREST** | **Inbound gateway** — real SMTP server + REST `/send` that feed the MTA pipeline | Working |
| 16 | **RANALYTICS** | First-party **web + email analytics** — GA-style pixel tracker, geo/channel/device, feeds CRM activity timeline | Working |
| 17 | **RSTORAGE** | **Storage / Drive** — file service, EFS layout by org/svc/business/person, PIN-protected public share links | Working |
| — | RSHARED | Shared Angular lib | Empty scaffold |
| — | RSRVRX | — | Empty |

**Architectural DNA:** multi-tenant by subdomain (`clientId = SVSID + orgId`), central OIDC, one shared data plane, everything expressed as JSON action envelopes. Rutba keeps the "one shared backend" idea (pos-strapi) but is currently **single-tenant-per-deployment** and uses Strapi users-permissions + `api-pro` instead of a standalone OIDC provider.

---

## 2. Current Rutba ERP apps (baseline)

One shared **pos-strapi** backend (:4010) + 17 Next.js frontends + a marketplace worker. Ports 4000–4017 (next free **4018+**).

`rutba-web` (4000) · `pos-stock` (4001) · `pos-sale` (4002) · `pos-auth` (4003) · `rutba-web-user` (4004) · `rutba-crm` (4005) · `rutba-hr` (4006) · `rutba-accounts` (4007) · `rutba-payroll` (4008) · `rutba-cms` (4009) · **pos-strapi (4010)** · `rutba-social` (4011) · `rutba-rider` (4012) · `rutba-order-management` (4013) · `rutba-manufacturing` (4014) · `rutba-ess` (4015) · `rutba-marketplace` (4016) · `rutba-inventory` (4017).

Backend already models (Strapi content-types): products/brand/category, purchase+purchase-item+supplier, sale/sale-order, crm-contact/crm-lead/crm-activity, full accounting (acc-*), HR/payroll (hr-*/pay-*), manufacturing (mfg-*), marketplace, notifications+notification-template, stock/warehouse/batch, workflow engine.

---

## 3. Capability mapping (RightApp → Rutba)

| RightApp capability | Rutba today | Verdict |
|---|---|---|
| RAPIS data plane | **pos-strapi** (Strapi 5 + MySQL, api-pro authz) | ✅ Superseded (better) |
| RIDNTY OIDC provider | pos-auth + Strapi users-permissions + api-pro | 🟡 Partial — auth yes, **not** a standalone OIDC IdP for 3rd-party RPs |
| RORGAD org admin / multi-tenancy | — (single-tenant; rutba.pk is one tenant) | ❌ **Gap** (only if SaaS multi-tenant is a goal) |
| RUSRPL self-service portal | rutba-web-user (:4004) | 🟡 Partial — profile/orders yes; **no billing/subscriptions, no MFA config, no create-org** |
| RGTAPP landing | rutba-web (:4000) | ✅ |
| RGTAPPWEB marketing CMS | rutba-cms (:4009) + rutba-web | ✅ Superseded |
| RCRMXX CRM | rutba-crm (:4005) + crm-* backend | 🟡 Partial — big feature gaps (see §5) |
| RPRODX PIM | product/brand/category backend; edited via pos-stock/Strapi admin | 🟡 Partial — **no dedicated PIM app**; no multi-currency price lists / marketplace-catalog import UI |
| RORDER sales orders | rutba-order-management (:4013) + sale-order | ✅ |
| RORDER **purchase orders** | purchase/supplier **backend exists**; no dedicated procurement UI | 🟡 Partial — **no Procurement/Purchasing app** |
| RINVNT inventory | rutba-inventory (:4017) + pos-stock (:4001) | ✅ Superseded (warehouse/bin/batch/FEFO) |
| RBOOKS accounting | rutba-accounts (:4007) + acc-* | ✅ Superseded (RBOOKS was empty) |
| RTMPLT template builder | notification-template (system notices only) | ❌ **Gap** — no user email/content template studio with tracking |
| RMAILX email-marketing UI | — (Rutba-MTA is send-engine only) | ❌ **Gap** — no campaigns/contacts/segments/mail-agents UI |
| RIGHTMTA + RSMTPREST send engine | **Rutba-MTA** (standalone) | ✅ Ported (ingress SMTP server optional) |
| RANALYTICS web/email analytics | — (Rutba-MTA does click/open interception; no site tracker) | ❌ **Gap** — no first-party visitor analytics feeding CRM |
| RSTORAGE drive + share links | _(different lineage — see §4a)_ Rutba-Media-FileServer covers **public** media serving; **private Drive + PIN sharing is still a gap** | 🟡 Partial — public-media substrate exists, private-Drive/sharing capability not built |

**Where Rutba is already far ahead of RightApp:** POS terminal, HR/ESS/Payroll suite, Manufacturing, multi-vendor Marketplace (+Daraz), Rider/delivery, Social, real GL accounting, warehouse/batch/FEFO inventory, workflow engine, layered api-pro authorization.

---

## 4. The gaps, as an app plan

Ordered by value-to-effort. Ports assume the next free slot (4018+). Follow the **Rutba-MTA porting pattern** where a capability is infra (standalone Apache-2.0 Node service, own DB/config/port, docs-first, pure-logic core, HTTP/webhook integration) and the **new-ERP-app checklist** (`roles.js` + `/auth/callback` + `domains.json`) where it's a monorepo Next.js app on pos-strapi.

### Priority 1 — Email Marketing / Campaigns (`rutba-campaigns`, ~:4018)
The biggest coherent gap and the natural front-end for the MTA already being ported. Rebuilds **RMAILX + RTMPLT** as one app on pos-strapi + Rutba-MTA:
- Content-types: `mail-template` (subject/body/tracking/append-links/folder), `mail-template-block`, `mail-audience` (saved contact segment — reuse CRM segmentation §5), `mail-campaign` (template + audience + schedule + UTM), `mail-send-log` (mirror of MTA delivery events via webhook).
- Screens: template studio (Mustache/`{{var}}`), audience builder, campaign composer + test-send + schedule, delivery/opens/clicks dashboard (fed by Rutba-MTA webhooks).
- Integration: Rutba-MTA already owns sending, suppression, reputation throttle, unsubscribe, click interception — this app is the **tenant UI + template/campaign store** over it. Closes RTMPLT + RMAILX + RIGHTMTA-campaign-runner in one move.

### Priority 2 — CRM feature build-out (extend `rutba-crm`, no new app)
See §5 — this is where the richest RightApp IP lives and it directly serves rutba.pk sales. Highest ROI because the app already exists.

### Priority 3 — First-party Analytics / Activity Tracker (`rutba-analytics` service, standalone, ~:8030)
Port **RANALYTICS** using the Rutba-MTA pattern: a standalone tracker service serving `script.js` + `track.png`, capturing visits (geo/channel/device/UTM), and POSTing **web-visit + email-open events into CRM as `crm-activity` rows**. Powers the CRM "Site" activity timeline (§5) and campaign click-through. Site registration lives in a small settings screen.

### Priority 4 — Product Information Management app (`rutba-pim`, ~:4019) — _optional_
Backend catalog exists; this adds RPRODX's richer merchandising layer if needed: multi-currency price lists, channel/COA mapping, bulk catalog import from marketplace feeds (Amazon/Daraz equivalent of MWS lookup). Lower urgency — pos-stock + Strapi admin cover basic catalog editing today.

### Priority 5 — Procurement / Purchasing app (`rutba-procurement`, ~:4020) — _optional_
`purchase`/`supplier` backend already exists; a dedicated buyer UI (PO lifecycle, supplier catalogs, receiving → stock-input, three-way match into acc-bill) would surface it. Could also just be a section of rutba-order-management.

### Priority 6 — SaaS platform layer (only if Rutba goes multi-tenant SaaS)
RightApp's RORGAD + RUSRPL-billing + RIDNTY-as-IdP only matter if Rutba is sold as multi-tenant SaaS rather than per-tenant deployments (rutba.pk model). If that's the direction:
- `rutba-org-admin` — tenant/org console, user↔app entitlements, domain verification.
- Billing/subscriptions in rutba-web-user (RUSRPL parity) + MFA config + create-org.
- Promote pos-auth toward a real OIDC provider for external RPs.
- Requires a tenancy model in pos-strapi (org scoping) — significant architecture decision, **defer until the SaaS question is answered**.

### 4a. Storage: two distinct lineages (`Rutba-Media-FileServer` ≠ RSTORAGE port)
These started from **different problems** and are only now converging — don't treat the media server as an RSTORAGE port:

- **Rutba-Media-FileServer** (`D:/Rutba/Rutba-Media-FileServer`, v2.0.0, MIT) began as a **public media-serving origin** — a CDN-style image host to fix Strapi's responsive-variant disk bloat (5.4k originals → ~30k files / 4.9 GB) for images.rutba.pk / images.trustlist.uk. Its core is masters-only storage + resize-on-request + LRU cache, fronted by a Strapi upload provider. It has since grown authenticated writes (`PUT`/`DELETE`), origin/cluster pull-through, and **per-file public/private visibility** (`X-Visibility` + `.vis` sidecar, public/private node roles, eligibility-gated replication). Built on the standalone-service pattern (own repo/port, docs-first, zero-dep modular `src/`).
- **RSTORAGE** (RightApp) was a **private user Drive** — per `<org>/<svc>/b<business>/p<person>` file storage with authenticated user access and **PIN-protected public share links**. That user-facing Drive + sharing surface is **still a gap** in Rutba.

**How they relate:** the media server's write + public/private-visibility + signed-access primitives make it the **most likely substrate** to host the RSTORAGE-style Drive/sharing capability _if the user chooses to converge the two tracks_ — but that's a design decision, not a done port. Practically:
- **Public media/CDN** (product images, CMS assets) — ✅ owned by Rutba-Media-FileServer today.
- **Private Drive + PIN/token sharing** (CRM per-contact files §5.10, user documents) — ❌ not built; would either extend Rutba-Media-FileServer (build on its visibility/`PRIVATE_PATHS`/signed-URL primitives) or be a separate private-storage service. **Open decision for the user.**

### Not recommended to port
- **RSHARED / RSRVRX** — empty in the original.
- **Standalone OIDC IdP** — unless external relying parties need it.

---

## 5. CRM: what to bring from Right CRM into `rutba-crm`

Right CRM's data lived in RAPIS (no schema in-repo), but its **feature set** is the valuable inheritance. Rutba already has `crm-contact`, `crm-lead`, `crm-activity` — so this is mostly additive. Ranked:

### 5.1 Activity timeline (the crown jewel) — **bring fully**
RightApp's strongest concept: every touch is an **activity** typed `call | note | meeting | mail | site`, with `ioflow` (in/out-bound), `telresp` (call outcome), `followup_ts` (reminder), duration, attachments, linked to contact+company. Rutba has `crm-activity` — extend it to this typed, reminder-bearing, attachment-carrying timeline and render a 360° contact drawer (Details / Activity / Associations / Leads / Files tabs).

### 5.2 Opportunity / Deal / Pipeline — **net-new (RightApp never had it)**
RightApp modeled "pipeline" only as a lead **status tag (`ctag`) + assigned owner** — no deal amount, stage, close date, or products-on-deal. This is a known hole. Rutba should add a proper `crm-opportunity` (stage, value, currency, expected-close, probability, linked products/quote, owner) with a kanban pipeline. **Improve on the original, don't copy the limitation.**

### 5.3 Report-builder as segmentation engine — **bring the concept**
Nearly all of Right CRM was a generic **report builder**: pick columns across contact/company/activity/lead, apply rich filters (status/industry/revenue/country/created/activity-type/call-outcome/lead-tag/owner/campaign/follow-up), save into **folders**, run into an ag-grid with drill-down. Saved reports doubled as **segments** and as dashboard data sources. Rebuild as a saved-view/segment engine — it's what feeds Priority-1 campaign audiences and the dashboard.

### 5.4 Combined lead-capture + bulk import — **bring**
- One modal that creates company + person + association + lead in a single flow.
- **CSV/XLSX bulk import** with column mapping, country resolution, batched writes, default-owner/status assignment. Rutba already has the [[bulk-stock-item-import]] pattern — reuse it for contacts.

### 5.5 Company ↔ Person associations with relationship type — **bring**
Right CRM's three-entity model (Business, Person, and an Association carrying `Owner/CEO/Employee`). Rutba already did contact unification (person + address, [[project_contact_unification_phase1a]]); add the **association/relationship** layer so a person can belong to multiple companies and vice-versa.

### 5.6 Click-to-call softphone + call recording — **bring (distinctive)**
Browser softphone (Twilio in the original) with live timer, auto-captured duration/outcome, and server-side recording pushed to storage, all logged as a `call` activity. High-signal CRM differentiator; provider can be Twilio or any WebRTC/SIP gateway.

### 5.7 Email-on-activity with open/click tracking — **bring (synergy)**
Send an email tied to a contact activity, with open/click tracking. This is a **direct hand-off to Rutba-MTA** (which already does templated send + click interception + open tracking) — CRM logs the `mail` activity, MTA reports opens/clicks back via webhook. Ties CRM ↔ Priority-1 campaigns ↔ Priority-3 analytics together.

### 5.8 Web-visitor activity ("Site" timeline) — **bring (with Priority-3)**
Right CRM folded first-party web analytics into the contact timeline: per-page visits, dwell, geo, language, channel/traffic-route, resolving anonymous → known contacts. Depends on the `rutba-analytics` tracker (Priority 3) writing `crm-activity` rows of type `site`.

### 5.9 Dashboard from saved segments — **bring**
Charts driven by saved report IDs: lead-status distribution, companies by revenue/country, coworker × lead-status matrix, plus the site-analytics widgets. Cheap once 5.3 exists.

### 5.10 PIN-protected file sharing per contact — **optional**
Per-contact files with generate-share-link-with-PIN. Nice-to-have; depends on whether the Drive capability is built.

**CRM summary:** carry 5.1, 5.3, 5.4, 5.5, 5.7 first (timeline, segmentation, import, associations, tracked-email — all additive on existing `crm-*` tables and synergistic with the MTA); **add** 5.2 (real pipeline — the thing RightApp lacked); layer 5.6, 5.8, 5.9 as the softphone/analytics services land.

---

## 6. Suggested sequencing

1. **CRM core build-out** (§5.1 timeline, §5.3 segmentation, §5.4 import, §5.5 associations) — pure additive value on an app that exists and serves rutba.pk now.
2. **CRM pipeline** (§5.2) — the net-new deal/opportunity layer.
3. **`rutba-campaigns`** (Priority 1) — email marketing UI over the already-ported Rutba-MTA; consumes CRM segments.
4. **Tracked email in CRM** (§5.7) — wire CRM ↔ MTA.
5. **`rutba-analytics`** (Priority 3) — unlocks §5.8 site timeline + campaign click analytics.
6. **PIM / Procurement UIs** (Priorities 4–5) — only if the backend-only catalog/purchase modules need dedicated front-ends.
7. **SaaS platform layer** (Priority 6) — only if/when Rutba pivots to multi-tenant SaaS; decide the tenancy model first.

_Open decision for the user: is multi-tenant SaaS a goal (drives Priority 6), and is the softphone/telephony piece (§5.6) in scope for this round?_
