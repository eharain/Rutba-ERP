'use strict';

/**
 * Default definable workflows (api::workflow.workflow) for the manufacturing
 * and order-management modules. Registry seeder — this is what makes the
 * workflows survive a DB refresh (the old standalone scripts/seed-default-
 * workflows.js was never wired into the registry, so a fresh DB came up with
 * zero workflows and the state machines silently fell back to their hardcoded
 * TRANSITIONS maps).
 *
 * Seeds three workflows:
 *   - mfg-work-order: a tailoring production flow where Cutting/Stitching/
 *     Finishing/QC are separate stages that all map to the canonical InProgress
 *     status (side effects still fire on Released/Completed/... per the engine
 *     contract — stages map to statuses, statuses own side effects).
 *   - sale-order: a 1:1 mirror of the canonical order_status graph, so the
 *     existing order-management UI and automations validate unchanged.
 *   - return-request: a 1:1 mirror of the canonical return graph.
 *
 * Also back-fills stage_key on existing rows from their current status.
 *
 * Idempotent: skips an entity that already has a workflow; the stage_key
 * back-fill only touches NULL rows. Returns { created, updated, skipped }.
 *
 * @param {import('@strapi/strapi').Core.Strapi} strapi
 * @returns {Promise<{created:number, updated:number, skipped:number}>}
 */

const WO_UID = 'api::mfg-work-order.mfg-work-order';
const SO_UID = 'api::sale-order.sale-order';
const RR_UID = 'api::return-request.return-request';
const WF_UID = 'api::workflow.workflow';

const WO_WORKFLOW = {
    name: 'Work Order — Tailoring',
    entity_uid: WO_UID,
    description: 'Production flow for the stitching unit. Cutting/Stitching/Finishing/QC all map to the canonical InProgress status.',
    is_default: true,
    is_active: true,
    stages: [
        { key: 'draft', name: 'Draft', local_name: 'مسودہ', maps_to_status: 'Draft', sequence: 10, color: 'secondary', is_initial: true },
        { key: 'released', name: 'Released', local_name: 'جاری', maps_to_status: 'Released', sequence: 20, color: 'info' },
        { key: 'cutting', name: 'Cutting', local_name: 'کٹائی', maps_to_status: 'InProgress', sequence: 30, color: 'primary' },
        { key: 'stitching', name: 'Stitching', local_name: 'سلائی', maps_to_status: 'InProgress', sequence: 40, color: 'primary' },
        { key: 'finishing', name: 'Finishing', local_name: 'فنشنگ', maps_to_status: 'InProgress', sequence: 50, color: 'primary' },
        { key: 'qc', name: 'Final QC', local_name: 'حتمی معائنہ', maps_to_status: 'InProgress', sequence: 60, color: 'warning' },
        { key: 'completed', name: 'Completed', local_name: 'مکمل', maps_to_status: 'Completed', sequence: 70, color: 'success', is_terminal: true },
        { key: 'on_hold', name: 'On Hold', local_name: 'روکا گیا', maps_to_status: 'OnHold', sequence: 80, color: 'warning' },
        { key: 'cancelled', name: 'Cancelled', local_name: 'منسوخ', maps_to_status: 'Cancelled', sequence: 90, color: 'danger', is_terminal: true },
    ],
    transitions: [
        { from_key: 'draft', to_key: 'released', label: 'Release' },
        { from_key: 'draft', to_key: 'cancelled', label: 'Cancel' },
        { from_key: 'released', to_key: 'cutting', label: 'Start Cutting' },
        { from_key: 'released', to_key: 'on_hold', label: 'Hold' },
        { from_key: 'released', to_key: 'cancelled', label: 'Cancel' },
        { from_key: 'cutting', to_key: 'stitching', label: 'To Stitching' },
        { from_key: 'cutting', to_key: 'on_hold', label: 'Hold' },
        { from_key: 'cutting', to_key: 'cancelled', label: 'Cancel' },
        { from_key: 'stitching', to_key: 'finishing', label: 'To Finishing' },
        { from_key: 'stitching', to_key: 'on_hold', label: 'Hold' },
        { from_key: 'stitching', to_key: 'cancelled', label: 'Cancel' },
        { from_key: 'finishing', to_key: 'qc', label: 'Send to QC' },
        { from_key: 'finishing', to_key: 'on_hold', label: 'Hold' },
        { from_key: 'finishing', to_key: 'cancelled', label: 'Cancel' },
        { from_key: 'qc', to_key: 'completed', label: 'Approve & Complete' },
        { from_key: 'qc', to_key: 'stitching', label: 'Rework' },
        { from_key: 'qc', to_key: 'cancelled', label: 'Cancel' },
        { from_key: 'on_hold', to_key: 'cutting', label: 'Resume Cutting' },
        { from_key: 'on_hold', to_key: 'stitching', label: 'Resume Stitching' },
        { from_key: 'on_hold', to_key: 'finishing', label: 'Resume Finishing' },
        { from_key: 'on_hold', to_key: 'cancelled', label: 'Cancel' },
    ],
};

