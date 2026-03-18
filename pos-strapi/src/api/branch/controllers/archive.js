'use strict';

/**
 * archive controller
 *
 * POST /branches/:id/archive-stock
 *
 * Archives stock items linked to a branch that are in terminal statuses
 * and older than a given cutoff date. "Archiving" sets archived=true and
 * archived_at on each matching stock item without deleting any data.
 *
 * Body:
 *   cutoffDate    – ISO date string; items updated before this date are archived
 *   statuses      – optional array of statuses to archive (defaults to all terminal)
 *   dryRun        – if true, returns the count without modifying data
 */

const TERMINAL_STATUSES = [
  'Sold',
  'Returned',
  'ReturnedDamaged',
  'ReturnedToSupplier',
  'Damaged',
  'Lost',
  'Expired',
];

module.exports = {
  async archiveStock(ctx) {
    const { id: branchDocumentId } = ctx.params;
    const { cutoffDate, statuses, dryRun } = ctx.request.body || {};

    if (!cutoffDate) {
      return ctx.badRequest('cutoffDate is required (ISO date string).');
    }

    const parsedDate = new Date(cutoffDate);
    if (isNaN(parsedDate.getTime())) {
      return ctx.badRequest('cutoffDate is not a valid date.');
    }

    // Resolve branch by documentId
    const branch = await strapi.documents('api::branch.branch').findFirst({
      filters: { documentId: branchDocumentId },
      fields: ['id', 'documentId', 'name'],
    });
    if (!branch) {
      return ctx.notFound('Branch not found.');
    }

    const allowedStatuses = Array.isArray(statuses) && statuses.length > 0
      ? statuses.filter(s => TERMINAL_STATUSES.includes(s))
      : TERMINAL_STATUSES;

    if (allowedStatuses.length === 0) {
      return ctx.badRequest('No valid terminal statuses provided.');
    }

    // Build filters for stock items to archive
    const filters = {
      branch: { documentId: branchDocumentId },
      status: { $in: allowedStatuses },
      updatedAt: { $lt: parsedDate.toISOString() },
      $or: [
        { archived: false },
        { archived: { $null: true } },
      ],
    };

    // Count matching items
    const count = await strapi.entityService.count('api::stock-item.stock-item', {
      filters,
    });

    if (dryRun) {
      return ctx.send({
        dryRun: true,
        branch: { documentId: branch.documentId, name: branch.name },
        cutoffDate: parsedDate.toISOString(),
        statuses: allowedStatuses,
        matchingItems: count,
      });
    }

    if (count === 0) {
      return ctx.send({
        archived: 0,
        branch: { documentId: branch.documentId, name: branch.name },
        cutoffDate: parsedDate.toISOString(),
        statuses: allowedStatuses,
      });
    }

    // Archive in batches using direct DB queries for performance
    const now = new Date().toISOString();
    const BATCH_SIZE = 200;
    let totalArchived = 0;

    while (totalArchived < count) {
      const items = await strapi.entityService.findMany('api::stock-item.stock-item', {
        filters,
        limit: BATCH_SIZE,
        fields: ['id'],
      });

      if (!items || items.length === 0) break;

      for (const item of items) {
        await strapi.entityService.update('api::stock-item.stock-item', item.id, {
          data: { archived: true, archived_at: now },
        });
      }

      totalArchived += items.length;
    }

    return ctx.send({
      archived: totalArchived,
      branch: { documentId: branch.documentId, name: branch.name },
      cutoffDate: parsedDate.toISOString(),
      statuses: allowedStatuses,
    });
  },

  async unarchiveStock(ctx) {
    const { id: branchDocumentId } = ctx.params;
    const { stockItemIds } = ctx.request.body || {};

    if (!Array.isArray(stockItemIds) || stockItemIds.length === 0) {
      return ctx.badRequest('stockItemIds array is required.');
    }

    const branch = await strapi.documents('api::branch.branch').findFirst({
      filters: { documentId: branchDocumentId },
      fields: ['id', 'documentId', 'name'],
    });
    if (!branch) {
      return ctx.notFound('Branch not found.');
    }

    let restored = 0;
    for (const docId of stockItemIds) {
      const items = await strapi.entityService.findMany('api::stock-item.stock-item', {
        filters: {
          documentId: docId,
          branch: { documentId: branchDocumentId },
          archived: true,
        },
        limit: 1,
        fields: ['id'],
      });

      if (items && items.length > 0) {
        await strapi.entityService.update('api::stock-item.stock-item', items[0].id, {
          data: { archived: false, archived_at: null },
        });
        restored++;
      }
    }

    return ctx.send({
      restored,
      branch: { documentId: branch.documentId, name: branch.name },
    });
  },

  async archiveStats(ctx) {
    const { id: branchDocumentId } = ctx.params;

    const branch = await strapi.documents('api::branch.branch').findFirst({
      filters: { documentId: branchDocumentId },
      fields: ['id', 'documentId', 'name'],
    });
    if (!branch) {
      return ctx.notFound('Branch not found.');
    }

    const totalItems = await strapi.entityService.count('api::stock-item.stock-item', {
      filters: { branch: { documentId: branchDocumentId } },
    });

    const archivedItems = await strapi.entityService.count('api::stock-item.stock-item', {
      filters: { branch: { documentId: branchDocumentId }, archived: true },
    });

    const activeItems = totalItems - archivedItems;

    // Count by terminal status (non-archived)
    const statusCounts = {};
    for (const status of TERMINAL_STATUSES) {
      statusCounts[status] = await strapi.entityService.count('api::stock-item.stock-item', {
        filters: {
          branch: { documentId: branchDocumentId },
          status,
          $or: [
            { archived: false },
            { archived: { $null: true } },
          ],
        },
      });
    }

    return ctx.send({
      branch: { documentId: branch.documentId, name: branch.name },
      totalItems,
      archivedItems,
      activeItems,
      terminalStatusCounts: statusCounts,
    });
  },
};
