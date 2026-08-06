'use strict';

/**
 * HR / ESS in-app notification templates.
 *
 * Shared idempotent body used by BOTH:
 *   - database/migrations/2026.08.06T00.00.00.hr-notification-templates.js
 *   - the seed registry (on-demand re-run from the CLI / seed control app)
 *
 * These are the templates the HR module's trigger sites fire against — leave
 * submitted/approved/rejected, expense claim and payroll decisions, lifecycle
 * events, appraisal completion, training completion, safety incidents, issued
 * documents and the daily birthday sweep. Without a matching template row the
 * engine resolves no recipients and the event is silently dropped, so these are
 * load-bearing rather than decorative.
 *
 * They live here rather than in src/seed/data/notification-template.json for two
 * reasons: that file carries revertOnSeed:true (it rewrites rows on every run,
 * clobbering any wording HR has tuned), and a dedicated entry can be re-run on
 * its own from the seed app without touching the storefront templates.
 *
 * All are in_app only and non-critical by design — HR notifications should not
 * generate email out of the box. Turn send_email on per template once a mail
 * route is agreed.
 *
 * Idempotent: inserts only the templates whose `name` is not already present,
 * so re-running never duplicates and never overwrites edited copy.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<{created:number, skipped:number}>}
 */

const TEMPLATES = [
    {
        "name": "Leave Submitted (Manager)",
        "event_name": "hr.leave.submitted",
        "trigger_event": "none",
        "category": "hr_workflow",
        "priority": "medium",
        "audience": "user",
        "is_critical": false,
        "send_email": false,
        "channels": [
            "in_app"
        ],
        "delay_minutes": 0,
        "dedup_window_minutes": 5,
        "subject": "Leave request awaiting your approval",
        "body_template": "{employee_name} submitted a {leave_type} leave request.",
        "available_variables": [
            "leave_request_id",
            "leave_type",
            "employee_name",
            "user_id"
        ],
        "send_to": "staff"
    },
    {
        "name": "Leave Approved (Employee)",
        "event_name": "hr.leave.approved",
        "trigger_event": "none",
        "category": "hr_workflow",
        "priority": "medium",
        "audience": "user",
        "is_critical": false,
        "send_email": false,
        "channels": [
            "in_app"
        ],
        "delay_minutes": 0,
        "dedup_window_minutes": 5,
        "subject": "Leave request approved",
        "body_template": "Your {leave_type} leave request has been approved.",
        "available_variables": [
            "leave_request_id",
            "leave_type",
            "user_id"
        ],
        "send_to": "customer"
    },
    {
        "name": "Leave Rejected (Employee)",
        "event_name": "hr.leave.rejected",
        "trigger_event": "none",
        "category": "hr_workflow",
        "priority": "medium",
        "audience": "user",
        "is_critical": false,
        "send_email": false,
        "channels": [
            "in_app"
        ],
        "delay_minutes": 0,
        "dedup_window_minutes": 5,
        "subject": "Leave request rejected",
        "body_template": "Your {leave_type} leave request was rejected.{reason}",
        "available_variables": [
            "leave_request_id",
            "leave_type",
            "reason",
            "user_id"
        ],
        "send_to": "customer"
    },
    {
        "name": "Loan Decided (Employee)",
        "event_name": "hr.loan.approved",
        "trigger_event": "none",
        "category": "hr_workflow",
        "priority": "medium",
        "audience": "user",
        "is_critical": false,
        "send_email": false,
        "channels": [
            "in_app"
        ],
        "delay_minutes": 0,
        "dedup_window_minutes": 5,
        "subject": "Loan request approved",
        "body_template": "Your loan request for {principal_amount} has been approved.",
        "available_variables": [
            "loan_id",
            "principal_amount",
            "user_id"
        ],
        "send_to": "customer"
    },
    {
        "name": "Loan Rejected (Employee)",
        "event_name": "hr.loan.rejected",
        "trigger_event": "none",
        "category": "hr_workflow",
        "priority": "medium",
        "audience": "user",
        "is_critical": false,
        "send_email": false,
        "channels": [
            "in_app"
        ],
        "delay_minutes": 0,
        "dedup_window_minutes": 5,
        "subject": "Loan request rejected",
        "body_template": "Your loan request for {principal_amount} was rejected.{reason}",
        "available_variables": [
            "loan_id",
            "principal_amount",
            "reason",
            "user_id"
        ],
        "send_to": "customer"
    },
    {
        "name": "Advance Decided (Employee)",
        "event_name": "hr.advance.approved",
        "trigger_event": "none",
        "category": "hr_workflow",
        "priority": "medium",
        "audience": "user",
        "is_critical": false,
        "send_email": false,
        "channels": [
            "in_app"
        ],
        "delay_minutes": 0,
        "dedup_window_minutes": 5,
        "subject": "Salary advance approved",
        "body_template": "Your salary advance request for {amount} has been approved.",
        "available_variables": [
            "advance_id",
            "amount",
            "user_id"
        ],
        "send_to": "customer"
    },
    {
        "name": "Advance Rejected (Employee)",
        "event_name": "hr.advance.rejected",
        "trigger_event": "none",
        "category": "hr_workflow",
        "priority": "medium",
        "audience": "user",
        "is_critical": false,
        "send_email": false,
        "channels": [
            "in_app"
        ],
        "delay_minutes": 0,
        "dedup_window_minutes": 5,
        "subject": "Salary advance rejected",
        "body_template": "Your salary advance request for {amount} was rejected.{reason}",
        "available_variables": [
            "advance_id",
            "amount",
            "reason",
            "user_id"
        ],
        "send_to": "customer"
    },
    {
        "name": "Expense Claim Submitted (Manager)",
        "event_name": "hr.expense.submitted",
        "trigger_event": "none",
        "category": "hr_workflow",
        "priority": "medium",
        "audience": "user",
        "is_critical": false,
        "send_email": false,
        "channels": [
            "in_app"
        ],
        "delay_minutes": 0,
        "dedup_window_minutes": 5,
        "subject": "Expense claim awaiting your approval",
        "body_template": "{employee_name} submitted an expense claim for {amount}.",
        "available_variables": [
            "claim_id",
            "amount",
            "employee_name",
            "user_id"
        ],
        "send_to": "staff"
    },
    {
        "name": "Expense Claim Decided (Employee)",
        "event_name": "hr.expense.approved",
        "trigger_event": "none",
        "category": "hr_workflow",
        "priority": "medium",
        "audience": "user",
        "is_critical": false,
        "send_email": false,
        "channels": [
            "in_app"
        ],
        "delay_minutes": 0,
        "dedup_window_minutes": 5,
        "subject": "Expense claim approved",
        "body_template": "Your expense claim for {amount} has been approved.",
        "available_variables": [
            "claim_id",
            "amount",
            "user_id"
        ],
        "send_to": "customer"
    },
    {
        "name": "Expense Claim Rejected (Employee)",
        "event_name": "hr.expense.rejected",
        "trigger_event": "none",
        "category": "hr_workflow",
        "priority": "medium",
        "audience": "user",
        "is_critical": false,
        "send_email": false,
        "channels": [
            "in_app"
        ],
        "delay_minutes": 0,
        "dedup_window_minutes": 5,
        "subject": "Expense claim rejected",
        "body_template": "Your expense claim for {amount} was rejected.{reason}",
        "available_variables": [
            "claim_id",
            "amount",
            "reason",
            "user_id"
        ],
        "send_to": "customer"
    },
    {
        "name": "Expense Claim Reimbursed (Employee)",
        "event_name": "hr.expense.reimbursed",
        "trigger_event": "none",
        "category": "hr_workflow",
        "priority": "medium",
        "audience": "user",
        "is_critical": false,
        "send_email": false,
        "channels": [
            "in_app"
        ],
        "delay_minutes": 0,
        "dedup_window_minutes": 5,
        "subject": "Expense claim reimbursed",
        "body_template": "Your expense claim for {amount} has been reimbursed.",
        "available_variables": [
            "claim_id",
            "amount",
            "user_id"
        ],
        "send_to": "customer"
    },
    {
        "name": "Lifecycle Event Recorded (Employee)",
        "event_name": "hr.lifecycle.recorded",
        "trigger_event": "none",
        "category": "hr_lifecycle",
        "priority": "medium",
        "audience": "user",
        "is_critical": false,
        "send_email": false,
        "channels": [
            "in_app"
        ],
        "delay_minutes": 0,
        "dedup_window_minutes": 5,
        "subject": "A new record was added to your HR file",
        "body_template": "A {event_type} event was recorded on your HR timeline.",
        "available_variables": [
            "lifecycle_event_id",
            "event_type",
            "effective_date",
            "user_id"
        ],
        "send_to": "customer"
    },
    {
        "name": "Employee Birthday Today (Manager+Admin)",
        "event_name": "hr.birthday.today",
        "trigger_event": "none",
        "category": "hr_lifecycle",
        "priority": "medium",
        "audience": "both",
        "is_critical": false,
        "send_email": false,
        "channels": [
            "in_app"
        ],
        "delay_minutes": 0,
        "dedup_window_minutes": 1440,
        "subject": "Birthday today",
        "body_template": "It's {employee_name}'s birthday today.",
        "available_variables": [
            "employee_id",
            "employee_name",
            "user_id"
        ],
        "send_to": "staff"
    },
    {
        "name": "Appraisal Completed (Employee)",
        "event_name": "hr.appraisal.completed",
        "trigger_event": "none",
        "category": "hr_workflow",
        "priority": "medium",
        "audience": "user",
        "is_critical": false,
        "send_email": false,
        "channels": [
            "in_app"
        ],
        "delay_minutes": 0,
        "dedup_window_minutes": 5,
        "subject": "Your appraisal is complete",
        "body_template": "Your performance review has been completed. Final rating: {final_rating}.",
        "available_variables": [
            "appraisal_id",
            "final_rating",
            "user_id"
        ],
        "send_to": "customer"
    },
    {
        "name": "Training Completed (Employee)",
        "event_name": "hr.training.completed",
        "trigger_event": "none",
        "category": "hr_workflow",
        "priority": "medium",
        "audience": "user",
        "is_critical": false,
        "send_email": false,
        "channels": [
            "in_app"
        ],
        "delay_minutes": 0,
        "dedup_window_minutes": 5,
        "subject": "Training marked complete",
        "body_template": "Your training has been marked complete.",
        "available_variables": [
            "enrollment_id",
            "user_id"
        ],
        "send_to": "customer"
    },
    {
        "name": "Safety Incident Reported (Admin)",
        "event_name": "hr.incident.reported",
        "trigger_event": "none",
        "category": "hr_lifecycle",
        "priority": "medium",
        "audience": "admin",
        "is_critical": false,
        "send_email": false,
        "channels": [
            "in_app"
        ],
        "delay_minutes": 0,
        "dedup_window_minutes": 5,
        "subject": "Safety incident reported",
        "body_template": "A {severity} severity {incident_type} incident was reported at {location}.",
        "available_variables": [
            "incident_id",
            "severity",
            "incident_type",
            "location"
        ],
        "send_to": "admin"
    },
    {
        "name": "Document Issued (Employee)",
        "event_name": "hr.document.issued",
        "trigger_event": "none",
        "category": "hr_lifecycle",
        "priority": "medium",
        "audience": "user",
        "is_critical": false,
        "send_email": false,
        "channels": [
            "in_app"
        ],
        "delay_minutes": 0,
        "dedup_window_minutes": 5,
        "subject": "A document was issued to you",
        "body_template": "Your {document_type} letter ({reference_no}) is available in My Documents.",
        "available_variables": [
            "document_id",
            "document_type",
            "reference_no",
            "user_id"
        ],
        "send_to": "customer"
    }
];

