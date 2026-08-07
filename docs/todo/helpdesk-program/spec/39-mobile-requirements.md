# 39 — Mobile Requirements

[← 38 UI/UX Specifications](38-ui-ux-specifications.md) · [Index](00-index.md) · Next: [40 Future Roadmap](40-future-roadmap.md)

---

## 39.1 Purpose

Define what works on a phone, for whom, and where a native app is genuinely required rather than
assumed.

## 39.2 Who is actually mobile

| Audience | Mobility | Priority |
|---|---|---|
| **Customers** | Almost entirely mobile | **Highest** — in Pakistan, mobile is the primary internet device for most customers |
| **Employees** (warehouse, shop floor, drivers, field staff) | Frequently away from a desk | **High** — reporting a broken scanner from the warehouse floor |
| **Field-service agents** | Entirely mobile | High |
| **Desk agents** | Deskbound by definition | Low — occasional check on the move |
| **Managers** | Mixed | Medium — approvals and breach alerts while away |

This ordering drives everything below. The customer portal and the employee request flow are
mobile-first; the agent workspace is a dense keyboard-driven desktop tool that should be
*viewable* on a phone, not rebuilt for one.

## 39.3 Responsive web first

**Decision: responsive web for everything at launch. No native app in the initial scope.**

Rationale: it covers every audience immediately with no install friction, no app-store cycle, and
one codebase. A native app is justified only by capabilities the web cannot provide — reliable
background push, deep offline, and hardware integration — and only once usage proves the demand.
Building one first would be spending the module's scarcest resource on the least-proven need.

| Surface | Mobile target |
|---|---|
| Customer portal | **Mobile-first** — designed for the phone, enhanced for desktop |
| Employee requests (ESS) | **Mobile-first** |
| Public KB | Mobile-first |
| Agent workspace | Desktop-first, tablet-usable, phone-viewable for triage |
| Manager dashboard | Responsive; approvals and breach list fully usable on a phone |
| Admin/configuration | Desktop only — no attempt to make workflow authoring work on a phone |

## 39.4 Mobile-first requirements

**Layout.** Single column; sticky action bar; bottom-anchored primary actions within thumb
reach; collapsible sections; no horizontal scroll at 320px.

**Touch.** Targets ≥ 44×44px with ≥ 8px spacing; swipe to navigate the thread; pull to refresh;
no hover-dependent affordances (the tablet/mobile preset disables hover states entirely).

**Forms.** Correct input types so the right keyboard appears (`email`, `tel`, `number`);
autocomplete attributes; minimal required fields; progressive disclosure for long catalog forms;
**draft persistence across app switching** — a phone user answering a call mid-form must not lose
their text.

**Camera.** Direct capture for attachments — the single most valuable mobile capability here. A
photo of the damaged item, the broken device, the incorrect delivery. Client-side compression
before upload (a 12MP photo over a mobile connection is a failed upload), with EXIF stripped
([25 §25.5](25-file-management.md)) and progress shown.

**Performance on real networks.** Target 3G, not office wifi: initial load < 3s on a simulated 3G
connection; images lazy-loaded and responsive; payloads minimal; retry on transient failure.
Pakistani mobile connectivity outside major cities makes this a functional requirement, not an
optimisation.

## 39.5 Agent mobile (triage, not work)

An agent on a phone can: see their queue and breaching tickets, read a thread, reply with text,
apply a macro, assign, transition, and add an internal note.

They cannot reasonably: use the full context panel, merge/split, bulk-operate, author workflows,
or build automation. Those are hidden rather than shrunk — a cramped, mis-tappable merge dialog
is worse than no merge dialog.

## 39.6 Notifications

Web push where the browser supports it (Chrome on Android covers most of the audience; iOS Safari
requires the site be added to the home screen, which is a real limitation to plan around rather
than wish away). Email and WhatsApp remain the reliable mobile channels — which is another reason
the WhatsApp channel matters more here than it would in other markets.

Push subscription is opt-in, per device, revocable, and never a prerequisite for receiving
notification another way.

## 39.7 Offline

Genuine offline sync is **out of scope**. What is in scope:

- Drafts persisted in local storage and restored after a connection drop.
- Clear offline indication rather than silent failure.
- Queued submission retried on reconnect, idempotency-keyed so a retry cannot double-submit.
- Cached read of the last-viewed ticket list.

Full offline ticketing implies conflict resolution on a shared, concurrently-edited aggregate —
a substantial subsystem with its own failure modes. The offline POS work in this codebase is
still undecided precisely because that problem is hard; Helpdesk should not casually take it on.

## 39.8 PWA

A manifest, an installable home-screen app, an app icon and splash, and a service worker for
static-asset caching and offline draft support. This delivers most of the *felt* benefit of a
native app — an icon on the home screen, fast launch — at a fraction of the cost, and it is the
right intermediate step before committing to native.

## 39.9 When native becomes justified

Revisit if and when: push notification reliability materially limits response times; field-service
agents need offline-first operation; barcode/QR scanning becomes central to ticket intake (the
barcode deep-link work is already on the roadmap); or remote support needs a mobile viewer.

Until one of those is real and measured, responsive web plus PWA is the correct answer.

## 39.10 Testing

Real devices, not only emulators: a mid-range Android (the realistic customer device), an iPhone,
and a tablet. Throttled 3G. Portrait and landscape. Screen reader on both platforms. Camera
capture, upload interruption and resume, and app-switch draft persistence.

---

## Acceptance criteria for this section

- [ ] Customer portal and employee request flow fully usable one-handed on a 375px phone.
- [ ] Camera capture works with compression, EXIF strip and progress.
- [ ] Drafts survive app switching and connection loss.
- [ ] Initial load < 3s on throttled 3G.
- [ ] Queued submissions are idempotent — a retry never double-submits.
- [ ] Agent triage set works on a phone; unsupported actions are hidden, not broken.
- [ ] PWA installable with a working service worker.
- [ ] Tested on real mid-range Android hardware, not only emulators.
