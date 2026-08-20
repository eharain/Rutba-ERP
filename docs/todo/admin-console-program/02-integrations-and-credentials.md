# 02 — Integrations & Connected Accounts

> **Status: specification only.** Part of the [Admin Console Program](README.md).
> §1 is a security finding about code that is live on dev today.

## 1. Security finding: three credential tables are plaintext

Five entities across five modules store third-party credentials. **Only the two
mail entities are actually encrypted at rest.** The other three rely on Strapi's
`private: true`, which strips a field on *serialization* and does nothing at all
to the column.

| Entity | Table | Secret fields | At rest |
|---|---|---|---|
| `mail-server` | `mail_servers` | `api_key_enc` | ✅ **AES-256-GCM** |
| `mail-account` | `mail_accounts` | `imap_password_enc`, `smtp_password_enc` | ✅ **AES-256-GCM** |
| `social-account` | `social_accounts` | `api_key`, `api_secret`, `access_token`, `refresh_token`, `extra_config` | ❌ plaintext |
| `marketplace-account` | `marketplace_accounts` | `api_key`, `api_secret`, `access_token`, `refresh_token`, `extra_config` | ❌ plaintext |
| `cmp-sending-identity` | `cmp_sending_identities` | `trust_token`, `webhook_secret` | ❌ plaintext |
| `social-relay-provider` | `social_relay_providers` | `api_key`, `extra_config` | ❌ plaintext |

That is **four** unencrypted entities, not three — `social-relay-provider` belongs
on the list too.

This is not an inference. Both sides of it are written down in the repo already.

