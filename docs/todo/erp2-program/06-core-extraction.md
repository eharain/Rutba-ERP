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

### `catalog` — the second package

[`packages/shared/core/catalog`](../../../packages/shared/core/catalog/index.js),
plus [`CatalogService`](../../../services/core/src/domain/catalog/catalog.service.js)
as its storage half. Cheap, as §1 predicted: items are already one identity, so
there is nothing to unify. What is *not* one thing is the **price**.

A sellable thing here can carry a price at three levels — the stock unit, the
product, the parent a variant hangs off — and any level may leave it null, empty
or zero. The resolution rule lives today in exactly one module
(`apps/sales/marketplace/lib/engine.js`) behind a comment calling it a
"convention" that nothing enforces, while every other surface re-derives some
part of it inline. That is the private copy the brief forbids.

**Positive-or-inherit**, stated once: a price counts as set only if it parses
above zero; null, `''`, `0`, `'0.00'` and import junk all mean *not priced at
this level*, and resolution moves outward. Zero meaning "unset" rather than
"free" is the whole point — `??` keeps the zero and sells the thing for nothing.
Free items are a zero-value sale line, never a zero catalog price.

Two decisions worth arguing with:

- **`selling` and `offer` resolve INDEPENDENTLY, and that is preserved
  deliberately.** A variant priced 600 with no offer, under a parent priced 500
  offering 450, resolves to selling 600 / offer 450 — an offer inherited from a
  differently-priced level. It is what marketplace does today, so it is what the
  catalog does today; changing it here would quietly reprice live listings, and
  a refactor must not smuggle in a pricing change. It is *surfaced* instead:
  `mixedLevels` says the two came from different levels and
  `offerIsNotADiscount` says the offer is at or above list. **Whoever owns
  pricing should decide whether the stricter same-level rule is correct; until
  then the flags make the disagreement visible rather than silent.**
- **`divisible` is ignored on a countable unit.** A `divisible` flag on a boxed
  item is data noise, and honouring it would let someone sell a third of a box.
  Divisibility only means anything for a measured unit (metre, kg), where
  `unitPrice()` divides by the stock unit's own `sellableUnits` — a 50 m roll
  priced 5000 is 100/m. A divisible unit whose length is unknown keeps the total
  rather than dividing by a guessed 1.

The service exists for one method. `priceForUnit()` loads the unit, its product
*and* that product's parent in one read, because resolving a price needs all
three ROWS and the failure mode is quiet: a variant priced only on its parent
reads as unpriced when the parent was not populated. The contract cannot prevent
that; only the query can. So the contract owns "given these levels, what is the
price", the service owns "load the levels", and the smoke test asserts the
populate shapes directly.

33 contract assertions + 26 service assertions. One of them is a drift guard:
every `unit_of_measure` in the product schema must be classified countable or
measured, so a unit added there fails a test instead of silently landing in
whichever branch the code happens to take.

### `posting` — the third package, and where E1 meets E2

[`packages/shared/core/posting`](../../../packages/shared/core/posting/index.js),
[`PostingService`](../../../services/core/src/domain/posting/posting.service.js),
and migration [`024-posting-export-queue`](../../../services/core/migrations/024-posting-export-queue.js).

Not a second ledger. The estate already has a working double-entry engine
(`services/strapi/.../acc-journal-entry/services/accounting.js`) and this does not
replace it — it is the SHAPE that reaches one, validated before anything touches
a database. Two things follow:

- **A caller learns it is wrong before it writes.** Today an unbalanced entry
  surfaces inside the posting engine, mid-operation, after the sale it belongs
  to has been written. Validation that needs a database cannot run where the
  entry is built.
- **An entry is still worth something when there is nowhere to post it.** An org
  without `erp.gl` still makes sales, and its accountant still needs the
  numbers.