// 1:1 mirror of the canonical sale-order graph (keys = lowercase status).
const SO_STATUS_GRAPH = {
    PENDING_PAYMENT: ['PAYMENT_CONFIRMED', 'CANCELLED'],
    PAYMENT_CONFIRMED: ['PREPARING', 'CANCELLED'],
    PREPARING: ['AWAITING_PICKUP', 'CANCELLED'],
    AWAITING_PICKUP: ['OUT_FOR_DELIVERY', 'CANCELLED'],
    OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED_DELIVERY'],
    FAILED_DELIVERY: ['OUT_FOR_DELIVERY', 'CANCELLED'],
    DELIVERED: ['RETURN_REQUESTED'],
    RETURN_REQUESTED: ['RETURN_IN_TRANSIT', 'DELIVERED'],
    RETURN_IN_TRANSIT: ['RETURNED', 'DELIVERED'],
    RETURNED: ['REFUND_INITIATED'],
    CANCELLED: ['REFUND_INITIATED'],
    REFUND_INITIATED: ['REFUNDED'],
    REFUNDED: [],
};
const SO_COLORS = {
    PENDING_PAYMENT: 'secondary', PAYMENT_CONFIRMED: 'info', PREPARING: 'primary',
    AWAITING_PICKUP: 'info', OUT_FOR_DELIVERY: 'primary', DELIVERED: 'success',
    CANCELLED: 'danger', FAILED_DELIVERY: 'danger', RETURN_REQUESTED: 'warning',
    RETURN_IN_TRANSIT: 'warning', RETURNED: 'warning', REFUND_INITIATED: 'info',
    REFUNDED: 'dark',
};
function titleCase(s) {
    return s.toLowerCase().split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}
const SO_WORKFLOW = {
    name: 'Sale Order — Standard Delivery',
    entity_uid: SO_UID,
    description: 'Mirror of the built-in order lifecycle. Edit stages/transitions to customise; keep every status used by automations mapped.',
    is_default: true,
    is_active: true,
    stages: Object.keys(SO_STATUS_GRAPH).map((status, i) => ({
        key: status.toLowerCase(),
        name: titleCase(status),
        maps_to_status: status,
        sequence: (i + 1) * 10,
        color: SO_COLORS[status] || 'secondary',
        is_initial: status === 'PENDING_PAYMENT',
        is_terminal: status === 'REFUNDED',
    })),
    transitions: Object.entries(SO_STATUS_GRAPH).flatMap(([from, tos]) =>
        tos.map((to) => ({ from_key: from.toLowerCase(), to_key: to.toLowerCase(), label: titleCase(to) }))),
};

// 1:1 mirror of the return-request graph (keys = lowercase status).
const RR_STATUS_GRAPH = {
    REQUESTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: ['AWAITING_PICKUP', 'RECEIVED', 'CANCELLED'],
    AWAITING_PICKUP: ['RECEIVED', 'CANCELLED'],
    RECEIVED: ['COMPLETED'],
    COMPLETED: [],
    REJECTED: [],
    CANCELLED: [],
};
const RR_COLORS = {
    REQUESTED: 'secondary', APPROVED: 'info', AWAITING_PICKUP: 'primary',
    RECEIVED: 'warning', COMPLETED: 'success', REJECTED: 'danger', CANCELLED: 'dark',
};
const RR_WORKFLOW = {
    name: 'Return Request — Standard',
    entity_uid: RR_UID,
    description: 'Mirror of the built-in return lifecycle. RECEIVED owns the restock walk; status changes mirror onto the parent order.',
    is_default: true,
    is_active: true,
    stages: Object.keys(RR_STATUS_GRAPH).map((status, i) => ({
        key: status.toLowerCase(),
        name: titleCase(status),
        maps_to_status: status,
        sequence: (i + 1) * 10,
        color: RR_COLORS[status] || 'secondary',
        is_initial: status === 'REQUESTED',
        is_terminal: ['COMPLETED', 'REJECTED', 'CANCELLED'].includes(status),
    })),
    transitions: Object.entries(RR_STATUS_GRAPH).flatMap(([from, tos]) =>
        tos.map((to) => ({ from_key: from.toLowerCase(), to_key: to.toLowerCase(), label: titleCase(to) }))),
};

const WORKFLOWS = [WO_WORKFLOW, SO_WORKFLOW, RR_WORKFLOW];

async function seedDefaultWorkflows(strapi) {
    let created = 0;
    let skipped = 0;

    for (const def of WORKFLOWS) {
        const existing = await strapi.db.query(WF_UID).count({ where: { entity_uid: def.entity_uid } });
        if (existing > 0) {
            skipped += 1;
            continue;
        }
        await strapi.documents(WF_UID).create({ data: def });
        created += 1;
    }

    // Back-fill stage_key from current status where missing. Only NULL rows are
    // touched, so this is safe to re-run.
    const knex = strapi.db.connection;
    const woMap = { Draft: 'draft', Released: 'released', InProgress: 'stitching', OnHold: 'on_hold', Completed: 'completed', Cancelled: 'cancelled' };
    if (await knex.schema.hasTable('mfg_work_orders')) {
        for (const [status, key] of Object.entries(woMap)) {
            await knex('mfg_work_orders').where({ status }).whereNull('stage_key').update({ stage_key: key });
        }
    }
    // sale-order's collectionName is "orders".
    if (await knex.schema.hasTable('orders')) {
        await knex('orders').whereNull('stage_key').whereNotNull('order_status')
            .update({ stage_key: knex.raw('LOWER(order_status)') });
    }
    if (await knex.schema.hasTable('return_requests')) {
        await knex('return_requests').whereNull('stage_key').whereNotNull('status')
            .update({ stage_key: knex.raw('LOWER(status)') });
    }

    return { created, updated: 0, skipped };
}

module.exports = { seedDefaultWorkflows, WORKFLOWS };
