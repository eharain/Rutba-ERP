# RightApp ↔ Rutba ERP — Feature & App Map

Companion to [README.md](./README.md). Quick-scan mapping of what equates to what, and what remains.

<!-- verify-docs: subset -->
<!-- The tables below are keyed by RightApp module. Rutba apps with no RightApp
     counterpart (payroll, ESS, mail, users, helpdesk) are deliberately absent —
     this is a mapping, not an inventory of the estate. -->


**Legend**
| Icon | Meaning |
|------|---------|
| ✅ **Done** | Rutba has an equivalent (often better) — no action needed |
| 🟡 **Partial** | Backend or partial app exists; UI/features missing |
| ❌ **Gap** | Nothing in Rutba — needs building |
| ⭐ **Ahead** | Rutba has this; RightApp never did |
| 🚫 **Skip** | RightApp had it but not worth porting |

---

## Table 1 — App-level map (RightApp module → Rutba app)

| RightApp module | Capability | Rutba equivalent | Status | Action / plan |
|---|---|---|---|---|
| RAPIS | Central API / data plane | **services/strapi** (:4010) | ✅ Done | Superseded by Strapi 5 + api-pro |
| RIDNTY | OIDC identity provider | apps/admin/auth (:4003) + users-permissions + api-pro | 🟡 Partial | OIDC-IdP-for-3rd-parties only if needed |
| RORGAD | Org admin / multi-tenancy | — | ❌ Gap | `rutba-org-admin` — **only if SaaS** (P6) |
| RUSRPL | User self-service portal | apps/sales/portal (:4004) | 🟡 Partial | Add billing / MFA / create-org if SaaS |
| RGTAPP | Marketing landing shell | apps/content/storefront (:4000) | ✅ Done | — |
| RGTAPPWEB | Marketing website / CMS | apps/content/cms (:4009) + apps/content/storefront | ✅ Done | Superseded |
| RCRMXX | CRM | apps/sales/crm (:4005) + crm-* | 🟡 Partial | Build-out (see Table 3) |
| RPRODX | Products / PIM | product/brand/category backend | 🟡 Partial | Optional `rutba-pim` (port TBD) — P4 |
| RORDER (sales) | Sales orders | apps/sales/orders (:4013) | ✅ Done | — |
| RORDER (purchase) | Purchase orders | purchase/supplier backend | 🟡 Partial | Optional `rutba-procurement` (port TBD) — P5 |
| RINVNT | Inventory / stock | apps/inventory/control (:4017) + apps/inventory/stock (:4001) | ✅ Done | Superseded (bin/batch/FEFO) |
| RBOOKS | Accounting | apps/finance/accounts (:4007) + acc-* | ✅ Done | Superseded (RBOOKS was empty) |
| RTMPLT | Email/content templates | — (only notification-template) | ❌ Gap | Fold into `apps/content/campaigns` — P1 |
| RMAILX | Email-marketing UI | — | ❌ Gap | **`apps/content/campaigns`** (:4019) — P1, since built |
| RIGHTMTA | MTA send engine | **Rutba-MTA** (standalone) | ✅ Done | Already ported |
| RSMTPREST | SMTP/REST ingress | Rutba-MTA (optional ingress) | 🟡 Partial | Add SMTP ingress if needed |
| RANALYTICS | Web/email analytics | — | ❌ Gap | **`rutba-analytics`** service (:8030) — P3 |
| RSTORAGE | Private Drive + PIN sharing | — _(≠ media server; see note)_ | ❌ Gap | Private Drive/sharing not built |
| _(different lineage)_ | Public media / CDN serving | **Rutba-Media-FileServer** (standalone v2.0) + Strapi provider | ✅ Done | Born to fix Strapi variant bloat, not an RSTORAGE port |
| RSHARED / RSRVRX | (empty stubs) | @rutba/shared, api-provider | 🚫 Skip | Were empty in original |
| — | POS terminal | apps/sales/pos (:4002) | ⭐ Ahead | RightApp had no POS |
| — | HR / ESS / Payroll | apps/people/hr/ess/payroll (:4006/4015/4008) | ⭐ Ahead | — |
| — | Manufacturing | apps/inventory/manufacturing (:4014) | ⭐ Ahead | — |
| — | Marketplace (+Daraz) | apps/sales/marketplace (:4016) | ⭐ Ahead | — |
| — | Rider / delivery | apps/sales/rider (:4012) | ⭐ Ahead | — |
| — | Social | apps/content/social (:4011) | ⭐ Ahead | — |

---

## Table 2 — Feature-level map (capability → where it lives → what remains)

