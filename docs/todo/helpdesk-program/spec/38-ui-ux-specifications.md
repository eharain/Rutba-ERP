# 38 — UI/UX Specifications

[← 37 Database & Domain Model](37-database-and-domain-model.md) · [Index](00-index.md) · Next: [39 Mobile Requirements](39-mobile-requirements.md)

---

## 38.1 Purpose

Visual and interaction standards. Screen *structure* is [06](06-navigation-and-menus.md);
this is how it looks and behaves.

## 38.2 Two design targets

| | Agent app | Requester portals |
|---|---|---|
| Goal | Time-to-resolution | Reassurance |
| Density | High — dense rows, minimal chrome | Low — generous spacing |
| Vocabulary | Domain terms, status keys, SLA | Plain language, no jargon |
| Input | Keyboard-first | Touch-first |
| Information | Everything relevant, at once | Only what the requester needs |

**They must not share a table component.** Forcing one component to serve both produces a queue
too sparse for agents and a portal too dense for customers.

## 38.3 Technology

Next.js pages, Bootstrap 5 and PrimeReact, matching the existing Rutba apps.

**`PrimeReactProvider` is required at the app root** — its absence causes overlay crashes, a
known and repeated failure in this codebase. It is not optional and not something to add later.

Shared components live in `pos-shared`; the ESS/HR ticket UI consolidates there
([17 §17.2](17-employee-portal.md)).

## 38.4 Design tokens

**Status colours** — consistent across every surface:

| Status | Colour | Bootstrap |
|---|---|---|
| open | amber | `warning` |
| in_progress | blue | `primary` |
| waiting | grey | `secondary` |
| resolved | green | `success` |
| closed | dark grey | `dark` |
| cancelled | light grey | `light` |
| merged | purple | custom |

**Priority** — low grey · normal blue · high orange · urgent red.
**SLA** — ok green · at-risk amber · breached red · paused grey · indeterminate outline.

**Colour is never the sole carrier of meaning.** Every status and SLA state also has a label and
an icon. Around 8% of men have some colour-vision deficiency; a red/green SLA chip alone is
unreadable to them, and SLA state is the most consequential signal on the queue.

## 38.5 The internal/public distinction

The module's highest-consequence UI decision, specified in full at
[18 §18.4](18-agent-workspace.md). Summarised because it must not be diluted:

Persistent two-state composer control · different background and border in internal mode ·
send button names its audience ("Send to requester" / "Save internal note") · every internal
message in the thread labelled and visually distinct, not just the first · confirmation when
switching modes with text already typed · server-side validation regardless.

**Tenant branding must not be able to override these affordances** ([31 §31.8](31-settings.md)).

## 38.6 Component standards

**Tables.** Sticky header, hover state, selectable rows, configurable and persisted columns,
server-side sort/filter/paginate, virtualised beyond 100 rows, responsive collapse to cards below
768px, keyboard navigable, explicit empty state.

**Forms.** Labels above inputs (never placeholder-as-label — it disappears on focus and fails
screen readers), inline validation on blur, error text tied to the field, required marked,
disabled submit while pending with a spinner, unsaved-changes warning, autosaved drafts.

**Modals.** For focused decisions only. Escape and backdrop close (unless destructive),
focus-trapped, focus returned on close, mobile-friendly. **Never** for the ticket detail — it is
a page.

**Buttons.** One primary per view. Destructive actions are visually distinct and confirmed with
a typed confirmation for the irreversible ones. Loading state on the button itself.

**Toasts.** Success 3s auto-dismiss; errors persist until dismissed and carry an action.

## 38.7 States

| State | Treatment |
|---|---|
| Loading | Skeletons shaped like the content; never a full-page spinner that discards context |
| Empty (no data) | Explain what would appear and how to create it |
| Empty (filtered) | "No tickets match" + Clear filters |
| Error | Inline, actionable, with a retry and a correlation id |
| Stale | **Show cached data with a timestamp and a warning banner** — never replace present data with an error card |
| Partial | Render what loaded; mark what failed (e.g. context panel) |
| Offline | Banner; drafts preserved locally |
| Forbidden | "You don't have access to this desk" — not a crash or a redirect loop |

Stale-data-wins is an established convention in this codebase and matters most here: an agent
mid-conversation must never lose the thread because a background refresh failed.

## 38.8 Responsive

Breakpoints 576 / 768 / 992 / 1200 / 1400. Agent app is desktop-first, usable on tablet; the
ticket detail collapses the right rail into tabs below 992px. Portals are mobile-first. Touch
targets ≥ 44×44px. No horizontal scroll at any width.

## 38.9 Accessibility (WCAG 2.1 AA)

Keyboard reachable, visible focus, logical tab order · semantic HTML with ARIA only where
semantics fall short · form labels and error associations · 4.5:1 contrast for text, 3:1 for UI ·
live regions for async updates ("reply sent", "new message") · no colour-only meaning ·
`prefers-reduced-motion` respected · tested with a screen reader, not only with a linter.

## 38.10 Localisation

English and Urdu at launch. All strings externalised — no hardcoded UI text, and no hardcoded
enum labels (they come from `/enums/:name/:field` or the desk API). RTL-safe layout using logical
properties (`margin-inline-start`, not `margin-left`) so Urdu does not require a parallel
stylesheet. Locale-aware dates, numbers and currency. Bidirectional text handled where Urdu and
English mix in one message — which is the normal case in Pakistani business correspondence.

## 38.11 Performance in the UI

Initial JS < 300KB gzipped · route-level code splitting · virtualised long lists · debounced
search with cancellation · optimistic updates with rollback · lazy-loaded images with dimensions
reserved to avoid layout shift · CLS < 0.1 · LCP < 2.5s.

## 38.12 Writing

**Agent-facing:** precise domain terms. "SLA breached", "Awaiting Supplier".
**Requester-facing:** plain language, active voice, no jargon, no blame. "We're working on it",
not "Ticket status: in_progress". Errors say what happened and what to do next.

Never expose internal identifiers, stack traces, enum keys or system reasoning to requesters.

---

## Acceptance criteria for this section

- [ ] `PrimeReactProvider` present at every app root.
- [ ] Internal/public distinction implemented with all six defences and usability-tested.
- [ ] No status or SLA state conveyed by colour alone.
- [ ] Every list has a defined empty state.
- [ ] Stale-data-wins verified by failing a background refresh.
- [ ] WCAG 2.1 AA verified with a screen reader.
- [ ] Urdu RTL renders correctly, including mixed-direction text.
- [ ] No hardcoded enum labels anywhere in the frontends.
- [ ] Agent app usable on tablet; portals usable one-handed on a phone.
