// @ts-nocheck
'use strict';

const { factories } = require('@strapi/strapi');
const { ensureUser } = require('../../../utils/ensure-user');

module.exports = factories.createCoreController('api::notification.notification', ({ strapi }) => ({
    async processEvent(ctx) {
        const user = await ensureUser(ctx, strapi);
        if (!user) return;

        const body = ctx.request.body || {};
        const event_name = String(body.event_name || body.eventName || '').trim();
        if (!event_name) {
            return ctx.badRequest('event_name is required');
        }

        const result = await strapi
            .service('api::notification.notification-engine')
            .processEvent({
                event_name,
                entity_type: body.entity_type,
                entity_id: body.entity_id,
                payload: body.payload || {},
            });

        return ctx.send({
            data: {
                event: result.event,
                matchedRules: result.matchedRules,
                notificationsCreated: result.notifications.length,
            },
        });
    },

    async myNotifications(ctx) {
        const user = await ensureUser(ctx, strapi);
        if (!user) return;

        const unreadOnly = String(ctx.query.unreadOnly || 'false').toLowerCase() === 'true';
        const category = String(ctx.query.category || '').trim();
        const limit = Math.max(1, Math.min(Number(ctx.query.limit || 30), 100));

        const filters = {
            recipient_user: { id: { $eq: user.id } },
        };

        if (unreadOnly) {
            filters.is_read = { $eq: false };
        }

        if (category) {
            filters.category = { $eq: category };
        }

        const notifications = await strapi.documents('api::notification.notification').findMany({
            filters,
            sort: ['createdAt:desc'],
            pagination: { pageSize: limit },
        });

        return ctx.send({ data: notifications });
    },

    async markAsRead(ctx) {
        const user = await ensureUser(ctx, strapi);
        if (!user) return;

        const { documentId } = ctx.params;
        if (!documentId) {
            return ctx.badRequest('documentId is required');
        }

        const notification = await strapi.documents('api::notification.notification').findOne({
            documentId,
            populate: {
                recipient_user: {
                    fields: ['id'],
                },
            },
        });

        if (!notification) {
            return ctx.notFound('Notification not found');
        }

        if (notification.recipient_user?.id !== user.id) {
            return ctx.forbidden('You cannot update this notification');
        }

        const updated = await strapi.documents('api::notification.notification').update({
            documentId,
            data: {
                is_read: true,
                read_at: new Date(),
            },
        });

        return ctx.send({ data: updated });
    },
}));