**Money is integers.** Amounts are minor units (paisa) end to end, including in
the queue's own total columns. `0.1 + 0.2 !== 0.3` is not a curiosity in a
ledger; it is an entry that fails its own balance check for no visible reason.
The existing engine rounds to cents at the moment of comparison, which fixes the
comparison and leaves every intermediate sum drifting. `scale` travels with the
data so a three-decimal currency (KWD, BHD) does not silently lose a digit.

**Posting is gated on `erp.gl` specifically, not on the accounts app's key
list.** The manifest maps that app to `['erp.gl', 'erp.ap-ar']` with ANY-of
semantics, so an org that bought only the sub-ledgers can open it — correctly,
since supplier bills and customer invoices live there. It must still not write
to a general ledger it never licensed. Reusing the app's list would post to a GL
for every AP/AR customer.

The queue is a transactional outbox, not work for a worker: the rows ARE the
deliverable, so they outlive any process and stay queryable by period and
source. `exported` and `posted` are separate outcomes because an entry that
became both has been counted twice.

Unknown entitlement routes to the LEDGER, not the queue — fail-open, matching
the rest of the estate. Diverting a licensed org's real postings into a queue
nobody watches is a far worse failure than posting an entry it turns out not to
have paid for.

37 contract assertions + 34 service assertions. The service's fake database
enforces the unique index for real, including a concurrent-capture race,
because idempotency that is only checked in JavaScript is not idempotency.

#### The first emitter: POS sale

A contract nothing emits into is a capability, not a guarantee. The POS
checkout now goes through
[`postOrCapture`](../../../services/strapi/src/api/acc-journal-entry/services/post-or-capture.js),
which builds the entry, validates it, and routes it — ledger or queue.

It lives in `services/strapi` because its callers are ported controllers that
services/core loads zero-copy: core requires services/strapi, so services/strapi
cannot require core without a cycle. The capability arrives the way `apiPro`
does, on the compat `strapi` object, and is ABSENT under real Strapi. **That
absence is the safety property** — under Strapi, or under core before an
entitlement is known, the same `createAndPost` call is made with the same
arguments as before. The queue only ever catches entries that would otherwise
have gone nowhere.

Two things the wiring forced into the open:

- **A POS sale posts TWICE** — revenue and cost-of-goods — under one
  `source_type` and one `source_id`. On the queue's unique key the second
  collides with the first and is dropped as a duplicate, leaving the books short
  by exactly the cost of goods. Hence `discriminator: 'revenue' | 'cogs'`. The
  smoke test asserts the failure as well as the fix, so the parameter cannot be
  quietly dropped later.
- **Cancelling a sale had nowhere to reach.** `reverseBySource` reverses posted
  entries; an unlicensed org has none — its entry is in the queue — so the
  reversal found nothing, succeeded, and the cancelled sale stayed queued for an
  accountant. `reverseOrVoid` does both, and migration
  [025](../../../services/core/migrations/025-posting-export-voided.js) adds the
  `voided` status. Distinct from `failed` because the two mean opposite things
  to whoever reads the queue: `failed` is "look at this", `voided` is
  "correctly withdrawn, do nothing". An entry already exported is NOT voided —
  it is in a file somebody has, and that needs a credit note rather than a row
  flip, so the count is reported separately.

#### Every other emitter

The remaining 21 posting sites and 7 reversal sites — bills, invoices, expenses,
cash register, payroll, statutory remittances, purchase and sale returns, web
orders, stock adjustments and counts, HR expense claims — now go through the
same door. Converting them turned up three things a per-module change would
have missed:

- **Four more documents post twice.** Bills (received/payment), invoices
  (issued/payment), web orders and sale returns (revenue/cogs) all reuse one
  `source_type` + `source_id` pair, exactly like the POS sale. Each got its
  discriminator; without one the second entry of each pair is dropped as a
  duplicate.
- **Two source types were never declared.** `HR Expense Claim` and
  `Stock Count` are emitted by live code but absent from the schema's
  `source_type` enum. The column is `varchar`, so the writes always succeeded
  and nothing noticed. Added to the enum rather than removed from the code —
  they are real posting paths — and the contract's drift test now keeps the two
  in step.
