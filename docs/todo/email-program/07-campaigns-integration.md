# Email Program — Campaigns Integration

`apps/content/campaigns` (:4019) remains its own app with its own authoritative spec
([`../campaigns-implementation.md`](../campaigns-implementation.md));
this umbrella sequences its outstanding phases and defines the shared seams.

## Mapping

| Umbrella phase | Campaigns spec §9 | Contents |
|---|---|---|
| **M4** | Phases 2 + 3 | Audience resolver (`cmp-audience` service is a stub today), 4-step composer, campaign runner (`sendBatch` currently has **no caller**), `campaign-cron-tasks.js` (`CAMPAIGNS_CRON_ENABLED` is declared in env but read nowhere), **`/api/cmp/webhook` receiver — referenced by `cmp-sending-identity.js` but does not exist**, report poller, run/recipient grids, suppression UI |
| **M6** ✅ | Phases 4 + 5 | Open/click tracking — §5 decided as **local** (the MTA scopes generic tracking out); campaign events → `crm-activity`; `cmp-recipient` → person linkage. If the MTA ever gains native tracking, the webhook ingester already accepts `opened`/`clicked` — just stop injecting |
| **M7** | Phase 6 | A/B, journeys, scoring — scoped separately |

## Identity separation — the rule that keeps both modules honest

- **`cmp-sending-identity`** = a *bulk sending* identity registered with
  MTA (trust token, suppression, reputation pacing, unsubscribe).
  Campaigns send through the MTA. Always.
- **`mail-account`** = a *human mailbox* (IMAP+SMTP). The mail client sends
  through the account's own SMTP. Always.

Never cross them: campaign blasts through a personal SMTP would destroy the
domain's reputation and bypass suppression; human one-to-one replies through
the MTA would be absurd overhead and wrong provenance. The two CTs stay
separate on purpose — same `from_email` string, different machinery.

## Where they meet

1. **Replies to campaigns land in a shared inbox** (M4+M3): a campaign's
   `reply_to` points at a shared mailbox (e.g. hello@rutba.pk); replies are
   then triaged like any shared-inbox mail, linkable to the person the
   campaign targeted. This is the cheap, robust reply-handling story — no
   VERP, no reply-parsing service.
2. **One timeline** (M6 ✅): `cmp-recipient` carries person / crm-contact /
   customer relations, resolved by email when the run materializes its rows;
   a person's timeline can interleave campaign sends (cmp-events) with
   personal/shared correspondence (mail-links). On CRM contacts it is
   already visible today: send, first open, and first click each log a
   `crm-activity`.
3. **Suppression respect** (deferred from M6): before a shared-inbox
   bulk-ish action (e.g. "email all watchers"), check the MTA suppression
   list. One-to-one client mail is exempt — a human replying to a human is
   never suppression-gated.

## What campaigns does NOT inherit from the mail client

- No IMAP: campaign delivery state comes from MTA webhooks/reports, not from
  reading a Sent folder.
- No mail-account credentials: the MTA holds its own SMTP credentials
  (encrypted its side); `cmp-sending-identity` never gains password fields.
