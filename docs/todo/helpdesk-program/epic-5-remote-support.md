# Epic 5 — Remote Support (device enrolment + remote control)

> Part of the [Helpdesk Program](00-overview-and-roadmap.md). Lets a helpdesk agent take a
> remote-control session on an enrolled device **from inside a ticket**, with explicit consent,
> a bounded session, and a full audit trail.
>
> Depends on Phase 2 (the `apps/sales/helpdesk` app + ticket detail screen). Independent of Phase 4.

Authored: 2026-08-08. **Status: NOT STARTED.** No remote-access capability exists anywhere in
the ERP today.

---

## Why this is an adapter seam, not a build

Rutba should **not** write a remote-desktop protocol. Screen capture, NAT traversal, relay
infrastructure, codec performance and platform-specific input injection are years of work with
a permanent security burden. The proven pattern in this codebase is the **provider adapter
seam** already used by digital payments (PK/US/EU/UK/ME adapters) and social providers: Rutba
owns the *entity model, authorisation, consent and audit*; a swappable adapter owns the
*transport*.

So: **Rutba owns the session record. A provider owns the pixels.**

### Candidate providers

| Provider | Model | Fit | Watch out for |
|---|---|---|---|
| **RustDesk** (self-hosted `hbbs`/`hbbr`) | Open source, self-hostable relay, own client | Strong — we already self-host on Hostinger VPS + the media file server | Client distribution to end-user machines; ID/password model needs wrapping for per-session tokens |
| **MeshCentral** | Open source, self-hosted, web-based, agent-per-device | Strong — browser-native (no agent install for the *agent* side), has device inventory, scripting, and its own consent prompts | Heavier server; overlaps our device model, so map carefully rather than duplicating |
| **Apache Guacamole** | Clientless RDP/VNC/SSH gateway in the browser | Good for **servers and LAN devices**, not roaming laptops | No NAT traversal — needs reachable hosts or a VPN; not an attended-support tool |
| Commercial (TeamViewer / AnyDesk / Splashtop) | SaaS | Fastest to integrate | Per-seat cost, tenant data leaves our infra, weakens the SaaS story |

**Recommendation: MeshCentral first** (self-hosted, agent-based, browser-side viewer, built-in
consent prompt and session recording — the shortest path to a *complete* attended-support
flow), with the adapter seam kept honest by implementing **Guacamole** second for
server/LAN/SSH targets. RustDesk stays a viable swap if MeshCentral's licensing or footprint
becomes a problem.

> Decide this before writing the adapter — the CT shape below is provider-neutral precisely so
> the decision can be deferred to implementation, but it should not be deferred past it.

---

## Data model

### `helpdesk-device`

