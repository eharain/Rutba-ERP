# Multi-region fiscalization — landscape & seam design

_Date: 2026-08-07. Planning only — no code exists for any of this. Companion to ROADMAP **0.1** (FBR Digital Invoicing, H0) and **2.5** (Pluggable tax/payments/locale, H2)._

> **Status: PLAN.** Nothing here is scheduled. The one thing it asks of 0.1 is _negative_: don't hardcode Pakistan. Everything else is deferred to 2.5 / H3 and should be re-researched before it's costed.

---

## 1. The distinction that matters

Two different problems get called "tax", and only one of them is 0.1:

| | What it is | State in repo |
|---|---|---|
| **Tax calculation** | What rate applies to this line, and how it splits | **Exists, already multi-region.** [tax-profiles.js](../../pos-strapi/src/seed/seeders/tax-profiles.js) seeds `api::acc-tax-rate` for PK, UK, US (51 states), EU (27 members), MENA, APAC (incl. India), Canada — idempotent by `code`, one function per region so a tenant applies only what they operate in. |
| **Fiscalization** | Transmitting the invoice to a government system, getting back an identifier, and printing it | **Nothing.** No FBR/PRAL/IRN/ZATCA/Peppol code anywhere. This is what 0.1 builds. |

Item 0.1 is the first fiscalization adapter. The rate tables it needs are already there.

---

## 2. Model taxonomy

Every regime is one of five shapes. This is the axis the seam has to abstract over — not "country".

| Model | How it works | Where |
|---|---|---|
| **Clearance / CTC** | Invoice goes to the tax authority *before or at* issue; authority returns an ID you must print. No ID, no valid invoice. | **Pakistan**, India, Saudi (B2B), Italy, Egypt, Israel, Türkiye |
| **Near-real-time reporting** | Invoice issued locally, reported within a window (hours–days). | Saudi (B2C, 24h), Hungary, Greece, Romania |
| **4/5-corner network** | Exchange via accredited access points on a shared network; authority may sit as a 5th corner. | Peppol: Belgium, Nordics, NL, **UAE**, AU/SG/NZ; France's PDP; US DBNAlliance (voluntary) |
| **Post-audit + certified software** | No transmission, but the *software* is regulated — hash chains, QR, sequential numbering, audit files. | Spain (Verifactu), Portugal (SAF-T + ATCUD), Germany (KassenSichV for POS) |
| **Periodic digital filing** | No per-invoice anything; API-filed returns with digital record-keeping rules. | **UK (MTD)** |
| **None** | No mandate. The hard part is elsewhere. | **US** |

**Pakistan sits in the same box as India, Saudi B2B, and Egypt.** That's the reuse argument.

---

## 3. Region detail

### 3.1 India — closest analogue to Pakistan

The most reusable second adapter; near-identical primitives to FBR.

- **IRP (Invoice Registration Portal)** — NIC's, or a private IRP. Submit invoice JSON (schema **INV-01**), receive back an **IRN** (64-char hash), a **signed QR code**, and the signed invoice JSON.
- Threshold has ratcheted down to **₹5 crore AATO**; assume it keeps falling.
- **30-day reporting limit** for AATO ≥ ₹10 crore (from April 2025) — invoices older than that are rejected. An outage buffer must respect a hard expiry.
- **E-way bill** — a *separate* system for goods movement > ₹50,000. Can be generated in the same call as the IRN. This has no PK equivalent and is genuinely extra scope.
- Access is normally through a **GSP** (GST Suvidha Provider) rather than direct.
- **Cancellation: IRN can only be cancelled within 24h**; after that it's a credit note. Different from PK — don't assume the reversal path.
- Tax model is the real work, not the transport: **CGST/SGST vs IGST split driven by place of supply** (intra- vs inter-state), rates 0/5/12/18/28 + cess, mandatory **HSN/SAC** codes. GSTR-1/3B auto-populate from cleared IRNs.

### 3.2 MENA

**Saudi Arabia — ZATCA "Fatoora"** is the heaviest regime on this page, and the best stress test of the seam.