- **Four documents stamp the journal entry back onto themselves.** There is no
  entry to stamp when the posting was captured instead, and writing `undefined`
  would clear the relation rather than skip it. Each is guarded; an unlicensed
  org's invoice simply has no `journal_entry`, which is the truth.

A structural assertion closes it: the smoke test greps the tree and fails if any
module calls `createAndPost` or `reverseBySource` outside the gateway. A new
module that posted directly would bypass the entitlement check and the queue
while looking perfectly correct in review, so the absence is tested rather than
trusted. Verified by reintroducing a bypass and watching it fail.

27 gateway assertions. Both migrations verified against real MySQL, including
that the unique index tolerates many NULL keys (manual entries have no source
document, and "no identity" must not collapse two of them into one).

### `interactions` — the fourth package, and E1's last

[`packages/shared/core/interactions`](../../../packages/shared/core/interactions/index.js)
plus [`InteractionService`](../../../services/core/src/domain/interactions/interaction.service.js).

An interaction is **something that happened, to a record, that a human should
see on a timeline**. Eleven append-only tables were nominated because they share
a shape — timestamp, actor, payload. Measured against live data, four hold rows
at all, and **the biggest of them is not an interaction**:

```
marketplace_sync_logs   1076     ← excluded
sale_audit_logs           14
work_item_activities      11
notification_logs          8
(seven others)             0
```

So nine are sources and **two are deliberately not**, each with its reason
recorded in `NOT_INTERACTIONS`. `marketplace-sync-log` is a robot's job
statistics against a channel account; admitting it buries a customer's two phone
calls under a thousand sync runs, and a timeline nobody can read is a timeline
nobody uses. `person-dedup-audit` is a review queue — work waiting to be
decided, not events that occurred. **Being a log is a shape; being an
interaction is a purpose**, and that distinction is most of this package's
value.

Two of the eleven had already solved the hard part. `work-item-activity` and
`work-item-comment` carry `entity_uid` + `target_document_id` — "this happened
to that record, whatever kind it is" — while every other source hard-codes its
subject as a relation, which is why nothing can render one timeline across them
today. The contract projects them all onto the generic form, and where a subject
is a party its party id comes back too, from `core/parties`' own `partyIdFor`
rather than a second copy of the convention. "Everything that ever happened with
this customer" becomes a join instead of a special case.

The service exists for the fan-out: one subject's history is spread across up to
nine tables, none aware of the others. A CRM screen shows `crm-activity`
because that is the table CRM owns; the same customer's emails, campaign events
and order chats sit in four more that nobody joined. Which tables answer for a
subject is derived from the contract's own declarations, so a source that starts
pointing at people becomes reachable without anyone updating a second map.

Three decisions the tests pin:

- **A failing source degrades the timeline, it does not empty it.** A module
  this instance never installed has no table; that query throws, and the other
  eight still have to fill the screen.
- **Undated rows sink.** `sent_at` is null on a notification that never sent.
  Putting an event of unknown time at the top of a customer's history asserts
  something false about when it happened.
- **A non-party subject gets `null`, never a fabricated party id** — which would
  join an interaction to a customer it has nothing to do with.

32 contract assertions + 27 service assertions. One contract test walks every
mapped field against the real schemas, so a renamed column fails a test instead
of silently producing null bodies and null timestamps across a whole source.

---

## 4. What is next, in the order the measurement implies

1. ~~**`catalog`**~~ — **done**, see §3. The price rule is now stated once;
   the open question it surfaced (independent vs same-level offer resolution)
   needs a pricing owner, not more code.
2. ~~**`posting`**~~ — **done, and every module emits into it**, see §3. All
   23 posting sites and 8 reversal sites go through the gateway; a smoke test
   fails the build if a new one calls the engine directly.
3. ~~**`interactions`**~~ — **done**, see §3. It was *not* only a naming
   exercise: eleven candidates, nine sources, two excluded on purpose, and four
   (not three) hold rows — the largest of which is one of the two that had to be
   kept out.
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
