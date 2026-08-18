# `apps/content/campaigns` — Implementation Spec

<!-- verify-docs: planned campaign/start.js unsubscribe/ -->
<!-- verify-docs: external RMAILX/** -->
<!-- RMAILX paths are in the legacy RightApp codebase. -->

> **Status update (2026-08-09, later): Phases 4–5 built** under the
> email-program umbrella (M6). The §5 tracking decision was taken as
> **option (b) — local** — with cause: the MTA's own FUNCTION.md scopes
> generic open/click tracking out, the repo has its own release process, and
> dev has no MTA running to verify an MTA-side tracker against. Shape:
> `utils/cmp-tracking.js` instruments the batch HTML AFTER `withUtm` (pixel +
> per-link rewrite through `/api/cmp/t/c/{{_trk}}/<index>`); `_trk` is a
> per-recipient HMAC token carried in merge data, so ONE batch still yields
> per-recipient attribution; destinations live in `cmp-run.tracked_links`
> and are resolved by index server-side (no open redirect). Events dedupe on
> `trk:<recipient>:<kind>:<idx>`; `opened`/`clicked` run counters count
> unique recipients. The runner now materializes recipient rows BEFORE the
> batch (they carry person/crm-contact/customer resolved by email — Phase 5's
> `crm-activity` tie-in logs send, first open, first click on contact-matched
> recipients). If the MTA later gains native tracking, `ingestWebhook`
> already maps `opened`/`clicked` — switch off the injection and nothing
> downstream moves. Verified by a 19-check smoke (pure instrumentation +
> live pixel/redirect/dedupe/tamper + activity + `/api/persons` gating); an
> MTA-connected `_trk` send is still unexercised (`MTA_BASE_URL` blank).
>
> **Status update (2026-08-09): Phases 2–3 built** under the email-program
> umbrella (M4 — see `email-program/00-overview-and-roadmap.md`): audience
> resolver + `resolveMembers`, campaign runner (`runCampaign`/`cancelCampaign`,
> failure ledger), `campaign-cron-tasks.js` (due sweep + report poll —
> `CAMPAIGNS_CRON_ENABLED` finally consumed), the HMAC-verified public
> `/api/cmp/webhook` receiver, `syncRun` report pull, and the audiences /
> composer / runs pages. Verified by API smoke (resolver dedupe, runner
> failure path, webhook 401 gate, cancel); an MTA-connected send is still
> unexercised — `MTA_BASE_URL` is blank in dev. One recorded bound: one MTA
> batch per run (multi-batch chunking deferred until an audience needs it).
>
> **Status (2026-08): 🔨 Phases 0–1 built.** Decisions from §8 were taken as
> recommended: `cmp-audience` behind a resolver interface, email-only with the
> channel seam kept, roles-based permissions, port 4019, tracking deferred to
> Phase 4. **Phases 2–6 are not started** — see §9.
>
> **Phase 0** — seven `cmp-*` content types, their api-provider descriptors, the
> Rutba-MTA client, the sending-identity lifecycle, and the `apps/content/campaigns`
> app shell (**:4019**) registered across all seven registration points.
>
> **Phase 1** — the template studio: GrapesJS + `grapesjs-preset-newsletter`,
> merge-key extraction/validation, server-side preview, transactional test-send,
> duplicate, and the templates list + editor pages.
>
> **What is verified:** Strapi boots with the schemas; all eleven routes resolve
> (403 = gated, not 404); the seeder registered everything (23 domains, 849
> methods, 4005 policies, 42 UP permissions = 7 CTs × 5 + 7 custom actions); the
> app builds with all six pages; and the pure render logic — merge-key
> extraction, substitution, missing-key reporting, UTM appending — passes 27
> targeted checks (`services/strapi/src/utils/template-render.js`).
>
> **What is NOT verified: GrapesJS mounting in a real browser.** React does not
> hydrate in the agent's browser pane — `apps/inventory/control`, untouched, fails
> identically — so the studio could not be exercised end to end. The imports
> resolve and the production build succeeds, and grapesjs is pinned to `^0.21.13`
> to satisfy the preset's declared `^0.21.2` peer, but **a human should open
> `/templates/<id>` once and confirm the canvas, blocks, and save round-trip.**
>
> **One deviation from this spec worth knowing:** §3 said the trust token would
> be "encrypted". It is stored `private: true` (stripped on serialize), matching
> how `marketplace-account` handles its API secrets — the column itself is not
> encrypted at rest. The repo has no key-management layer and inventing one for
> this was out of scope. The MTA does encrypt the SMTP password it holds
> (AES-256-GCM), and the ERP never stores that password at all.
>
> **A correction to an earlier status claim:** Phase 0 was first reported as
> "the app renders". That was wrong — what was actually observed was static SSR
> markup, which looks the same as a mounted component that is still loading. The
> hydration gap above was only found while verifying Phase 1.
>
> **Roadmap slot:** [`ROADMAP.md`](./ROADMAP.md) **1.4** (stream ⑤ Growth), with
> **0.6** (CRM saved-segment engine) as its hard dependency and **1.6**
> (tracked email-on-activity) as its follow-on.
>
> **Read first:** [`rightapp-gap-analysis/README.md`](./rightapp-gap-analysis/README.md)
> §Priority 1 — the original scoping. This spec supersedes it on three points
> (port, content-type prefix, tracking ownership); see §7.

---

## 0. Where the analysis lives

Four independent sources. They agree on the shape and disagree on nothing
material, but each covers a different slice:

| Source | What it gives us |
|---|---|
| [`docs/todo/rightapp-gap-analysis/`](./rightapp-gap-analysis/) — README §"Priority 1", `app-feature-map.md` rows RTMPLT/RMAILX | The scope decision: one app absorbing RTMPLT (templates) + RMAILX (campaign UI) + RIGHTMTA's campaign runner |
| `D:\Projects\RightApp\` — **RMAILX**, **RTMPLT**, **RIGHTMTA** | The *working legacy implementation*. Data model, wizard flow, runner loop, tracking pixel — all readable, all proven in production |
| `D:\Apps-reserch\App-Designs\02-CRM-Customer-Engagement*.md` | The **competitive/tender bar** — §5 (SQA Marketing Automation ITT) is the closest thing we have to a competitor feature checklist |
| `D:\Rutba\Rutba-MTA\` (`FUNCTION.md`, `API.md`) | The send engine, **already built**. Defines exactly what we must *not* rebuild — and the two things it explicitly refuses to own |

---

## 1. What already exists (do not rebuild)

### 1.1 Rutba-MTA — the send engine, done

`D:\Rutba\Rutba-MTA` already owns: sender registration + trust tokens, the
suppression gate (hard bounces/complaints go global), adaptive per-domain
reputation pacing (0/500/1500/3000/6000 ms), a priority queue (transactional
beats marketing), **templated batch send** (`POST /v1/send/batch` — one outbox
row per recipient, per-recipient suppression check), action interception with
per-recipient signed tokens, retry/backoff, IMAP bounce capture (DSN + ARF),
RFC 8058 one-click unsubscribe, per-batch live aggregate reports, and
HMAC-signed webhooks.

The API surface `apps/content/campaigns` will consume:

| Endpoint | Use |
|---|---|
| `POST /v1/senders`, `GET/PUT /v1/senders/me`, `POST /v1/senders/me/rotate-token` | one-time sender bootstrap per tenant sending identity |
| `POST /v1/send/batch` | the actual campaign send — subject/html/text with `{{merge}}` tags + `recipients[].data` + `actions[]` |
| `GET /v1/batches/:uuid/report` | live counters: total/queued/sent/bounced_hard/bounced_soft/suppressed/failed/pending/`actions_clicked`/`unsubscribed`/`complete` |
| `GET /v1/messages/:idOrUuid` | per-recipient drill-down + event history |
| `GET/POST/DELETE /v1/suppressions` | suppression list UI |
| webhook `sent`/`deferred`/`bounced`/`complained`/`failed`/`action_clicked`/`unsubscribed` | event stream into our own store |

### 1.2 What Rutba-MTA explicitly refuses to own

`FUNCTION.md:307–317` — this is the load-bearing bit, because it *is* our scope:

- **"Reusable saved template library → Caller app"** (template supplied inline per batch)
- **"Click / open tracking beyond pixel + action tokens → Out of scope for now"**

So: the template store, the audience store, the campaign object, the scheduler,
the merge-data assembly, and the analytics mirror are all ours. See §5 for the
tracking decision.

### 1.3 ERP platform pieces we can lean on

- **Cron:** `services/strapi/config/server.js` merges per-module task builders
  (`inventory-cron-tasks.js`, `social-cron-tasks`, `workflow-cron-tasks.js`,
  `hr-cron-tasks.js`), each behind its own `*_CRON_ENABLED` flag with
  configurable rules. A `campaign-cron-tasks.js` drops straight in.
- **Scheduled dispatch precedent:** `social-post` + the social publish cron
  (`* * * * *`) is the closest existing pattern to a campaign scheduler.
- **Workflow engine** (`workflow` CT + engine util) for approval-before-send, if wanted.
- **`notification-template`** exists but is a *different animal* — transactional,
  event-triggered, `trigger_event`-driven, single-recipient. Do **not** overload it.
  (And per the two-engines note, engine-owned rows must keep `trigger_event: 'none'`.)
- Contact data: `crm-contact`, `crm-lead`, `crm-activity`, plus `person`,
  `customer`, `address` from the contact-unification work.

### 1.4 The legacy implementation, decoded

**RMAILX campaign model** (`campaign-modal.component.ts:65`) — a 4-step wizard:

```js
{ name, folder, subject, from_email, from_name,
  tpid,          // template
  magtid,        // mail agent (sending identity)
  report_id,     // ← THE AUDIENCE: a saved CRM report
  mapping: {},   // report column → merge field
  src: 'RCRM', med: 'mail',
  schedule: { frequency, interval, start_ts, max_runs, max_failures,
              next_run_ts, last_run_ts, run_count, failure_count,
              schedule_state, job_status, last_run_state },
  status }
```

Wizard steps: `0` info (template + agent + subject/from) → `1` audience (pick
saved report) + field mapping → `2` schedule (one-time *or* recurring) → `3` done.
Partial-update actions: `mail.campaign.new` / `upd.info` / `upd.mapping` /
`upd.schedule`; lifecycle actions `start` / `pause` / `stop` / `del`.

**The merge-field contract** (`common-data.service.ts:21`) was a fixed 21-slot
staging schema: `EMAIL`, `PERSON_ACNUM/ACNAME`, `BUSINESS_ACNUM/ACNAME`,
`JOB_TITLE`, `ID_COUNTRY/COUNTRY_NAME`, `ID_REGION/REGION_NAME`,
`ID_CITY/CITY_NAME`, `CUSTOM1..CUSTOM9`. Any report column could be mapped into
any slot. **Worth copying** — a fixed slot set is what makes a template reusable
across audiences. Rutba should widen it (named keys, not `CUSTOM7`) but keep the
principle: audiences declare which merge keys they can fill, templates declare
which they need, and the composer validates the intersection.

**RIGHTMTA campaign runner** (`campaign/start.js`) — spawned per campaign via
`GET /mta/campaign/:clientid/:campaignid`, then a serial `do…while`: pull next
recipient off the queue → sleep by agent reputation score → register one
message. **Rutba-MTA's `/v1/send/batch` replaces this entire loop** (pacing,
suppression, and reputation are already inside it). We only need chunked
submission for large audiences.

**Tracking** (`RMAILX/src/server/routes/tracking.js`) — a 1×1 GIF at
`/email/open/:id.gif` flipping a read flag. Plus a static `unsubscribe/` page pair.

**Template studio** (RTMPLT) — **GrapesJS 0.16 + `grapesjs-preset-newsletter` +
`gjs-get-inlined-html`**, with Mustache (`{{var}}`) rendering server-side, and
per-template flags `IS_TRACKING_ENABLED` / `APPEND_IN_LINKS` (UTM append) and
folder organisation. GrapesJS is still maintained and still the right pick.

### 1.5 The competitive bar (App-Designs §5 — SQA Marketing Automation)

What a real 2026 marketing-automation buyer asked for, in their words:
two-tier no-code branded email authoring; responsive templates + cross-client
preview; **auto-deploying A/B test** (test on a sample, auto-send the winner);
event/behaviour/score-triggered **nurture journeys** with drag-drop branching;
landing pages / forms / dynamic CTAs; **lead scoring**; **Account-Based
Marketing (first-class account object)**; social scheduling; **cookie-based
cross-channel identity stitching**; a deliverability suite (opt-in, bounce,
unsubscribe, spam/link check); AI campaign optimisation.

Two of those are *build-shaping* rather than features (the research doc flags
both): the **first-class Account object** and **cookie identity-stitching**
belong in the shared consent/identity layer, not bolted onto the email module.

MVP parity: we clear authoring, responsive templates, deliverability, and
scheduling on day one (MTA does the hard half). We do **not** clear A/B,
journeys, scoring, landing pages, or ABM — those are §6 Phase 3.

---

## 2. Blocking dependency — the audience engine (ROADMAP 0.6)

**This is the one thing that can't be worked around, and it isn't built.**

The legacy design made an audience a *saved CRM report* (`report_id`) — Right
CRM's report builder (pick columns across contact/company/activity/lead, rich
filters, save into folders) doubled as the segmentation engine. Rutba has no
equivalent: `crm-contact` is `name/email/phone/company/address/notes`,
`crm-activity` is `subject/type/date/description/contact`. There is no saved
view, no filter store, no segment.

Two ways forward — **decision needed** (§8):

**(A) Build the saved-segment engine first (ROADMAP 0.6, "M").**
A `crm-segment` CT holding a filter tree + column selection over
contact/lead/customer/person, with a resolver service returning rows. Campaigns
then reference a segment. This is the legacy architecture, it also feeds the CRM
dashboard and 1.6 tracked-email, and it's the honest answer.

**(B) Ship a campaign-local audience first.**
`cmp-audience` with (i) a static uploaded/CSV list, (ii) a saved filter JSON over
`crm-contact`/`customer` only, resolved by a service inside the campaigns module.
Migrate to `crm-segment` later behind the same resolver interface.

Recommendation: **(B) now with the resolver interface designed for (A)**, so
campaigns isn't blocked on a CRM-wide engine, but nothing has to be thrown away.
The resolver contract is `resolve(audience) → [{ email, mergeData:{...} }]`;
whether it reads a filter JSON or a `crm-segment` is an implementation detail.

---

## 3. Content types to build

Prefix: **`cmp-`**, not the `mail-` the gap-analysis doc proposed. Rationale: the
market-strategy doc puts **WhatsApp commerce** on the same roadmap and calls
campaigns its sibling; `med:`/channel is already in the legacy model. `mail-*`
would need renaming the first time we add SMS or WhatsApp. (Deviation from
`rightapp-gap-analysis/README.md` §Priority 1 — recorded in §7.)

| CT | Key fields |
|---|---|
| `cmp-template` | `name`, `folder`, `subject`, `body_html`, `body_text`, `design_json` (GrapesJS state), `merge_keys[]` (declared requirements), `tracking_enabled`, `append_utm`, `status`, `preview_thumb` |
| `cmp-audience` | `name`, `source` (static/filter/segment), `filter_json`, `segment` (rel, future), `merge_mapping` (source column → merge key), `member_count`, `last_resolved_at` |
| `cmp-campaign` | `name`, `channel` (email\|sms\|whatsapp), `template` (rel), `audience` (rel), `sending_identity` (rel), `from_email`, `from_name`, `subject_override`, `utm` (source/medium/campaign/content), `schedule_*` (frequency, interval, start_at, next_run_at, max_runs, max_failures), `status` (Draft/Scheduled/Running/Paused/Completed/Failed/Cancelled), `owners` |
| `cmp-run` | one per execution: `campaign` (rel), `batch_uuid` (MTA), `started_at`, `finished_at`, `state`, counters mirrored from the MTA batch report, `error` |
| `cmp-recipient` | `run` (rel), `contact`/`customer` (rel, nullable), `email`, `merge_data` (json), `message_uuid`, `status`, `sent_at` |
| `cmp-event` | `recipient` (rel), `type` (sent/deferred/bounced/complained/failed/action_clicked/unsubscribed/opened/clicked), `occurred_at`, `payload` |
| `cmp-sending-identity` | `name`, `from_email`, `mta_sender_id`, `trust_token` (encrypted), `webhook_secret`, `is_default` — the `magtid`/mail-agent equivalent |

`cmp-recipient` is the row that lets us attribute anything. It's also the volume
table — index `(run, status)` and plan retention early.

---

## 4. Backend work (services/strapi + api-provider)

1. **MTA client service** — thin wrapper over `X-Trust-Token` HTTP calls, base
   URL from env. **Note the timeout trap:** a wedged MTA must not hang a request;
   bound every call at the call site.
2. **Sender bootstrap** — register a `cmp-sending-identity` against
   `POST /v1/senders`, store the trust token encrypted, expose rotate. First call
   on a fresh MTA DB needs no auth and bootstraps admin — handle that path once.
3. **Audience resolver** — `resolve(audience) → [{email, mergeData}]`, paginated,
   deduped by email, with a `count()` used by the composer for "N recipients".
4. **Template renderer** — merge-key extraction + validation against the
   audience's mapping, inline-CSS export, test-render with sample data.
5. **Campaign runner service** — `startRun(campaign)`: resolve audience → chunk
   into `POST /v1/send/batch` calls (chunk size configurable; MTA handles pacing)
   → create `cmp-run` + `cmp-recipient` rows → store `batch_uuid`. Idempotent and
   resumable: a re-run must not double-send an already-sent recipient.
6. **Webhook receiver** — public route, HMAC-SHA256 verify with `timingSafeEqual`
   against `X-Mailer-Signature`, then write `cmp-event`, update `cmp-recipient`,
   and (for 1.6) write a `crm-activity`. Must be idempotent — MTA retries 6×.
7. **Report poller** — pull `GET /v1/batches/:uuid/report` on a cadence to
   backfill counters the webhook may have missed; mark `cmp-run` complete.
8. **`campaign-cron-tasks.js`** — due-campaign sweep (start runs whose
   `next_run_at` has passed, advance recurrence, honour `max_runs`/`max_failures`),
   plus the report poller. Wire into `config/server.js` behind
   `CAMPAIGNS_CRON_ENABLED`, matching `inventory-cron-tasks.js`.
9. **Test-send** — send to N addresses without creating a run.
10. **Suppression + unsubscribe UI passthrough** — list/add/remove via MTA.

**api-provider descriptors** (`packages/api-provider/api/cmp-*.js`) for every CT
and custom route. Non-negotiables from prior burns: `method:` is **mandatory** on
mutations or they silently become GETs; custom-route `action` must equal the
handler name; verbs must be on the api-pro whitelist or the seeder skips them and
you get a 403; author `scope` per method. Seeding does **not** run at boot — after
adding actions, `npm run seed -- --only=api-provider,up-permissions`.

---

## 5. The open/click tracking gap — decide explicitly

Rutba-MTA says pixel + action tokens only; everything richer is "out of scope for
now". Campaign reporting needs opens and link clicks. Three options:

- **(a) Extend Rutba-MTA** with an open pixel + link-rewrite click tracker,
  emitting `opened`/`clicked` webhooks. Cleanest — tracking lives with sending,
  and every caller benefits. Cost: a change to an external repo with its own
  release process.
- **(b) Track in `apps/content/campaigns`** — inject our own pixel/redirect URLs into the
  HTML before handing it to MTA, serve `/t/open/:token.gif` and `/t/click/:token`
  ourselves. Fastest, no external dependency, but splits attribution across two
  systems and needs a public endpoint on the ERP.
- **(c) Wait for `rutba-analytics`** (ROADMAP Priority 3) — the RANALYTICS port
  already plans a standalone tracker serving `script.js` + `track.png` and POSTing
  events into CRM. Correct long-term home; too far out to gate 1.4 on.

Recommendation: **(a)**, with (b) as the fallback if the MTA change stalls. The
UTM/`append_utm` half is ours regardless — link rewriting for UTM happens at
render time in the template service.

---

## 6. The app — `apps/content/campaigns`

**Port `4019`.** (The gap-analysis doc says `:4018`; that is stale — `:4018` is
`apps/admin/seed` and `:4020` is `services/core` per `scripts/rutba_apps.sh:134`.)

Next.js pages app, same skeleton as `apps/inventory/control` (`components/Layout|Navigation|Sidebar`,
`pages/_app.js`, `pages/auth/callback.js`, `src/styles/globals.css`).

Screens:

| Page | Content |
|---|---|
| `index` | dashboard — recent runs, sends/opens/clicks/bounces, suppression count |
| `templates` | folder tree + list, duplicate, preview |
| `templates/[id]` | **GrapesJS studio** (`grapesjs-preset-newsletter` + inline-HTML export), merge-key palette, test-send, desktop/mobile preview |
| `audiences` | list + member counts |
| `audiences/[id]` | filter builder / CSV upload, merge mapping, sample preview |
| `campaigns` | list with status + schedule filters, start/pause/stop/delete |
| `campaigns/[id]` | the 4-step composer (info → audience+mapping → schedule → review) and, once run, the delivery report |
| `runs/[id]` | per-recipient grid with status + event drill-down |
| `settings` | sending identities, MTA connection health, suppression list |

**Registration checklist** (miss one and it silently doesn't appear):
1. `packages/shared/lib/roles.js` — `APP_URLS` + `VALID_APP_KEYS` + `APP_META`
2. `pages/auth/callback.js` re-exporting `@rutba/shared/components/AuthCallback`
3. `packages/api-provider/config/domains.json` — domain key + `campaigns_admin/manager/staff`
4. `scripts/rutba_apps.sh` — `RUTBA_SERVICES` + `RUTBA_SVC_CMD` + `RUTBA_SVC_DESC` + `RUTBA_SVC_PORT`
5. root `package.json` dev/start/build scripts, `.env.*` (`CAMPAIGNS__PORT`,
   `NEXT_PUBLIC_CAMPAIGNS_URL`), `scripts/js/env-config.js` `GLOBAL_VARS`,
   Dockerfile + compose, `dev-start.bat`
6. **Full Strapi restart** after adding the URL — CORS is baked at boot; a
   hot-reload leaves the new origin blocked and surfaces as a bogus `Invalid token`
7. `PrimeReactProvider` in `_app.js`; enums via `EnumSelect` (never hardcode lists)

---

## 7. Deviations from `rightapp-gap-analysis/README.md` §Priority 1

| Doc says | This spec says | Why |
|---|---|---|
| `apps/content/campaigns` at **:4018** | **:4019** | :4018 is `apps/admin/seed` |
| `mail-template` / `mail-audience` / `mail-campaign` / `mail-send-log` | `cmp-*`, plus `cmp-run` / `cmp-recipient` / `cmp-event` / `cmp-sending-identity` | multi-channel from the start; runs and recipients need to be first-class for attribution and resume |
| "reuse CRM segmentation §5" for audiences | CRM segmentation **does not exist** — ship `cmp-audience` behind a resolver interface | unblocks 1.4 without waiting on 0.6 |
| "MTA already owns … click interception" | MTA owns **action-token** clicks only; generic click/open tracking is explicitly out of scope | `FUNCTION.md:317` |

---

## 8. Decisions needed before coding

1. **Audience source** — (A) build `crm-segment` first, or (B) `cmp-audience` now
   behind a resolver interface? *(Recommend B.)*
2. **Tracking** — extend Rutba-MTA (a), track locally (b), or defer to
   `rutba-analytics` (c)? *(Recommend a, fallback b.)*
3. **Channels in v1** — email only, or SMS/WhatsApp scaffolding from day one?
   Affects whether `cmp-campaign.channel` drives real adapters or is a stub.
   *(Recommend: email only, but keep the `channel` field and the adapter seam.)*
4. **Approval before send** — wire the workflow engine into `Draft → Scheduled`,
   or leave it to role permissions? *(Recommend: roles now, workflow later.)*
5. **Port 4019** confirmed?

---

## 9. Phasing

| Phase | Contents | Size |
|---|---|---|
| **0 — Foundations** ✅ | `cmp-*` content types + descriptors + policies, MTA client service, sending-identity bootstrap, app registration (§6 checklist), empty app shell | **M** |
| **1 — Template studio** ✅ | GrapesJS editor, folders, merge-key declaration + validation, inline-CSS export, test-send, preview | **M** |
| **2 — Audiences + composer** | `cmp-audience` (CSV + filter over crm-contact/customer), resolver, merge mapping, 4-step composer, one-time send via `/v1/send/batch` | **M** |
| **3 — Scheduling + reporting** | `campaign-cron-tasks.js` (recurrence, max_runs/max_failures), webhook receiver + HMAC verify, report poller, run/recipient grids, delivery dashboard, suppression UI | **M** |
| **4 — Tracking** ✅ | §5 decided as (b) local — opens + link clicks via `{{_trk}}` pixel/redirect, UTM append (Phase 1), open/click reporting on run + recipient grids | **S–M** |
| **5 — CRM tie-in (ROADMAP 1.6)** ✅ | campaign send / first open / first click → `crm-activity` on contact-matched recipients; recipients carry person/contact/customer | **S** |
| **6 — Automation (competitive parity)** | A/B with auto-deploy winner, nurture journeys, lead scoring, landing pages, ABM account object, identity stitching | **L** — separate roadmap item, not 1.4 |

Phases 0–3 are the ROADMAP 1.4 deliverable. Phase 6 is the §1.5 competitor gap
and should be scoped on its own once 1.4 is in users' hands.