| Domain | Feature | RightApp | Rutba now | Status | Lands in |
|---|---|---|---|---|---|
| **Identity** | Login / JWT / roles | RIDNTY | apps/admin/auth + api-pro | ✅ | — |
| | OIDC provider for external RPs | RIDNTY | — | ❌ | P6 (if SaaS) |
| | TOTP MFA | RIDNTY | — | ❌ | P6 (if SaaS) |
| **Tenancy** | Multi-tenant by org/subdomain | RAPIS pools + RORGAD | single-tenant deploy | ❌ | P6 (if SaaS) |
| | Per-user app entitlements | RORGAD | api-pro claims/roles | ✅ | — |
| **Mail** | Send engine / DKIM / relay | RIGHTMTA | Rutba-MTA | ✅ | — |
| | Suppression / reputation / unsubscribe | RIGHTMTA | Rutba-MTA | ✅ | — |
| | SMTP/REST ingress | RSMTPREST | Rutba-MTA (partial) | 🟡 | P1 opt. |
| | Template studio (Mustache + tracking) | RTMPLT | — | ❌ | **P1 apps/content/campaigns** |
| | Contacts / audiences | RMAILX | crm-contact (raw) | 🟡 | **P1** (via CRM segments) |
| | Campaigns (schedule/UTM/reporting) | RMAILX | — | ❌ | **P1 apps/content/campaigns** |
| | Open/click tracking | RMAILX + RIGHTMTA | Rutba-MTA (click) | 🟡 | P1 + P3 |
| **Analytics** | First-party web visitor tracker | RANALYTICS | — | ❌ | **P3 rutba-analytics** |
| | Email-open pixel → activity | RANALYTICS | — | ❌ | P3 |
| **Products** | Catalog / brand / category | RPRODX | product/brand/category backend | ✅ | — |
| | Variants / SKU | RPRODX | product-group + stock-item | ✅ | — |
| | Multi-currency price lists | RPRODX | — | 🟡 | P4 (opt.) |
| | Marketplace catalog import (MWS) | RPRODX | Daraz mapping (marketplace) | 🟡 | P4 / marketplace |
| **Orders** | Sales orders | RORDER | sale-order + order-mgmt | ✅ | — |
| | Purchase orders / receiving | RORDER | purchase backend | 🟡 | P5 (opt.) |
| **Inventory** | Stock docs / transfers / counts | RINVNT | stock-* + apps/inventory/control | ✅ | — |
| | Barcode/QR label printing | RINVNT | apps/inventory/stock label print | ✅ | — |
| | Warehouse / bin / batch / FEFO | — | apps/inventory/control | ⭐ | — |
| **Accounting** | Chart of accounts / GL / tax | RBOOKS (empty) | acc-* + apps/finance/accounts | ✅ | — |
| **Storage** | Public media / CDN serving (resize/cache/replicate) | _(media server's own origin, not RSTORAGE)_ | **Rutba-Media-FileServer** (standalone) | ✅ | — |
| | File visibility primitive (public/private) | — | Rutba-Media-FileServer (`.vis` sidecar + node roles) | ✅ | substrate for sharing |
| | Private user "Drive" (org/business/person layout) | RSTORAGE | — | ❌ | Extend media server _or_ new svc — open decision |
| | Share-links (PIN/signed access) | RSTORAGE | — | ❌ | Build on visibility/signed-URL primitives |
| **CRM** | (see Table 3) | RCRMXX | apps/sales/crm + crm-* | 🟡 | P2 |

---

## Table 3 — CRM feature map (Right CRM → apps/sales/crm)

| # | CRM feature | RightApp had | Rutba now | Status | Action |
|---|---|---|---|---|---|
| 5.1 | Typed activity timeline (call/note/meeting/mail/site + follow-up + attachments + call-outcome) | ✅ (crown jewel) | crm-activity (basic) | 🟡 | **Extend** — bring fully |
| 5.2 | Opportunity / Deal / Pipeline (stage, value, close date, probability) | ❌ (faked via status tag) | — | ❌ | **Add net-new** — improve on original |
| 5.3 | Report-builder = saved segments (folders, columns, rich filters) → feeds campaigns + dashboard | ✅ | — | ❌ | **Build** segmentation engine |
| 5.4 | Combined lead capture (company+person+assoc+lead in one modal) | ✅ | partial | 🟡 | Bring |
| 5.4 | Bulk CSV/XLSX import (mapping, country resolve, batched) | ✅ | reuse bulk-stock pattern | 🟡 | Bring |
| 5.5 | Company↔Person associations w/ relationship type (Owner/CEO/Employee) | ✅ | person + address (unified) | 🟡 | **Add** association layer |
| 5.6 | Click-to-call softphone + call recording | ✅ (Twilio) | — | ❌ | Bring (telephony — scope TBD) |
| 5.7 | Email-on-activity w/ open/click tracking | ✅ | — | ❌ | **Bring** — hand-off to Rutba-MTA |
| 5.8 | Web-visitor "Site" activities in timeline | ✅ | — | ❌ | Bring (needs P3 analytics) |
| 5.9 | Dashboard from saved segments (charts) | ✅ | — | ❌ | Bring (after 5.3) |
| 5.10 | PIN-protected per-contact file sharing | ✅ | — | 🟡 | Optional (needs Drive) |

**CRM build order:** 5.1 → 5.3 → 5.4 → 5.5 → 5.7 (all additive on existing `crm-*` + synergistic with MTA), then **5.2** (the net-new pipeline), then 5.6 / 5.8 / 5.9 as telephony/analytics services land.

---

## Scoreboard

| Status | Count | Items |
|---|---|---|
| ✅ Done | 9 | data-plane, sales orders, inventory, accounting, marketing site, POS-era catalog, mail-send engine, public media/CDN serving, landing |
| 🟡 Partial | 8 | identity/OIDC, user portal, CRM, PIM, purchase UI, SMTP ingress, tracking, associations |
| ❌ Gap | 9 | campaigns UI, template studio, web analytics, CRM pipeline, CRM segmentation, tracked-email, site-activity, softphone, private Drive + sharing |
| ⭐ Ahead | 6 | POS, HR/ESS/Payroll, Manufacturing, Marketplace, Rider, Social |
| 🚫 Skip | 2 | RSHARED, RSRVRX |

**Net new apps proposed:** `apps/content/campaigns` (P1), `rutba-analytics` (P3), optional `rutba-pim` (P4) / `rutba-procurement` (P5), and `rutba-org-admin` (P6, SaaS-only). Everything else is either done, ahead, or an in-place extension of `apps/sales/crm`.
