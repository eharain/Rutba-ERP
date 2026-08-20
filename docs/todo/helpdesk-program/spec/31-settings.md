# 31 — Settings

[← 30 Audit Logging](30-audit-logging.md) · [Index](00-index.md) · Next: [32 Configuration](32-configuration.md)

---

## 31.1 Purpose

Tenant-level switches: how the module connects to the world, how it looks, how long it keeps
things. **Settings** are global and mostly technical; **Configuration**
([32](32-configuration.md)) is the business vocabulary — desks, statuses, priorities, catalog.

The split matters because they have different audiences and different change frequencies. A
tenant admin edits configuration weekly and settings twice a year.

## 31.2 Resolution order

```
tenant setting  →  desk override (where the setting allows one)  →  user preference (where personal)
```

Every setting declares whether it is overridable and at which level. A setting with no declared
override level is tenant-wide and final.

## 31.3 General

| Setting | Type | Default | Notes |
|---|---|---|---|
| `module_enabled` | bool | true | Master switch |
| `default_desk` | ref | Customer Support | Fallback for unrouted intake |
| `default_priority` | enum | normal | |
| `ticket_no_format` | string | `HD-{YYYY}-{SEQ:6}` | See [32](32-configuration.md) |
| `default_timezone` | string | `Asia/Karachi` | Calendar default |
| `default_locale` | string | `en` | |
| `supported_locales` | list | `en`, `ur` | |
| `business_calendar` | ref | Standard | Tenant default |

## 31.4 Channels

### Email
`inbound_enabled` · `inbound_address` (per desk override) · `outbound_from_name` /
`outbound_from_address` · `reply_to_strategy` (`plus_addressing` | `per_desk_alias`) ·
`subject_reference_format` (`[{ticket_no}]`) · `strip_quoted_history` · `strip_signatures` ·
`auto_reply_enabled` · `bounce_handling`.

**Dependency:** Rutba-MTA inbound (RSMTPREST ingress) is documented as partial. Confirm before
enabling `inbound_enabled` in production.

### WhatsApp
`enabled` · `business_account_id` · `phone_number_id` · `template_namespace` ·
`session_window_hours` (24) · `fallback_to_email`.

**Constraint worth stating in settings:** outside the 24-hour session window, WhatsApp permits
only pre-approved template messages. A desk that assumes free-text replies will silently fail
to reach customers after a day. The fallback is not optional.

### SMS
`enabled` · `provider` · `sender_id` · `only_for_priorities` (default `urgent`).

### Web / portal
`portal_enabled` · `anonymous_submission_enabled` (per desk) · `require_email_verification` ·
`captcha_enabled` (public forms) · `portal_url`.

## 31.5 SLA & calendars

`sla_enabled` · `default_policy` · `pause_on_waiting` · `at_risk_threshold_pct` (80) ·
`sweep_interval_minutes` (15) · `breach_notification_recipients` · `allow_sla_extension` ·
`extension_requires_reason` (true, not overridable).

## 31.6 AI

`ai_enabled` (master) · per-feature toggles (`classification`, `suggested_replies`,
`summarisation`, `duplicates`, `translation`, `kb_draft`) · `monthly_cost_limit` ·
`cost_warning_pct` (80) · `pii_redaction_enabled` · `desk_overrides` (restricted desks default
to off) · `auto_reply_desks` (explicit allow-list, empty by default).

## 31.7 Notifications

`default_channel` per audience · `quiet_hours` (start/end/timezone) · `digest_enabled` and
frequency · `collapse_window_minutes` · `max_notifications_per_ticket_per_hour` ·
`unsubscribe_allowed_types` (operationally required messages excluded).

## 31.8 Branding

`logo`, `favicon`, `primary_colour`, `accent_colour` · `email_header` / `email_footer` ·
`portal_welcome_text` · `signature_template` · `custom_css` (portal only, sanitised).

**Rule:** branding never affects the internal/public visual distinction in the agent composer
([18 §18.4](18-agent-workspace.md)). A tenant must not be able to theme away the safety
affordance that stops internal notes being sent to customers.

## 31.9 Retention

| Setting | Default |
|---|---|
| `ticket_retention_years` | 7 |
| `attachment_retention_years` | 7 |
| `audit_retention_years` | 7 (independent of tickets) |
| `event_retention_days` | 90 |
| `notification_log_retention_days` | 180 |
| `ai_log_retention_days` | 90 |
| `purge_enabled` | false |
| `purge_requires_confirmation` | true |

Purge is **off by default and irreversible when on**. It runs as a scheduled job, is audited,
records what was removed without retaining its content, and never removes audit rows.

## 31.10 Security

`session_timeout_minutes` · `require_2fa_for_admin` · `ip_allowlist` (admin surfaces) ·
`export_requires_reason` · `elevation_enabled` and `elevation_max_minutes` (60) ·
`attachment_max_mb` and `attachment_allowed_types` · `rate_limits` (per §27.9) ·
`webhook_signature_required` (true, not overridable).

## 31.11 Integrations

Webhooks (URL, secret, events, active) · outbound API tokens · CRM sync toggles ·
marketplace channel mapping · remote-support provider and policy
([epic-5](../epic-5-remote-support.md)).

## 31.12 Administration

- **Audited.** Every setting change writes an audit row with before and after
  ([30 §30.4](30-audit-logging.md)) and appears in the configuration change log.
- **Validated.** Settings that reference other records (desks, policies, calendars) are
  validated on save; a dangling reference is refused rather than discovered at runtime.
- **Sensitive values write-only.** API keys and secrets are never returned by the API after
  being set — the UI shows "configured" and offers replacement, never the value.
- **Impact warnings.** Changing SLA defaults, retention or channel settings shows what it will
  affect (e.g. "1,204 open tickets use this policy") before saving.
- **Export/import** of a settings profile for tenant provisioning, with secrets excluded.

## 31.13 API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/helpdesk/settings` | All (secrets masked) |
| GET | `/api/helpdesk/settings/:group` | One group |
| PATCH | `/api/helpdesk/settings/:group` | Update (admin, audited) |
| POST | `/api/helpdesk/settings/test-channel` | Test email/WhatsApp/SMS delivery |
| GET | `/api/helpdesk/settings/export` · POST `/import` | Provisioning profile |

`test-channel` matters: channel misconfiguration otherwise surfaces as customers silently not
receiving replies, which is discovered weeks later through complaints.

## 31.14 Permissions

`settings.read` (admin; manager sees a read-only subset relevant to their desks) ·
`settings.manage` (admin) · `settings.secrets` (admin, additionally gated by 2FA where enabled).

---

## Acceptance criteria for this section

- [ ] Every setting change is audited with before/after.
- [ ] Secrets are never returned by any endpoint after being set.
- [ ] Dangling references are refused on save.
- [ ] Impact warnings shown for SLA, retention and channel changes.
- [ ] Purge is off by default, audited, and never removes audit rows.
- [ ] Branding cannot alter the internal/public composer distinction.
- [ ] `test-channel` verifies real delivery for each configured channel.