The remotely-supportable endpoint. Deliberately **separate from `hr-asset`**: an asset is a
*finance/ownership* record (purchase value, depreciation account, assignment history), while a
device is a *technical* record (hostname, OS, agent status). They link, they don't merge —
and plenty of supportable devices are not company assets (a supplier's terminal, a
customer's POS, a BYOD laptop).

```
name, hostname, device_kind (laptop|desktop|server|pos_terminal|mobile|tablet|kiosk|other),
os, os_version, serial_number, mac_addresses (json), last_seen_at,
enrolment_status (pending|enrolled|revoked), enrolment_token_hash,
agent_version, agent_online (boolean),
provider (meshcentral|guacamole|rustdesk|none), provider_device_id,
unattended_allowed (boolean, default false),
branch (rel), asset (rel → hr-asset, optional), employee (rel → hr-employee, optional),
owners (manyToMany users — row-level ownership per convention)
```

### `helpdesk-remote-session`

One row per remote-control attempt — **created before the session starts, closed after**, so
an abandoned or refused session is still on the record.

```
ticket (rel → contact-ticket, required),
device (rel → helpdesk-device, required),
agent (rel → users-permissions.user),
mode (attended|unattended|view_only|file_transfer|terminal),
status (requested|consent_pending|consent_denied|active|ended|expired|failed),
requested_at, consent_at, consent_by (rel), started_at, ended_at, duration_seconds,
consent_method (in_app|verbal_logged|policy_unattended),
provider, provider_session_id, recording_url, recording_retention_until,
end_reason (agent_ended|user_ended|timeout|error|revoked),
actions_summary (json), notes
```

### `helpdesk-remote-policy`

Per-desk / per-branch / per-device-kind rules — the thing that keeps this from becoming
unbounded access.

```
name, scope (desk|branch|device_kind|device), scope_ref,
allow_unattended (boolean), require_ticket (boolean, default true),
max_session_minutes, allowed_modes (json),
record_sessions (boolean), recording_retention_days,
allowed_roles (json), allowed_hours (json), is_active
```

---

## Flow (attended — the default)

1. Agent opens a ticket in `apps/sales/helpdesk`. The ticket's requester resolves to a person /
   employee; their enrolled devices show in a **Devices** panel (`agent_online` state visible).
2. Agent clicks **Request remote session**, picks a mode. Rutba creates a
   `helpdesk-remote-session` in `consent_pending` and fires
   `helpdesk.remote.consent_requested`.
3. The device user gets an explicit consent prompt — **who** is asking, **which ticket**,
   **what mode**, **how long**. Consent is affirmative and per-session; there is no implicit
   consent from having filed the ticket.
4. On accept: status → `active`, `consent_at`/`consent_by` stamped, the adapter mints a
   **short-lived, single-use** connection token, and the agent's viewer opens. On decline:
   `consent_denied`, terminal, and it stays on the record.
5. Session runs under a hard cap (`max_session_minutes`). The device user can end it at any
   moment from a persistent, non-dismissible indicator. Ending is instant and unilateral.
6. On end: `ended_at`, `duration_seconds`, `end_reason`, optional recording URL and its
   retention date. A `work-item-activity` row (`kind: 'note'`, summary "Remote session — 14
   min, attended") lands on the ticket timeline, and the session summary is appended to the
   thread as an **internal note** by default.

### Unattended

Only where `helpdesk-remote-policy.allow_unattended` **and**
`helpdesk-device.unattended_allowed` are both true — for servers, kiosks and POS terminals,
not for personal machines. Still requires a ticket when `require_ticket` is set (the default),
still recorded, still notified to the device owner after the fact. Enabling unattended access
on a device is itself an audited action requiring a `helpdesk_admin` role.

---

## Security posture

This is the highest-privilege capability in the ERP: it grants an employee live control of
someone else's machine. The controls are not optional extras — they are the feature.

1. **Consent is per-session and affirmative.** No standing consent, no consent inherited from
   filing a ticket, no pre-ticked boxes. Attended is the default; unattended is an explicit
   per-device grant.
2. **Every session is a row.** Requested, denied, expired and failed sessions are recorded, not
   just successful ones. A gap in the record is itself detectable.
3. **Ticket-bound by default.** `require_ticket` means access is always tied to a stated
   reason a requester can read.
4. **Tokens are short-lived, single-use, and scoped** to one device + one session. Provider
   credentials never reach the browser; the adapter mints per-session tokens server-side.
5. **Visible, unilateral termination.** A persistent indicator on the controlled device, and
   the user can end the session without the agent's cooperation.
6. **Recording is a policy, disclosed up front.** If `record_sessions` is on, the consent
   prompt says so before consent is given, and recordings carry a retention date that is
   actually enforced by a sweep.
7. **Role-gated and least-privilege.** `view_only` should be the default mode offered for most
   desks; full control, file transfer and terminal are separately grantable.
8. **Notify the owner.** The device's employee/owner is notified on session start and end,
   including for unattended sessions.
9. **Legal/compliance.** Enrolment must present the monitoring notice; retention of recordings
   is personal data and belongs in the tenant's privacy policy. This needs a review before the
   first non-Rutba tenant uses it.

---

## Enrolment

- Admin generates a **one-time enrolment token** per device (hash stored, plaintext shown
  once).
- The device runs the provider agent installer with the token; the adapter calls back to
  Rutba, which flips `enrolment_status` to `enrolled` and records `provider_device_id`.
- Revocation flips to `revoked`, tells the provider to unenrol, and kills active sessions.
- Bulk enrolment for fleets follows the existing bulk-import pattern
  (resolve → preview → process) rather than a bespoke flow.
- **Distribution**: the desktop agent is packaged per-OS. `Rutba-Social-Poster`
  (`D:\Rutba\Rutba-Social-Poster`) is the in-house precedent for shipping an Electron desktop
  app if a Rutba-branded wrapper is wanted over the raw provider agent — but ship the provider
  agent plain first.

---

## Screens (in `apps/sales/helpdesk`)

1. **Devices** — inventory, online state, last seen, enrolment status, linked asset/employee,
   enrol/revoke.
2. **Ticket → Devices panel** — the requester's devices, one-click request session.
3. **Session viewer** — embedded provider viewer, session timer, mode indicator, end button.
4. **Session log** — every session with filters by agent, device, ticket, date; the audit
   surface a manager or auditor actually opens. Read-only, never editable.
5. **Remote policy admin** — the policy CT above.

---

## Phasing within the epic

| Step | Scope | Value on its own |
|---|---|---|
| 5a | `helpdesk-device` + enrolment + inventory screen, **no remote control** | A real device inventory linked to tickets and assets — useful immediately, and it is the prerequisite for everything else |
| 5b | Adapter seam + `helpdesk-remote-session` + attended `view_only` sessions | Screen-viewing support with full consent + audit |
| 5c | Full control, file transfer, terminal; recording + retention sweep | Complete attended support |
| 5d | Unattended access + policy engine | Servers, kiosks and POS terminals |
| 5e | Second adapter (Guacamole) for server/LAN/SSH targets | Proves the seam; covers infrastructure support |

Ship 5a even if the remote-control decision stalls — the inventory has standalone value and
carries no security exposure.

---

## Open questions

1. **Provider choice** — MeshCentral vs RustDesk vs Guacamole (see table). Blocks 5b.
2. **Where does the relay run?** The Hostinger VPS already hosts rutba.pk; a relay is
   bandwidth-heavy and its outage profile differs from the ERP's. Likely a separate host.
3. **Multi-tenant isolation** — under the H2 SaaS work, one tenant's agent must never see
   another tenant's device. Provider-side isolation (separate groups/instances per tenant)
   needs to be verified, not assumed, before this is offered to tenant #2.
4. **Does `helpdesk-device` supersede part of `hr-asset`?** Recommendation above is no — link,
   don't merge — but confirm with whoever owns the asset module.
5. **Recording storage** — Rutba-Media-FileServer with signed URLs and its visibility
   primitives is the obvious home, but session recordings are larger and more sensitive than
   product images. Confirm capacity and access model.
