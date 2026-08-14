# Session carry-over — consolidated 2026-08-11

<!-- verify-docs: historical -->
<!-- A dated session handoff. It records worktree branches not yet merged into dev
     and machine-local Claude paths; both are true as of 2026-08-11 and are not
     meant to track the tree. -->

Every Claude session store on this machine was scanned (440 transcripts, all repos,
CLI + desktop app + worktrees) and mined for unfinished work. This file is the
consolidated result, grouped by theme. It is meant to survive the deletion of the
raw transcripts.

**Confidence note:** items are dated. Anything from June/July may already be done —
the mined signal is "the session ended saying this was outstanding", not a live check.
Group 1 is the exception: it was verified against the working tree today.

---

## 1. Stranded code — verified live today ⚠️

This is the only group with real code at risk. 12 git worktrees still exist under
`D:\Rutba\ERP\.claude\worktrees\`, and several hold work that never reached `dev`.

### 1a. Worktree commits not merged into `dev`

| Worktree | Branch | Commit |
|---|---|---|
| `amazing-sanderson-bf725c` | `claude/amazing-sanderson-bf725c` | `ccb4ea3` hr: matrix reporting lines, drag-to-reparent, cutover gate — **13+ files** incl. `hr-reporting-lines` API, `OrgChart.js` (+272), hr-employee controller (+238) |
| `modest-chaplygin-c5e1db` | `claude/modest-chaplygin-c5e1db` | `4b4efe3` crm: typed activity timeline + saved-segment engine — new `crm-activities` / `crm-segments` APIs, `docs/todo/crm-core-buildout.md` (+267) |
| `practical-einstein-51edee` | `claude/practical-einstein-51edee` | `07405b0` api-pro: seed `submit*` endpoints, stop core 500ing on a scalar populate — `seeder.js`, `up-permissions-seed.js`, `rutba-core/src/documents/index.js` |
| `serene-yonath-2a1b69` | `claude/serene-yonath-2a1b69` | `c4c3080` roadmap: multi-region fiscalization — `docs/todo/fiscalization-multi-region.md` (+155), ROADMAP 0.1 |

Roadmap item 0.1 (fiscalization) is flagged **legally mandatory** — the phased PK
mandate completed 31 Dec 2025.

### 1b. Uncommitted changes inside worktrees

| Worktree | State |
|---|---|
| `admiring-gates-f25116` | **Staged, uncommitted**: `EnumSelect.js` + `use-enum-values.js` moved `rutba-cms` → `packages/pos-shared`, 5 pages rewired. Follow-up flagged: with `none` selectable, neither editor exposes `event_name`, so a newly-created `none` row is unroutable by either engine. |
| `quirky-mcclintock-6a1c13` | 77 real diff lines — sale-order controller/notification/integration-sync, return state machine, marketplace-account; `sale-order/lifecycles.js` **deleted** |
| `cranky-lovelace-78cd75` | 15 real diff lines in `sale-order.js` controller |
| `magical-wilbur-94c504` | untracked `docs/todo/offline-pos-options.md` (the offline-POS options doc) |
| `amazing-yalow-687a53`, `awesome-heyrovsky-4e7327` | ~280 "dirty" files each = autocrlf scaffolder noise, 0 real diff lines — ignore |

### 1c. Main repo `dev`

9 modified + 1 untracked (`rutba-social/pages/videos.js`) — the video-studio /
social work in flight. Uncommitted at session start today.

**Action:** decide per worktree — cherry-pick to `dev`, or discard. Nothing should be
pruned until this group is resolved.

---

## 2. Deploy / restart / rebuild chores

Backend code that exists but is not live. Cheap to clear, easy to forget.

- **strapi-api-pro `dist/` rebuild** — `dist/` is what Strapi loads and it is gitignored (2026-08-05)
- **Strapi restart** for `force_closed` columns on registers (2026-08-04)
- **Strapi restart + reseed api-pro** for the `stock-alert` CT and new routes (2026-07-25)
- **rutba-marketplace rebuild** on `192.168.0.46` — `lib/strapi.js` is server-side, used by worker + API routes; pos-strapi only needs a restart (2026-08-04)
- **LAN box dev deploy still pending** — carries the social/backend change (2026-08-11)
- **Live MySQL migration + full `next build`** for warehouse→branch consolidation — never run on the live box (2026-07-18)
- **TrustList Strapi restart** — seat-guard, cms-group schema, billing changes (2026-08-11)

---

## 3. Rutba ERP — open programme work

- **Contact-entity unification** — Phase 1A + 1C.5 + 3.3 landed; **1B, 1C.1–1C.4, 1C.6, Phase 2, Phase 3 outstanding** (`docs/todo/contact-entity-unification.md`)
- **Accounting** — engine + completion-spec §1.2 gaps built except **3 frontend pages**
- **Helpdesk** — backend built, migrations applied, smokes green; **frontend (:4023) not started**
- **Video studio** — v2 plan in `docs/todo`, **M0 schema flagged urgent**
- **Documentation review** — a session ended mid-task with "write up findings review" still open (2026-08-11)
- **Payroll** — remaining items were listed as "what's next" and never closed out (2026-07-29)
- **Return workflow / sale-order staging** — both had explicit "deliberately deferred from this MVP" sections
- **HR org chart** — two items "still need a person", noted in commit body of `ccb4ea3` (see 1a)

---

## 4. TrustList — frontend-uplift roadmap

A 14-item ordered backlog was left mid-flight (2026-07-16). Resume phrase recorded in
that session: *"resume the TrustList frontend-uplift roadmap — next item in docs/todo/README.md"*, picking up at #1.

1. CMS review-moderation screen (approve/block/unflag)
2. Unified app shell & nav (shared sidebar + switcher) [Feature 24]
3. System email templates in CMS (reset_password / email_confirmation)
4. CMS taxonomy editor (linking, nested create, term-count lifecycle, merge)
5. Dashboard taxonomy suggestions → CMS approval
6. Richer public search cards
7. Promoted listings on category + ranking pages
8. Display-list review blocks (recent + promoted)
9. Home page depth
10. SEO: category pillar pages + sitemaps + JSON-LD
11. Listings analytics loop
12. CMS media library
13. Awards lifecycle Phase A — *needs design answers*
14. Monetization — *deferred last, provider-agnostic*

Also outstanding for TrustList:
- **Discovery 404** (Research Studio) — Trustlist-Intelligence backend missing `/api/research/feeds/*` routes
- **Intel stack VPS deploy** — was blocked mid-session, one command to hand off
- `type_template_style` relation — physically remove relation + APIs + populate refs
- First-edit `discardDraft` check — needs one real staff edit in CMS/researcher
- F54 "schedule a launch" seam not wired; makers→CRM + launch/digest comms deferred; F54/F55 runtime-unverified

---

## 5. Other repos

**Rutba Media FileServer** (2026-08-08)
- Phase 6 — async transcode, HLS ladder, storyboards, captions, player, signed playback URLs, per-title metadata
- Phase 7 — index-authoritative reads, cache rewrite, keyset pagination, listing, rebalance, tiering, scrub, sharding, telemetry
- Phase 8 + docs — S3 backend, FTP/SFTP, SSO/LDAP, multi-tenancy; SPEC/README drift

**Crawlers / Data Intelligence** (2026-07-12)
- Phase 0 — rebrand to Data Intelligence (UI + docs)
- Phase 1.2 — extraction quality (main-slice, stopwords, email/phone de-obfuscation)
- Phase 1.3 — name-spotting, page-type classification, term tagging
- Phases 2–7 — cascade, ingest, tier3 surface, enrich, submit, tests

---

## 6. Blocked on a decision from you

These are not code problems — they need an answer before anyone can proceed.

- **TrustList `has_features` is NULL** on default template style id 6, so every `features` block written across all Tech-Style listings renders nowhere. One-row change, flagged twice, scope has grown since first raised.
- **Stripe live-mode smoke test** — approved for production on manual + Stripe test mode; live mode needs one real-browser 3DS run that cannot be simulated.
- **Media transcription (5.x) + semantic search (5.7)** — blocked on choosing an external engine, not on code.
- **`ess.rutba.pk` public exposure** — Caddyfile block + `docker-compose.prod.yml` edge entry were deliberately held back pending your call, since `hr` is not exposed that way.
- **Awards lifecycle Phase A** (TrustList) — needs design answers.
- **X / Twitter account for rutba.pk is suspended** — an appeal draft was prepared but the outcome was never recorded (2026-08-10).

---

## 7. Where the sessions lived

For reference, in case something needs recovering before the transcripts go.

| Store | Size | Contents |
|---|---|---|
| `~/.claude/projects/` | ~520 MB | 28 project dirs, 391 transcripts. `d--Rutba-ERP` alone is 303 MB / 187 sessions |
| `~/.claude/archived-sessions/d--Rutba-ERP/` | 44 MB | 49 already-archived ERP sessions (May–Jul) |
| `~/.claude/projects/D--Rutba-ERP--claude-worktrees-*` | ~24 MB | 16 dirs, one per worktree session |
| `~/.claude/file-history/` | 24 MB | 1,986 file snapshots (edit undo history) |
| `~/.claude/tmp/`, `tasks/`, `plans/`, `shell-snapshots/` | ~22 MB | scratch, background-task output, saved plans |
| `AppData/Roaming/Claude/vm_bundles/` | **9.0 GB** | sandbox VM images — *not* sessions |
| `AppData/Roaming/Claude/{Cache,Code Cache,claude-code,claude-code-vm}` | ~1.2 GB | app runtime + Electron caches — *not* sessions |
| `AppData/Roaming/Claude/{claude-code-sessions,local-agent-mode-sessions}` | 4.7 MB | desktop-app session state, 333 files |
