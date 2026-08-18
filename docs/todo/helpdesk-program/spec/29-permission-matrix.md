# 29 — Permission Matrix

[← 28 Event System](28-event-system.md) · [Index](00-index.md) · Next: [30 Audit Logging](30-audit-logging.md)

---

## 29.1 Purpose

The exhaustive role × action grid. Roles are defined in
[04 Roles & Permissions](04-user-roles-and-permissions.md); this is the enforceable table.

## 29.2 Reading the matrix

| Symbol | Meaning |
|---|---|
| ✅ | Permitted |
| 🔶 | Permitted, scoped (own tickets / own desks / own branch / own team) |
| ⚙️ | Permitted if the desk or tenant setting enables it |
| ❌ | Denied |

Effective access is always `capability ∩ desk scope ∩ branch scope ∩ ownership`
([04 §4.4](04-user-roles-and-permissions.md)). A ✅ in this table means the *capability* exists;
it never overrides scope.

Roles: **Adm** `helpdesk_admin` · **Mgr** `helpdesk_manager` · **Agt** `helpdesk_staff` ·
**Apr** `helpdesk_approver` · **Emp** ESS employee · **Cus** `storefront_user` · **Sys**
`helpdesk_system` · **Anon** guest.

## 29.3 Tickets

| Permission | Adm | Mgr | Agt | Apr | Emp | Cus | Sys | Anon |
|---|---|---|---|---|---|---|---|---|
| `ticket.read` | ✅ | 🔶 desks | 🔶 desks | 🔶 on approval | 🔶 own | 🔶 own | 🔶 rule | ❌ |
| `ticket.create` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `ticket.create.own` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ⚙️ desk |
| `ticket.update` | ✅ | 🔶 | 🔶 | ❌ | ❌ | ❌ | 🔶 rule | ❌ |
| `ticket.transition` | ✅ | 🔶 | 🔶 workflow | ❌ | ❌ | ❌ | 🔶 rule | ❌ |
| `ticket.resolve` | ✅ | 🔶 | 🔶 | ❌ | ❌ | ❌ | 🔶 own-created | ❌ |
| `ticket.close` | ✅ | 🔶 | 🔶 | ❌ | ❌ | 🔶 own | 🔶 sweep | ❌ |
| `ticket.reopen` | ✅ | 🔶 | 🔶 | ❌ | 🔶 own, window | 🔶 own, window | 🔶 rule | ❌ |
| `ticket.cancel` | ✅ | 🔶 | ⚙️ | ❌ | 🔶 own | 🔶 own | ❌ | ❌ |
| `ticket.assign` | ✅ | 🔶 | ❌ | ❌ | ❌ | ❌ | 🔶 rule | ❌ |
| `ticket.assign.self` | ✅ | ✅ | 🔶 desks | ❌ | ❌ | ❌ | — | ❌ |
| `ticket.merge` / `.split` | ✅ | 🔶 | ⚙️ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ticket.priority` | ✅ | 🔶 | 🔶 band | ❌ | ❌ | ❌ | 🔶 rule | ❌ |
| `ticket.desk.change` | ✅ | 🔶 | ⚙️ | ❌ | ❌ | ❌ | 🔶 rule | ❌ |
| `ticket.subject.link` | ✅ | 🔶 | 🔶 | ❌ | ❌ | ❌ | 🔶 rule | ❌ |
| `ticket.bulk` | ✅ | 🔶 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ticket.delete` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ticket.archive` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚙️ retention | ❌ |
| `ticket.export` | ✅ | 🔶 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**`ticket.delete` is denied to every role including admin** (RULE-13). Tickets are evidence.

## 29.4 Messages

| Permission | Adm | Mgr | Agt | Apr | Emp | Cus | Sys | Anon |
|---|---|---|---|---|---|---|---|---|
| `ticket.message.read.public` | ✅ | 🔶 | 🔶 | 🔶 | 🔶 own | 🔶 own | 🔶 | ❌ |
| `ticket.message.read.internal` | ✅ | 🔶 | 🔶 | ❌ | ❌ | ❌ | 🔶 | ❌ |
| `ticket.reply` (public) | ✅ | 🔶 | 🔶 | ❌ | ❌ | ❌ | ⚙️ auto-reply | ❌ |
| `ticket.reply.own` | — | — | — | — | 🔶 own | 🔶 own | — | ❌ |
| `ticket.note.internal` | ✅ | 🔶 | 🔶 | ❌ | ❌ | ❌ | ✅ | ❌ |
| `ticket.message.redact` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ticket.message.edit` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**No role can edit a message.** Corrections are new messages; redaction is admin-only, audited,
and leaves a tombstone.

## 29.5 Collaboration, files, time

| Permission | Adm | Mgr | Agt | Apr | Emp | Cus |
|---|---|---|---|---|---|---|
| `ticket.watch` | ✅ | 🔶 | 🔶 | 🔶 | ❌ | ❌ |
| `ticket.mention` | ✅ | 🔶 | 🔶 | ❌ | ❌ | ❌ |
| `ticket.participant.add` | ✅ | 🔶 | 🔶 | ❌ | ❌ | ❌ |
| `ticket.task.manage` | ✅ | 🔶 | 🔶 | ❌ | ❌ | ❌ |
| `ticket.draft.send` | ✅ | 🔶 | 🔶 own | ❌ | ❌ | ❌ |
| `ticket.handover` | ✅ | 🔶 | 🔶 | ❌ | ❌ | ❌ |
| `ticket.child.create` | ✅ | 🔶 | 🔶 | ❌ | ❌ | ❌ |
| `attachment.upload` | ✅ | 🔶 | 🔶 | 🔶 | 🔶 own | 🔶 own |
| `attachment.delete` | ✅ | 🔶 | 🔶 own | ❌ | ❌ | ❌ |
| `ticket.time.log` | ✅ | 🔶 | 🔶 | ❌ | ❌ | ❌ |
| `ticket.time.edit.others` | ✅ | 🔶 | ❌ | ❌ | ❌ | ❌ |

