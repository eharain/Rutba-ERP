# Rutba CRM Notification System (Strapi)

## Overview
This implementation adds a scalable event-driven, rule-based notification subsystem on top of existing Strapi notification schemas.

- Primary channel: **in-app**
- Email channel: **critical events only**
- Rule engine: CMS-editable templates/rules (`notification-template`)
- Event processor: centralized service (`notification-engine`)
- Delivery audit: `notification-log`

## Data Models

### 1) Notification Template (extended existing)
UID: `api::notification-template.notification-template`

Purpose: rule definitions + message templates.

Key fields:
- `event_name` (string) – canonical dot event (`order.created`)
- `trigger_event` (legacy enum) – backward compatibility
- `category` – `orders_payments | account_security | cart_activity | wishlist_interest | promotions_offers | customer_support | stock_management`
- `priority` – `critical | high | medium`
- `audience` – `user | admin | both | opposite_party`
- `is_critical`, `send_email`
- `delay_minutes`, `dedup_window_minutes`
- `conditions` (JSON)
- `subject`, `body_template`
- `channels` (JSON; in-app primary)
- `is_active`, `is_enabled`

### 2) Notification (new)
UID: `api::notification.notification`

Purpose: in-app notification records per recipient.

Key fields:
- `title`, `message`, `event_name`, `category`, `priority`
- `channels`, `is_read`, `read_at`, `is_email_sent`
- `audience`, `dedup_key`, `payload`
- `reference_type`, `reference_id`
- `recipient_user` relation
- `template` relation

### 3) Notification Event (new)
UID: `api::notification-event.notification-event`

Purpose: event ledger and processing state.

Key fields:
- `event_name`, `entity_type`, `entity_id`, `payload`
- `status` (`pending|processed|failed|deduplicated`)
- `processed_at`, `error_message`

### 4) Notification Preference (new)
UID: `api::notification-preference.notification-preference`

Purpose: user-level preference overrides.

Key fields:
- `user` relation
- `category`
- `in_app_enabled`, `email_enabled`
- `minimum_priority`

### 5) Notification Log (extended existing)
UID: `api::notification-log.notification-log`

Purpose: channel-level delivery and dedup audit.

Added fields include:
- `event_name`, `category`, `priority`, `channel`
- `notification` relation
- `recipient_user_id`, `recipient_role_type`
- `dedup_key`, `is_duplicate`
- `metadata`

### 6) Contact Ticket (new)
UID: `api::contact-ticket.contact-ticket`

Purpose: support flow source for contact-related notification events.

Key fields:
- `ticket_no`, `subject`, `message`, `status`
- `sla_due_at`, `resolved_at`
- `last_reply_by`, `last_reply_at`
- `user`, `assigned_to`

## API Endpoints

### Notification APIs
- `POST /api/notifications/process-event`
  - Triggers event ingestion and rule processing.
  - Body: `{ event_name, entity_type?, entity_id?, payload? }`

- `GET /api/notifications/me?unreadOnly=true&category=...&limit=30`
  - Returns authenticated user notifications.

- `POST /api/notifications/:documentId/read`
  - Marks a notification as read.

### Contact Ticket Flow APIs
- `POST /api/contact-tickets/submit`
  - Creates ticket and emits `contact.submitted`.

- `POST /api/contact-tickets/:documentId/reply`
  - Stores latest reply metadata and emits `contact.reply.added`.

- `POST /api/contact-tickets/:documentId/sla-breach`
  - Emits `contact.sla.breach` (admin-focused).

## Event Processor & Rule Engine

Service: `api::notification.notification-engine`

Pipeline:
1. Persist incoming event in `notification-event`.
2. Load matching active templates/rules.
3. Evaluate rule `conditions` against payload.
4. Resolve recipients by `audience`:
   - `user`: payload user
   - `admin`: users with role type `rutba_app_user`
   - `both`: union of above
   - `opposite_party`: based on `reply_by`
5. Enforce user preference (`notification-preference`).
6. Deduplicate using `dedup_key` + `dedup_window_minutes`.
7. Create in-app `notification`.
8. Send email only when effective priority is critical.
9. Write delivery log (`notification-log`).
10. Mark event status as processed/failed/deduplicated.

## Contact Us Rules Coverage

- `contact.submitted` → notifies **user + admin** (`audience=both`)
- `contact.reply.added` → notifies **opposite party** (`audience=opposite_party`)
- `contact.sla.breach` → **admin only** (`audience=admin`)

## Seed Data

Added: `src/seed/data/notification-template.json`

Includes high-value seeds for:
- Buyer: order confirmed, payment failed, order shipped, cart abandoned
- Support: contact submitted, support reply, SLA breach
- Stock management: low stock, stock out

These seeds are compatible with existing JSON seed runner and CMS editing flow.

## Scalability Notes

- Event ingestion is centralized and idempotency-friendly with dedup keys.
- Rules are data-driven and editable without deployments.
- Delivery and processing observability is persisted via event/log models.
- Future queue workers can process `notification-event(status=pending)` asynchronously without schema changes.