[`cmp-sending-identity`'s own schema](../../../services/strapi/src/api/cmp-sending-identity/content-types/cmp-sending-identity/schema.json)
says so on the field:

> `trust_token` — *"Stored `private` so it is stripped on serialize, matching
> marketplace-account credential handling; **the column itself is not encrypted
> at rest**."*
> `webhook_secret` — *"Same storage caveat as trust_token."*

And [`services/strapi/src/utils/mail/crypto.js`](../../../services/strapi/src/utils/mail/crypto.js)
names it from the other direction, in its header:

> *"IMAP/SMTP passwords are full-mailbox keys — strictly higher value than the
> `private: true`-but-plaintext storage cmp-sending-identity gets away with for
> its trust tokens."*

So the asymmetry was a conscious, documented call at the time: mailbox passwords
are higher value than a campaign trust token, and the mail work paid for
encryption while the others did not. What has changed is the count. Four tables,
five modules, and a marketplace seller token that can move real inventory and
real money is not obviously cheaper than a mailbox password. The rationale
doesn't scale to where the codebase now is.

**Blast radius.** Any database backup, any replica, any `mysqldump` in a support
ticket, any read-only analytics grant, and any SQL injection anywhere in a
118-content-type surface yields live Daraz seller tokens, social publishing
tokens, relay API keys and MTA trust tokens in plaintext. The mail pair stays
safe in every one of those scenarios.

### The existing crypto is good and should simply be reused

[`mail/crypto.js`](../../../services/strapi/src/utils/mail/crypto.js) is 60 lines and
already has everything the other four need:

- AES-256-GCM, random 12-byte IV per encryption, auth tag verified on decrypt.
- Format `v1:<iv_b64>:<tag_b64>:<ct_b64>` — the version prefix is an explicit
  rotation seam, and the file says so: *"a future v2 key decrypts-old/
  encrypts-new in a sweep."*
- `MAIL_CRED_KEY` must be exactly 64 hex chars; **throws** when missing or
  malformed. There is deliberately **no plaintext fallback** — the single most
  important property, and the one a hasty port would drop first.
- `isEncrypted()` — makes a mixed-state migration safe to run and re-run.

It has exactly **5 consumers**, all in the mail cluster: the `mail-account` and
`mail-server` controller/service pairs, plus `utils/mail/pool.js`. A small enough
blast radius that lifting it is a genuinely cheap change.

## 2. The implicit shape

The five entities converged on the same shape without anyone designing one:

```
{ name, provider-enum, credential fields (private), extra_config,
  is_active, last_*_at, last_error }
```

| Entity | Discriminator | Health fields |
|---|---|---|
| `social-account` | `platform` (7) + `connection_type` (api\|browser) | `last_connected_at` |
| `social-relay-provider` | `provider` (6: ayrshare, postiz, zernio, post_bridge, bundle_social, custom) | `last_validated_at`, `last_error` |
| `marketplace-account` | `platform` (4: daraz, amazon, shopify, rutba) | 5 × `last_*_synced_at`, `last_connected_at` |
| `cmp-sending-identity` | — (MTA only) | `last_verified_at`, `last_error` |
| `mail-server` | `kind` (mailcow) | `last_checked_at`, `last_error` |

The convergence is genuine and the differences are real: `marketplace-account`
carries five sync-direction toggles and a `price_adjust_pct`; `mail-server`
carries `mail_domains`; `cmp-sending-identity` carries SMTP coordinates and an
`owners` relation. A single unified table would have to absorb all of it.

## 3. Recommended approach — federate, don't migrate

**Do not consolidate the five tables.** Migrating five live credential tables —
each with working sync workers, cron jobs and adapters reading them — is real
risk for what amounts to a cosmetic gain. `marketplace-account` alone is read by
the marketplace worker, the Daraz adapter, and five sync paths.

Federate instead, in four steps.

### Step 1 — Shared credential vault

- [ ] Lift `services/strapi/src/utils/mail/crypto.js` to a shared credential vault
      util (`utils/credentials/vault.js` or similar). **Keep the existing module
      path working** — five consumers import it (one of them as `./crypto` from
      inside `utils/mail/`), and the mail cluster must not churn for this.
- [ ] Preserve the invariants verbatim: no plaintext fallback, throw on missing
      or malformed key, `v1:` version prefix, `isEncrypted()` guard.
- [ ] Introduce a general env key name (e.g. `RUTBA_CRED_KEY`) that **defaults
      to `MAIL_CRED_KEY`** when unset, so existing deployments keep working with
      no env edit. The LAN box and rutba.pk both already have `MAIL_CRED_KEY`
      set; a rename that silently breaks mail is the worst possible outcome here.
- [ ] Document key rotation as a real procedure, not a comment: v2 key, sweep
      decrypt-old/encrypt-new across every registered credential field.
- [ ] Add a startup assertion in non-dev environments: if any registered
      integration has credential fields and the key is absent, fail loudly at
      boot rather than at first use.

### Step 2 — Route every integration secret through it

Per-entity, smallest blast radius first. Each is the same shape of change: add
`*_enc` columns, encrypt on write, decrypt on read, backfill, drop the old column.

- [ ] `social-relay-provider` — 1 field (`api_key`) + `extra_config`. Smallest;
      do it first as the pattern-setter.
- [ ] `cmp-sending-identity` — `trust_token`, `webhook_secret`. Update the two
      field descriptions, which currently document the plaintext caveat.
- [ ] `social-account` — 4 token fields + `extra_config`.
- [ ] `marketplace-account` — 4 token fields + `extra_config`. Highest risk:
      the worker and adapters read these on a schedule. Land it with the worker
      stopped, or behind `isEncrypted()` dual-read.
- [ ] Every migration is idempotent and dual-read via `isEncrypted()`, so a
      half-migrated table is a valid state and a rollback loses nothing.
- [ ] `extra_config` is `private: true` json on three entities and may hold
      secrets — encrypt it, or split declared-secret keys out of it. Do not
      leave it as the one plaintext hole after the effort.

### Step 3 — An integration registry

A module registers its connection type; the console reads the registry.
**No existing table changes.**

Each registration declares:

| Field | Purpose |
|---|---|
| `kind` | `social`, `marketplace`, `mail-server`, `sending-identity`, `relay`, `payment-gateway` |
| `providers[]` | The discriminator enum, so the console renders the right form |
| `credentialFields[]` | Which fields are secrets — this is what the vault sweeps and what the UI masks |
| `capabilities[]` | What the connection can do (`publish`, `sync-orders`, `send-mail`, `provision-mailbox`) |
| `healthProbe` | An existing validate/test function, reused not rewritten |
| `owningEntity` | The content-type UID that actually stores the row |
| `adminRoute` | Where "edit in the owning module" deep-links to |

Health probes already exist and must be reused rather than reimplemented:
`mail-server` validate, `mail-account` validate, `social-relay-provider`
`last_validated_at` write path, `marketplace-account` connect.

- [ ] Define the registry contract and the registration call.
- [ ] Register all five existing entities against it.
- [ ] Registry lives server-side; the console reads it through a descriptor.
      Per T3, no endpoint takes a tenant id.

### Step 4 — One admin UI over the registry

A new `/integrations` section in Rutba Admin:

- [ ] List every connection across every module, grouped by `kind`, with health
      state and `last_error` surfaced — the single view that does not exist today
      and is the actual user-facing win.
- [ ] Add / edit / remove, with the form driven by `credentialFields`.
- [ ] **Test connection** per row, calling the module's own probe.
- [ ] Enable / disable via the entity's existing `is_active`.
- [ ] Secrets are write-only: never returned, never rendered. Follow the existing
      mail-account rule — a password-less PUT preserves the stored secret, so an
      admin editing a hostname does not have to re-enter a token.
- [ ] Show `last_*_at` timestamps as recency, and `last_error` verbatim.
- [ ] Deep-link to the owning module for anything module-specific (sync toggles,
      price adjustment, audience settings). The console is a directory, not a
      replacement for each module's own settings page.

## 4. New integrations land here natively

Two concrete cases are waiting:

- **Google Shopping** — specced but unbuilt in
  [`docs/todo/google-shopping-integration.md`](../google-shopping-integration.md)
  (listings-only adapter, Merchant API v1). It will need OAuth credentials and a
  Merchant Center account id. If the registry exists first, it registers a
  connection type and gets the UI, the vault and the health probe for free
  instead of adding a sixth ad-hoc table.
- **Payment gateways** — verified: there is **no gateway credential entity at
  all** today. `services/strapi/src/api/payment` is the `payments` transaction record,
  not a connection. The digital-payments adapter seam has nowhere to store a PSP
  key. Whichever gateway lands first will invent a table; the registry decides
  whether that table is encrypted and visible by default, or the fifth plaintext
  one.

- [ ] Make registry registration part of the definition-of-done for any new
      third-party integration.

## 5. Relay providers — surfacing an orphan

`social-relay-provider` exists server-side with a full 6-value provider enum and
has **no admin home anywhere**. It is configured by direct database access today.
The same is true of `cmp-sending-identity`, which additionally carries an
`owners` relation and an `is_default` flag with no UI to set either.

Both are `kind`s in the registry from step 3. Neither needs its own section.

- [ ] Register `social-relay-provider` (kind `relay`) and `cmp-sending-identity`
      (kind `sending-identity`).
- [ ] Relay results are keyed `platform#relay:<id>` — the console must render
      that key legibly when showing which relay published a post, or the listing
      is unreadable.
- [ ] `cmp-sending-identity.is_default` needs exactly-one semantics enforced
      server-side; the UI must not be the only guard.

## Phases

| Phase | Contents | Size | Depends on |
|---|---|---|---|
| **A2.1** | Vault util + env-key compatibility + boot assertion | S | — |
| **A2.2** | Encrypt `social-relay-provider`, then `cmp-sending-identity` | S | A2.1 |
| **A2.3** | Encrypt `social-account`, then `marketplace-account` (worker-aware) | M | A2.2 |
| **A3.1** | Registry contract + register all five | M | A2.1 |
| **A3.2** | `/integrations` admin UI | M | A3.1 |
| **A3.3** | Relay + sending-identity surfacing (§5) | S | A3.2 |

A2 has a security clock on it and shares no code with
[01](01-app-catalogue-entitlements.md) — run them in parallel. A2.1–A2.2 are
small enough to land before the console UI exists, and should.

## Risks

- **Key loss makes every credential unrecoverable.** This is the price of no
  plaintext fallback and it is the right price, but `MAIL_CRED_KEY` currently
  lives in the off-git master env on the LAN box. Key custody and backup must be
  documented alongside the sweep before A2.3 touches marketplace tokens.
- **Half-migrated table read by a running worker** → `isEncrypted()` dual-read on
  every path, and land marketplace with the worker stopped.
- **The console becomes a second source of truth** → it is a directory over the
  registry; owning modules keep their tables and their settings pages. Ground
  rule 3.
- **`extra_config` left plaintext** → it is explicitly in scope for step 2.
- **Registry drifts from reality** (a module adds a credential field, forgets to
  register it) → the vault sweep enumerates registered fields only, so an
  unregistered field silently stays plaintext. Add a test that asserts every
  `private: true` field on a registered entity appears in `credentialFields[]`.