## 29.6 SLA and approvals

| Permission | Adm | Mgr | Agt | Apr | Emp | Cus |
|---|---|---|---|---|---|---|
| `sla.read` | ✅ | 🔶 | 🔶 own tickets | ❌ | ❌ | ❌ |
| `sla.extend` | ✅ | 🔶 | ❌ | ❌ | ❌ | ❌ |
| `sla.configure` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `approval.read` | ✅ | 🔶 | 🔶 own tickets | 🔶 assigned | 🔶 own | ❌ |
| `approval.decide` | ❌* | 🔶 if approver | ❌ | 🔶 assigned step | ❌ | ❌ |
| `approval.delegate` | ✅ | 🔶 | ❌ | 🔶 own | ❌ | ❌ |
| `approval.request` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `approval.configure` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

\* **Admin cannot decide an approval they are not the assigned approver for.** Configuring the
control and exercising it are different powers; collapsing them makes approvals meaningless as
a control. Automation and AI can never decide (§23.9).

## 29.7 Knowledge, catalog, routing, automation

| Permission | Adm | Mgr | Agt | Emp | Cus | Anon |
|---|---|---|---|---|---|---|
| `kb.read.public` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `kb.read.internal` | ✅ | ✅ | ✅ | ✅ | ⚙️ | ❌ |
| `kb.read.agent_only` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `kb.author` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `kb.review` / `kb.publish` / `kb.archive` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `catalog.read` | ✅ | ✅ | ✅ | 🔶 visible | 🔶 visible | ❌ |
| `catalog.submit` | ✅ | ✅ | ✅ | ✅ | 🔶 customer items | ❌ |
| `catalog.configure` / `.publish` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `routing.configure` | ✅ | ⚙️ own desks | ❌ | ❌ | ❌ | ❌ |
| `routing.preview` | ✅ | 🔶 | ❌ | ❌ | ❌ | ❌ |
| `automation.read` | ✅ | 🔶 | ❌ | ❌ | ❌ | ❌ |
| `automation.configure` / `.run` | ✅ | ⚙️ / 🔶 | ❌ | ❌ | ❌ | ❌ |
| `macro.use` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `macro.manage` | ✅ | 🔶 | ❌ | ❌ | ❌ | ❌ |

## 29.8 Reports, config, audit

| Permission | Adm | Mgr | Agt | Emp | Cus |
|---|---|---|---|---|---|
| `report.read` | ✅ | 🔶 desks | 🔶 own stats | ❌ | ❌ |
| `report.read.all` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `report.export` / `.schedule` | ✅ | 🔶 | ❌ | ❌ | ❌ |
| `report.pii` | ✅ | 🔶 | ❌ | ❌ | ❌ |
| `dashboard.agent` / `.manager` / `.executive` | ✅ | ✅ / ✅ / ⚙️ | ✅ / ❌ / ❌ | ❌ | ❌ |
| `desk.configure` / `team.configure` | ✅ | ❌ / 🔶 | ❌ | ❌ | ❌ |
| `workflow.configure` / `settings.manage` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `audit.read` | ✅ | 🔶 desks | 🔶 own tickets | ❌ | ❌ |
| `audit.edit` / `audit.delete` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `elevation.request` / `.grant` | ✅ | 🔶 / ❌ | ❌ | ❌ | ❌ |

**`audit.edit` and `audit.delete` are denied to every role, permanently** (RULE-12). There is no
code path that updates or deletes an audit row.

## 29.9 Enforcement

1. **Service layer** — every `*Service` method takes an actor and checks entitlement. This is
   the authoritative gate; HTTP is not.
2. **Route layer** — api-pro interceptor per the descriptor's `scope`, `apps` and `approle`.
3. **Read model** — row scoping and `internal` filtering happen in the query, never
   post-serialization (§26.4).
4. **UI** — hides what the user cannot do; never the only gate.

A test suite calls services **directly**, bypassing HTTP, to prove layer 1 stands alone. If the
only thing stopping a cross-desk read is a route policy, the module is one refactor away from a
breach.

## 29.10 Seeding

Permissions ship as descriptor entries; roles seed into `domains.json`. After any change:

```bash
npm run seed -- --only=api-provider,up-permissions
```

Nothing is granted at boot — a new action 403s until seeding runs.

---

## Acceptance criteria for this section

- [ ] Every ❌ has a negative test at the service layer.
- [ ] Every 🔶 has a scope test proving the boundary.
- [ ] `ticket.delete`, `audit.edit`, `audit.delete`, `message.edit` have no code path at all.
- [ ] Admin cannot decide an approval they do not own.
- [ ] `internal` messages filtered in the read model for every non-agent role.
- [ ] Elevation audited and notified.
- [ ] Matrix regenerated from descriptors as a build step, so it cannot drift from the code.