const crypto = require('crypto');

/**
 * Strapi 5 identifies every row by `document_id`, and the document service
 * refuses to link a relation whose target has none. A raw knex insert does NOT
 * generate one, so a template seeded this way looks fine in the table but makes
 * notification-engine.processEvent throw "Invalid relations" when it tries to
 * attach `template` to the notification it just built — and because every HR
 * trigger site wraps processEvent in a best-effort try/catch, the failure
 * surfaces as nothing happening at all. Generate an id in the same 24-char
 * lowercase-alphanumeric shape Strapi uses.
 */
function generateDocumentId() {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const alphabet = letters + '0123456789';
    const bytes = crypto.randomBytes(24);
    // First character MUST be a letter. Strapi's relation resolver coerces a
    // numeric-looking documentId to an integer, so an id like "4j83…" is read
    // as 4 (MySQL then truncates and errors) and "0tgy…" as 0 (the relation
    // "does not exist"). Letter-initial ids sidestep the coercion entirely and
    // match the shape Strapi's own generator produces.
    let out = letters[bytes[0] % letters.length];
    for (let i = 1; i < 24; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
}

async function applyHrNotificationTemplates(knex) {
    const tableExists = await knex.schema.hasTable('notification_templates');
    if (!tableExists) return { created: 0, skipped: 0 };

    const names = TEMPLATES.map((t) => t.name);
    const existing = await knex('notification_templates').whereIn('name', names).select('name');
    const have = new Set(existing.map((r) => r.name));

    const now = new Date();
    const toInsert = TEMPLATES.filter((t) => !have.has(t.name)).map((t) => ({
        document_id: generateDocumentId(),
        name: t.name,
        event_name: t.event_name,
        // 'none' keeps these off the legacy trigger_event path — they are fired
        // explicitly by the HR controllers via notification-engine.processEvent,
        // not by the sale-order trigger map. A real trigger_event here would make
        // them fire on unrelated storefront events.
        trigger_event: t.trigger_event,
        category: t.category,
        priority: t.priority,
        audience: t.audience,
        is_critical: t.is_critical,
        send_email: t.send_email,
        // JSON column on Postgres / longtext on MySQL — serialise so both
        // engines store it the same way.
        channels: JSON.stringify(t.channels),
        channel: 'in_app',
        delay_minutes: t.delay_minutes,
        dedup_window_minutes: t.dedup_window_minutes,
        subject: t.subject,
        body_template: t.body_template,
        available_variables: JSON.stringify(t.available_variables),
        scope: 'global',
        send_to: t.send_to,
        is_active: true,
        is_enabled: true,
        created_at: now,
        updated_at: now,
        published_at: now,
    }));

    if (toInsert.length > 0) {
        await knex('notification_templates').insert(toInsert);
    }

    // Repair rows that are present (so the skip path above leaves them alone)
    // but unusable as a relation target, which silently breaks delivery: a NULL
    // document_id, or one starting with a digit — Strapi coerces those to an
    // integer, so the link truncates or resolves to nothing.
    const suspect = await knex('notification_templates')
        .whereIn('name', names)
        .select('id', 'document_id');
    const orphaned = suspect.filter((r) => r.document_id == null || /^[0-9]/.test(String(r.document_id)));
    for (const row of orphaned) {
        await knex('notification_templates')
            .where({ id: row.id })
            .update({ document_id: generateDocumentId() });
    }

    return {
        created: toInsert.length,
        skipped: TEMPLATES.length - toInsert.length,
        repaired: orphaned.length,
    };
}

module.exports = {
    applyHrNotificationTemplates,
    HR_NOTIFICATION_TEMPLATES: TEMPLATES,
    // Shared with the other knex-based template seeders — a raw insert must
    // supply document_id or the row cannot be linked as a relation.
    generateDocumentId,
};
