# 06 — ERP Core extraction (portal task E1)

Status: **measured 2026-08-20; `parties` contract built, `catalog`/`posting`/`interactions` scoped.**

The rule, from [portal-alignment.md](../../portal-alignment.md): *one record all
modules reference — no private copies of customers or items anywhere.* Four
packages grow out of that — `parties`, `catalog`, `posting`, `interactions`.

This is called out in the brief as the riskiest item in the program, so it was
measured before anything was designed. The measurement changed the plan twice.

---

## 1. What the estate actually has

Every content type was scored for identity fields and cross-referenced with its
inbound relations and live row counts.

### Items are already one thing

| Type | Rows | Inbound relations |
|---|---:|---:|
| `product` | 2,734 | 24 |
| `stock-item` | 34,279 | 13 |

There is no second catalogue, no module-private item table, and nothing to
unify. **`catalog` is a contract over what exists, not a migration** — which
moves it from "risky" to "cheap", and is the first thing the measurement
changed.

### Parties are five things

| Type | Rows | Inbound relations | Note |
|---|---:|---:|---|
| `supplier` | 76 | 8 | purchasing, stock, manufacturing |
| `customer` | 39 | 4 | `sale`, `acc-invoice`, `crm-lead`, `cmp-recipient` |
| `hr-employee` | 26 | **53** | the most-referenced type in the estate |
| `person` | 4 | 7 | the Phase-1A unification spine |
| `crm-contact` | 0 | 4 | already carries a `person` relation |
| ~~`employee`~~ | 0 | 1 | **dead**, and still referenced by `sale.employee` |
| ~~`mail-contact`~~ | 0 | 0 | **dead**, referenced by nothing |

And the split is not theoretical — it is already load-bearing in two directions
at once:

- `sale.customer` → `api::customer.customer`
- `sale-order.customer_person` → `api::person.person`

Two order paths in the same repo disagree about what a customer is.

---

## 2. The finding that actually shapes E1

Running the new contract over all 145 live party rows:

```
identifiability (strong keys only):
  email + phone      3
  email only        13
  phone only        49
  NO STRONG KEY     80      ← 55% of the estate's party rows
```

**Fifty-five percent of party rows carry no usable email and no usable phone.**
No matcher, however good, can unify those. E1 is therefore not primarily an
algorithm problem, and any plan that assumes "write the dedup, run it, done" is
wrong before it starts. The plan has to carry a data-completeness workstream:
capture-time validation, and a human review path for the rest.

What the matcher *does* find, conservatively, is real:

```
groups found: 3    singletons: 137
groups spanning more than one role: 1
```

- **One party appearing as four records** — `person:2`, `person:4`,
  `customer:39` and `hr-employee:26` are all the same human, matched on a shared
  email and a shared phone written two different ways (`+923215997722` vs
  `03215997722`). Exactly the shape the "no private copies" rule exists to stop.
- **Two same-table duplicates in `customers`** — two `shumaila` rows on one
  phone, and two rows for one phone where only the second has a name.

Three groups out of 145 rows is the right order of magnitude for a matcher that
must not merge strangers. It is not evidence that the data is clean; it is
evidence that most of the data cannot be judged either way.

---

## 3. What was built

[`packages/shared/core/parties`](../../../packages/shared/core/parties/index.js),
importable as `@rutba/shared/core/parties`. Pure — no database, no HTTP, no
framework — so the same normalisation runs in a Next app and in `services/core`,
and so the shape can be agreed and depended on *while the data unification
proceeds underneath it*. That is the strangler pattern applied to a domain model
instead of to a server, and it is the only version of E1 that does not require
every module to move at once.

**Identity is a party; membership is a role.** A person who buys from you and
also supplies you is one party with two roles, not two records that happen to
share a phone number. The five live types become five *sources* of the same
party, each contributing a role.

Three decisions worth arguing with, all of them tested:

- **Phone matching normalises to the last ten significant digits.** Pakistani
  numbers arrive as `0300-1234567`, `+92 300 1234567`, `00923001234567` and
  `(0300) 1234567`; all are one handset. Ten, not nine — nine collides across
  networks — and anything shorter than ten is not a key at all, because a
  partial match merges strangers.
- **Email matching does NOT apply Gmail's dot and plus rules.** `a.b@gmail.com`
  and `ab@gmail.com` are one mailbox at one provider and two at most others.
  Merging two customers on a provider-specific assumption is not undoable.
- **A shared name never groups anything by itself.** Two customers called
  "Muhammad Ali" are usually two people. Names are collected as a `weak` key and
  reported on the group, so a reviewer can see them; they never form one.

`groupParties` **proposes**, it does not merge. The estate already has
`person.merged_into` and a `person_dedup_audits` table, so merging is a decision
with a record; this function's job is to put the right rows in front of that
decision. `collapse()` shows what a group would look like as one party, with the
spine (`person`) winning each field rather than the newest record — recency
would let a stale import overwrite a corrected name, which is the classic way
dedup tools lose data.

22 assertions, including the empty-key trap: two rows that both fail to produce
a match key must never group with each other, because absence of identity is not
shared identity.

---

## 4. What is next, in the order the measurement implies

1. **`catalog`** — cheap, because items are already one identity. A contract
   over `product` + `stock-item` with the variant price-fallback rule
   ("positive-or-parent", not `??`) baked in, so no module reimplements it.
2. **`posting`** — the journal-entry contract, plus the export-queue fallback
   when `erp.gl` is unlicensed. This is the first place E1 and
   [E2](../../portal-alignment.md) meet: the fallback is chosen by an
   entitlement check, and that check now exists.
3. **`interactions`** — twelve types today (`crm-activity`, `cmp-event`,
   `hr-lifecycle-event`, `mail-message`, `order-message`, `work-item-activity`,
   `work-item-comment`, `notification-log`, `sale-audit-log`,
   `marketplace-sync-log`, `person-dedup-audit`), of which only three hold any
   rows. Mostly a naming and shape exercise, not a migration.
4. **Retire the two dead party types.** `mail-contact` is referenced by nothing.
   `employee` has no rows but `sale.employee` still points at it — that relation
   has to move to `hr-employee` first, which is a schema change and belongs with
   a tranche flip, not with this.
5. **The data-completeness workstream** the 55% demands: validation at capture,
   and a review queue for what cannot be matched automatically.

---

## 5. What this does not do

It does not move a single row, change a single schema, or make any module depend
on it yet. That is deliberate: a contract nobody has run against real data is a
guess, and the point of this slice was to run it against real data first. The
next slice is the one that makes a module consume it — and the measurement says
that module should be CRM or sales, where the `customer` / `person` disagreement
already exists, rather than HR, whose 53 inbound relations make it the most
expensive place to be wrong.