- Phase 1 (Generation, Dec 2021): structured invoices, QR on simplified invoices.
- Phase 2 (Integration, from Jan 2023, in revenue-banded waves): **clearance** for standard/B2B, **24h reporting** for simplified/B2C.
- **Device onboarding** — each EGS unit registers, gets a compliance CSID via OTP, then a production CSID. Per-device credentials, not per-company.
- **Cryptographic stamp** (ECDSA), **invoice hash chaining** via previous-invoice-hash (PIH), monotonic counter (ICV).
- **QR is TLV-encoded base64**, ~9 tags, including the stamp and public key. Nothing like PK's or India's.
- UBL 2.1, KSA CIUS.

**UAE** — 5-corner DCTCE model, **Peppol PINT AE** via **Accredited Service Providers**. Phasing from 2026. VAT 5%.

**Egypt** — ETA e-invoicing (B2B) + e-receipt (B2C). JSON documents signed with an Egyptian e-signature (HSM or USB token) — a hardware dependency the others don't have. UUID per document.

**Jordan** — JoFotara national platform. **Israel** — allocation-number model, clearance above a threshold that keeps dropping. **Oman / Qatar** — phased/announced. **Bahrain** VAT 10%, **Kuwait / Qatar** no VAT yet. **Türkiye** (often bundled with MENA) — e-Fatura / e-Arşiv via GİB, UBL-TR, a long-standing and mature mandate.

### 3.3 EU — one standard, ~15 national systems

- **EN 16931** is the common semantic model; syntaxes are **UBL 2.1** or **UN/CEFACT CII**. Build to EN 16931 and each country is a profile (CIUS) on top, not a rewrite.
- **ViDA** (adopted 2025) pushes intra-EU B2B digital reporting toward **2030**, and lets member states mandate domestic B2B without a derogation — which is why the national systems are multiplying now.
- B2G e-invoicing is already mandatory everywhere under Directive 2014/55/EU.

| Country | System | Notes |
|---|---|---|
| Italy | **SdI** | Clearance, FatturaPA XML, B2B since 2019. Codice Destinatario / PEC routing. |
| France | **PDP** + Factur-X | Hybrid PDF/A-3 + CII. PPF descoped to directory/concentrator (Oct 2024). Receiving mandatory for all Sept 2026; issuing Sept 2026 large/mid, Sept 2027 SMEs. |
| Poland | **KSeF** | FA(3) schema. Large taxpayers Feb 2026, everyone else April 2026. |
| Spain | **SII** + **Verifactu** | SII = near-real-time VAT ledgers. Verifactu regulates the *software*: certification, hash chaining, QR. Plus **TicketBAI** in Basque Country/Navarra, and a pending Crea y Crece B2B mandate. |
| Germany | **XRechnung / ZUGFeRD 2.x** | Since 1 Jan 2025 all domestic B2B must be able to **receive** EN 16931. Issuing phases 2027/2028. |
| Belgium | Peppol | Mandatory domestic B2B from 1 Jan 2026. |
| Romania | RO e-Factura (+ e-Transport) | |
| Hungary | RTIR / online számla | Real-time reporting. |
| Portugal | ATCUD + QR, SAF-T (PT) | Certified software; monthly SAF-T. |
| Greece | myDATA | |
| NL / Nordics | Peppol | Largely B2G-driven. |

### 3.4 UK — no e-invoicing mandate, but a real API integration

- **No e-invoicing mandate.** Not in ViDA. A government consultation ran Feb–May 2025; a mandate is plausible but wasn't law as of the cutoff.
- **HMRC Making Tax Digital (MTD) for VAT** is the actual integration, and it's non-trivial: OAuth 2.0, the **digital-links rule** (no copy-paste between systems — the data path from record to return must be electronic end-to-end), and the mandatory **`Gov-Client-*` fraud-prevention headers**, which are fiddly and get audited.
- **MTD for ITSA** phasing: April 2026 for >£50k, April 2027 for >£30k — matters for sole-trader tenants.
- Peppol for NHS/public sector procurement.

### 3.5 US — the problem isn't invoicing

- **No mandate, no VAT.** DBNAlliance's exchange framework (Peppol-derived, 4-corner) is voluntary.
- The real problem is **sales tax**: ~13,000 jurisdictions, **economic nexus** per state post-*Wayfair* (commonly a $100k threshold), origin vs destination sourcing, **product taxability codes**, **exemption certificate management**, marketplace-facilitator rules, and per-state filing/remittance calendars.
- Realistically this is an **integration with a tax engine** (Avalara AvaTax, Vertex, TaxJar, Sovos, Stripe Tax), not something to build. The seeded `US-XX` state floors in tax-profiles.js are a starting point, not a solution — local county/city rates stack on top.
- Adjacent: 1099 / W-9 collection for contractors; ACH (NACHA) and Level 2/3 card data for B2B interchange rates.

