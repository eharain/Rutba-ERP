# 10 — The index decision: does "never store a browsed message" survive?

> **Status: recommendation, not yet ratified (2026-08-14).** This document
> re-examines the program's founding ADR against the competitive gaps found in
> [`09-usability-gap-analysis.md`](./09-usability-gap-analysis.md). It changes no
> code and closes no phase. Its output is a recommendation and a first work item.
>
> The ADR under examination is
> [`00-overview-and-roadmap.md` §The architecture decision that shapes everything](./00-overview-and-roadmap.md#the-architecture-decision-that-shapes-everything-adr),
> restated in [`01-data-model.md:5-6`](./01-data-model.md) as *"Nothing about a
> browsed message is ever stored"* and again in the `mail-message` schema's own
> `info.description`.

## The question

**Live-IMAP gateway, import-on-demand.** The ERP does not sync or mirror
mailboxes; a message becomes a row only when a human links or triages it; the
mail server stays the source of truth. It was decided for four good reasons —
no sync engine, no storage blowup, privacy by default, proven shape — and it
has held for M0–M6.

Does it survive contact with what users will compare us to?

## Framing: this is one missing capability, not five features

The gap analysis lists these as separate rows, and reading them as separate rows
is the mistake this document exists to prevent:

| Gap | Recorded at | Priority given |
|---|---|---|
| Conversation threading | [`09:61`](./09-usability-gap-analysis.md) | P0 — *"the single loudest gap"* |
| Unified "all inboxes" view | [`09:65`](./09-usability-gap-analysis.md) | P1 |
| Cross-folder search | [`09:71`](./09-usability-gap-analysis.md) | P1 |
| Offline | [`09:72`](./09-usability-gap-analysis.md) | *"Non-goal — recorded ADR"* |

Add body search — never listed, because
[`00:165`](./00-overview-and-roadmap.md) rules it out as a non-goal
(*"No full-text index of unimported mail"*).

**Body search, cross-folder search, cross-account search, unified inbox and real
threading are not five features. They are one capability the system does not
have: the mail is not anywhere queryable.** Every one of them needs a set of
messages held somewhere you can ask questions of. None of them can be delivered
individually, and each will be estimated as small, separately, by whoever picks
it up — which is how a P1 row becomes a quarter.

### Why each one is blocked by the same thing

**Search is subject/from/to, one folder, one account.** The free-text term in
[`gateway.js:107-122`](../../../services/strapi/src/utils/mail/gateway.js) becomes
exactly three IMAP criteria:

```js
if (term) q.or = [{ subject: term }, { from: term }, { to: term }];
```

There is no `body` or `text` criterion anywhere in `buildSearch`. The search then
runs inside `listMessages(strapi, account, folder, …)`, which takes
`client.getMailboxLock(folder)` (line 252) and fetches envelopes only — the FETCH
set at line 249 is `{ uid, envelope, flags, bodyStructure, size }`, no body. One
account, because the whole gateway is entered through `withAccount(strapi,
account, fn)`; one folder, because a mailbox lock is a mailbox.

Cross-folder search is therefore N sequential IMAP SEARCHes, and cross-account is
N more — against a pool that serializes per account (below). It is not a loop
somebody forgot to write.

**Threading is subject-grouping within one loaded page.**
[`MessageList.js:75-84`](../../../apps/content/mail/components/MessageList.js) groups by
`normSubject(m.subject)` over `messages` — the array the page currently holds —
and the file says so at line 5: *"Threading v1 groups by normalized subject within
the loaded page."* That page is 50 messages
([`index.js:81`](../../../apps/content/mail/pages/index.js)). A reply older than the
current window is not in a thread; it is in the next page.

`References` and `In-Reply-To` **are** captured — and this is the sharp detail:
they are captured in the **single-message read** path only
([`gateway.js:363-369`](../../../services/strapi/src/utils/mail/gateway.js)), which
downloads and parses `BODY[]`. The list path's `mapEnvelope`
([`gateway.js:82-99`](../../../services/strapi/src/utils/mail/gateway.js)) exposes
`messageId` and `inReplyTo` but **not** `references`. So the data threading needs
exists only after a human has opened the message. Subject-grouping is not the lazy
choice; it is the only information the list has.

**Unified inbox** is one account at a time by construction —
[`index.js:22`](../../../apps/content/mail/pages/index.js) holds a single `account` in
state and everything downstream keys off `account.documentId`.

## Three options

### A — keep the rule, cache only on the desktop

What the offline program already decided:
[`offline-desktop-program/03-app-policies.md` §The resolution that matters](../offline-desktop-program/03-app-policies.md#the-resolution-that-matters-the-servers-rule-stands)
puts an IMAP cache in the Electron install's own SQLite and keeps the server's
rule untouched, with an explicit rule that the cache must never be written back
into `mail_message`.

That decision is correct and this document does not reopen it. But note what it
delivers: **the web client gets none of it**, and the web client is what
everyone uses today. Nothing in the desktop program helps a user in a browser
find an email from March.

### B — full server-side index, headers and bodies

Unlocks everything, body search included. It also **overturns the ADR** rather
than qualifying it, and it puts Rutba in possession of its customers' mail —
including everything the ERP has no business reason to hold. Storage scales with
attachments, not message count. Every one of the ADR's four reasons is spent at
once.

### C — headers-only server-side index

Envelopes, flags, folder, UID + `uidvalidity`, `Message-ID`, `References`.
**Bodies are never stored; they stay live-fetched** exactly as today.

Note what already exists for this: `mail-message` carries `message_id`,
`dedupe_hash`, `folder`, `imap_uid`, `uidvalidity`, `subject`, `date` and
`headers_json` — the full envelope identity vocabulary is designed and built. C
is that field set **without** `body_html` / `body_text`, populated for browsed
mail rather than only for linked mail.

## Recommendation: C, with the desktop layering a body cache on top

### 1. The privacy claim survives nearly intact

*"We don't keep copies of your mail"* stays true under C. What is kept is the
metadata needed to find a message — the envelope you already hand to any mail
client. That is a **qualification of the ADR, not a reversal**: the sentence that
changes is "the ERP stores credentials, links, and the small set of imported
messages", which gains "and an envelope index". The sentence that does not change
is that the mailbox holds the mail.

Under B, the privacy claim is simply gone, and it is the one claim in the ADR
that cannot be re-earned later.

### 2. Storage scales with message count, not attachments

A quarter-million envelopes is a table. A quarter-million messages with
attachments is a storage problem with a backup problem attached to it. The ADR's
"no storage blowup" reason survives C almost untouched.

### 3. It fixes the shared-inbox mutex as a side effect

This is the strongest reason and it is not on any feature list.

[`pool.js`](../../../services/strapi/src/utils/mail/pool.js) serializes **every**
operation for an account onto one promise mutex, because IMAP is single-channel
(its own invariant 1, lines 8-9):

```js
// Per-account mutex: chain regardless of the previous op's outcome.
const p = entry.chain.then(run, run);
entry.chain = p.then(() => undefined, () => undefined);
```

(lines 214-216, keyed by `account.documentId`.) The op deadline defaults to
**15 seconds** (`MAIL_IMAP_OP_TIMEOUT_MS`, line 39).

On a personal mailbox that is invisible. **On a shared inbox it is the whole
problem**: `support@` is one account, so every agent queues behind every other
agent, and one wedged operation makes all of them wait up to 15s before it is
evicted. Five agents triaging one inbox contend on a single connection for
every list, every open, every flag.

Serving list views from an index takes reads off IMAP entirely — the mutex then
guards only writes and body fetches, which are the operations that genuinely
need the connection. **This is the structural blocker against Front and
Missive**, the tools [`09 §2`](./09-usability-gap-analysis.md) benchmarks shared
inboxes against, and C solves it without it being the target. No feature request
will ever name it, and no amount of UI work will fix it.

### 4. One sync mechanism feeds both consumers

The server index and the desktop body cache need the same thing: *what changed in
this folder since I last looked*. Build it once and both consume it — the server
index stores envelopes, the desktop cache stores envelopes plus bodies. Option A
alone builds that mechanism anyway, for one consumer.

### 5. The honest trade

**C does not give body search.** "Find the email where the customer mentioned the
delivery address" stays unanswerable for unimported mail. That is a real loss and
it should be stated to whoever asks for it, rather than being discovered.

What C does give: cross-folder and cross-account envelope search, unified inbox,
real `References`-based threading, instant list views, and shared inboxes that
stop queueing.

## The prerequisite that appears on no feature list

**Any incremental sync needs CONDSTORE/QRESYNC — RFC 7162's `MODSEQ` — and the
gateway implements neither.** Verified: the strings `CONDSTORE`, `QRESYNC`,
`MODSEQ` and `modseq` appear **nowhere** in `services/strapi/src/utils/mail/` (all
five files).

Without `MODSEQ` there is no way to ask *"what changed since I last looked"*.
There is only:

- re-FETCH the folder's envelopes and diff — O(folder) per poll, per account,
  through the per-account mutex, which is the thing this was meant to relieve; or
- track UID ranges and miss every flag change on an existing message, which
  makes "unread" and "flagged" — the two states shared-inbox triage runs on —
  the two states the index gets wrong.

`uidvalidity` handling makes it worse: a `uidvalidity` change invalidates every
cached UID for the folder, so the index needs the same cache-bust rule the
desktop cache does
([03 §`uid` + `uidvalidity`](../offline-desktop-program/03-app-policies.md#uid--uidvalidity-the-sharp-edge)).
The schema already models this honestly — `imap_uid` is *"Advisory; only valid
together with uidvalidity"* — and the index must respect it or it will silently
address the wrong message.

> **So the first work item is MODSEQ support in the gateway, not the index.**
> It is small, independently correct, and useful under every option including A
> (the desktop cache needs it just as much). Nothing else here should start
> first, and an index built on full re-FETCH would have to be rebuilt.

- [ ] Gateway: advertise and negotiate `CONDSTORE`, read `HIGHESTMODSEQ` on
      SELECT, and expose a `changedSince` op. `QRESYNC` for vanished-UID
      reporting where the server supports it.
- [ ] Record what happens on a server that supports neither — refuse to index, or
      fall back to periodic full envelope re-FETCH with the cost stated. This
      must be a decision, not an emergent behaviour.

## What remains deliberately open

1. **Whether body search ever justifies going to B.** Left open on purpose. It
   is the one thing C gives up, and it is genuinely valuable — but the question
   *"how often does anyone actually need to search a body we never imported?"*
   is far clearer after living with C for a while than it is by guessing now.
   C does not foreclose B: adding bodies to an existing index is additive, and
   the sync mechanism is the same. **Revisit deliberately, with usage data, not
   on the first complaint.**
2. **Whether the index reuses `mail-message` or gets its own table.** It should
   almost certainly get its own — `mail-message` means *"a human deliberately
   imported this"*, and blurring that boundary is exactly what
   [03 §The resolution that matters](../offline-desktop-program/03-app-policies.md#the-resolution-that-matters-the-servers-rule-stands)
   forbids for the desktop cache. But the identity and idempotency rules in
   [`01-data-model.md`](./01-data-model.md) — `Message-ID` primary, `dedupe_hash`
   fallback — should be shared, not re-derived.
3. **Retention and scope.** Which folders and how far back. Unbounded is not a
   default, it is a decision nobody took.
4. **Who owns index freshness in the UI.** A list served from an index is
   sometimes stale; whether that is shown, and how, is a product question this
   document does not answer.
5. **Ratification.** This is a recommendation. The ADR was taken with the user in
   2026-08 and qualifying it is the user's call, not a document's.

## What this does not change

- **Bodies are still live-fetched.** Under C, opening a message is the same IMAP
  round trip it is today.
- **Import-on-link stays exactly as it is.** `mail-message` continues to mean a
  deliberate import. The index is not an import and must never be promoted to one.
- **The desktop decision in
  [`offline-desktop-program/03`](../offline-desktop-program/03-app-policies.md)
  stands.** C is the server half; the desktop still layers its own body cache in
  its own SQLite, and still must never write back.
- **No mail hosting, no POP3/EWS, no campaigns change**
  ([`00 §What this program does NOT do`](./00-overview-and-roadmap.md#what-this-program-does-not-do)).
  The one line in that section this recommendation qualifies is *"No full-text
  index of unimported mail"* — and it qualifies it precisely: **no full-text
  index. An envelope index.**
