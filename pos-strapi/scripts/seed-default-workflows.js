'use strict';

/**
 * Seed default definable workflows (api::workflow.workflow) for:
 *   - mfg-work-order: a tailoring production flow where Cutting/Stitching/
 *     Finishing/QC are separate stages that all map to the canonical
 *     InProgress status (side effects still fire on Released/Completed/...)
 *   - sale-order: a 1:1 mirror of the canonical status graph, so the
 *     existing order-management UI and automations validate unchanged.
 *
 * Also back-fills stage_key on existing rows from their current status.
 *
 * Run from pos-strapi:  DATABASE_NAME=pos_db node scripts/seed-default-workflows.js
 * Skips an entity if it already has a workflow.
 */

const { createStrapi, compileStrapi } = require('@strapi/strapi');

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

async function main() {
  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();
  app.log.level = 'error';

  for (const def of [WO_WORKFLOW, SO_WORKFLOW, RR_WORKFLOW]) {
    const existing = await app.db.query(WF_UID).count({ where: { entity_uid: def.entity_uid } });
    if (existing > 0) {
      console.log(`Workflow for ${def.entity_uid} already exists — skipping.`);
      continue;
    }
    await app.documents(WF_UID).create({ data: def });
    console.log(`Created workflow "${def.name}".`);
  }

  // Back-fill stage_key from current status where missing.
  const knex = app.db.connection;
  const woMap = { Draft: 'draft', Released: 'released', InProgress: 'stitching', OnHold: 'on_hold', Completed: 'completed', Cancelled: 'cancelled' };
  for (const [status, key] of Object.entries(woMap)) {
    await knex('mfg_work_orders').where({ status }).whereNull('stage_key').update({ stage_key: key });
  }
  // sale-order's collectionName is "orders"
  await knex('orders').whereNull('stage_key').whereNotNull('order_status')
    .update({ stage_key: knex.raw('LOWER(order_status)') });
  await knex('return_requests').whereNull('stage_key').whereNotNull('status')
    .update({ stage_key: knex.raw('LOWER(status)') });
  console.log('Back-filled stage_key on existing work orders, sale orders, and return requests.');

  console.log('\nWorkflow seed complete ✔');
  await app.destroy();
  process.exit(0);
}

main().catch((err) => { console.error('SEED FAILED:', err); process.exit(1); });