---

## 4. What 0.1 must not hardcode

Three of the six regions (India, Saudi, Egypt) need **the same primitives Pakistan needs**. These are the seams to leave open. Cost during 0.1: small. Cost to retrofit: a rewrite.

| Primitive | Why generic | Who else needs it |
|---|---|---|
| **Document status + government identifier** | `pending → cleared → failed`, with the returned ID stored on the invoice | IRN (PK, IN), UUID (EG), allocation number (IL), SdI receipt (IT) |
| **Offline buffer + retry queue, idempotency-keyed** | The single most reusable piece. Needs a hard expiry, not just a retry | PK, KSA (24h), IN (30-day) |
| **QR payload as a pluggable encoder** | Every regime's payload differs. Must not be inline in the invoice print template | PK, KSA (TLV+stamp), IN (signed JSON b64), PT (ATCUD), ES |
| **Gapless sequential numbering per registration/device** | PK needs it; KSA needs it per-EGS-device, which is a different scoping key | PK, KSA, ES, PT |
| **Hash-chaining hook** | Unused by PK — but if there's no place to put it, KSA and Spain can't be added | KSA (PIH), ES (Verifactu), PT |
| **Credential/device onboarding** | PK is company-level. KSA is per-device, Egypt is a hardware token, India is GSP creds | KSA, EG, IN |
| **Retention as config, not a constant** | See table below | all |
| **Cancellation / credit-note path** | Reversal rules differ materially | IN (24h then credit note), KSA, IT |
| **Multi-rate + place-of-supply tax model** | PK is effectively single-rate today. Don't let 18% become an assumption | IN (5/12/18/28 + cess, CGST/SGST/IGST), EU |

**Retention** — PK's 6 years is not the max, so it can't be a constant:

| PK | IN | UK | KSA | UAE | Italy / Germany |
|---|---|---|---|---|---|
| 6 yr | 8 yr | 6 yr | 5 yr (15 for real estate) | 5 yr | 10 yr |

---

## 5. Sequencing

Nothing below 0.1 is scheduled. Indicative order if/when regions come up:

1. **0.1 — Pakistan / FBR PRAL.** Build it as an adapter behind the seam in §4. That's the entire ask of H0.
2. **Peppol access point** — the highest-leverage second integration by far: one build covers much of the EU plus UAE, Australia, Singapore, NZ. Natural fit for **2.5**.
3. **India** — if a tenant needs it. Reuses PK's primitives almost wholesale; the new work is CGST/SGST/IGST place-of-supply and e-way bill.
4. **Saudi ZATCA** — the stress test. If the seam survives KSA's crypto/device model, it survives anything.
5. **UK MTD** — orthogonal to everything else (periodic filing, not per-invoice); build only for a UK tenant.
6. **US** — buy, don't build. Integrate a tax engine.

Ties into ROADMAP **2.5** (un-hard-code PK specifics), **3.10** (per-region marketplaces ride the same regional model), and the existing regional seeding layer ([[project_seeding_control_system]], [[project_data_seeding_strategy_migrations_not_seed_json]]).

---

## 6. Caveats

- **Source is model knowledge to ~May 2026**, and these mandates move constantly — thresholds drop, dates slip, schema versions bump. **Re-verify every date and schema version in this document before costing or committing any of it.** Treat it as a map of the terrain, not a spec.
- **Not tax advice.** Same caveat tax-profiles.js already carries: rates and rules are defaults a tenant confirms with a local advisor, per country.
- Per repo convention, any of this that lands later needs an api-provider descriptor + `node ./scripts/scaffold-endpoint-providers.mjs` + the three validators; custom controller actions ported into `rutba-core/src/modules/*.js`; and reference data as a seeder in `pos-strapi/src/seed/registry.js` with a matching migration.

## Cross-references

- [ROADMAP.md](./ROADMAP.md) — 0.1 (H0), 2.5 (H2), 3.10 (H3)
- [accounting-completion-spec.md](./accounting-completion-spec.md) — how invoices post today
- [tax-profiles.js](../../pos-strapi/src/seed/seeders/tax-profiles.js) — the existing multi-region rate layer
