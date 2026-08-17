// @ts-nocheck
'use strict';

const PRIORITY_WEIGHT = {
    medium: 1,
    high: 2,
    critical: 3,
};

function normalizeEventName(value) {
    return String(value || '').trim();
}

function normalizeLegacyEvent(value) {
    return String(value || '').trim().replace(/_/g, '.');
}

function getPathValue(obj, path) {
    return String(path || '')
        .split('.')
        .filter(Boolean)
        .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function renderText(template, payload) {
    if (!template) return '';

    const renderValue = (rawKey) => {
        const key = String(rawKey || '').trim();
        if (!key) return '';
        const val = getPathValue(payload, key);
        return val === undefined || val === null ? '' : String(val);
    };

    return String(template)
        .replace(/\#\{([^}]+)\}/g, (_, key) => renderValue(key))
        .replace(/\{([^}]+)\}/g, (_, key) => renderValue(key))
        .replace(/\{\{([^}]+)\}\}/g, (_, key) => renderValue(key));
}

function uniqueById(items = []) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
        if (!item?.id || seen.has(item.id)) continue;
        seen.add(item.id);
        result.push(item);
    }
    return result;
}

module.exports = {
    async processEvent(input = {}) {
        const eventName = normalizeEventName(input.event_name || input.eventName);
        if (!eventName) {
            throw new Error('event_name is required');
        }

        const payload = input.payload && typeof input.payload === 'object' ? input.payload : {};
        const entityType = input.entity_type || input.entityType || payload.entity_type || null;
        const entityId = input.entity_id || input.entityId || payload.entity_id || null;

        const eventRecord = await strapi.documents('api::notification-event.notification-event').create({
            data: {
                event_name: eventName,
                entity_type: entityType,
                entity_id: entityId,
                payload,
                status: 'pending',
            },
        });

        try {
            const templates = await strapi.documents('api::notification-template.notification-template').findMany({
                filters: {
                    $and: [
                        {
                            $or: [
                                { event_name: { $eq: eventName } },
                                { trigger_event: { $eq: eventName.replace(/\./g, '_') } },
                            ],
                        },
                        {
                            $or: [
                                { is_active: { $eq: true } },
                                { is_enabled: { $eq: true } },
                            ],
                        },
                    ],
                },
                populate: ['branch'],
            });

            if (!templates?.length) {
                await strapi.documents('api::notification-event.notification-event').update({
                    documentId: eventRecord.documentId,
                    data: {
                        status: 'processed',
                        processed_at: new Date(),
                    },
                });
                return { event: eventRecord, notifications: [], matchedRules: 0 };
            }

            const createdNotifications = [];
            let hasDelivered = false;

            for (const template of templates) {
                if (!this.matchesConditions(template.conditions, payload)) {
                    continue;
                }

                const recipients = await this.resolveRecipients(template, payload);
                if (!recipients.length) {
                    continue;
                }

                const priority = String(template.priority || (template.is_critical ? 'critical' : 'medium')).toLowerCase();
                const isCritical = Boolean(template.is_critical || priority === 'critical');
                const category = template.category || 'orders_payments';
                const channels = this.resolveChannels(template, isCritical);

                for (const recipient of recipients) {
                    const preference = await this.getUserPreference(recipient.id, category);
                    if (!this.isInAppAllowed(preference, priority)) {
                        continue;
                    }

                    const dedupKey = this.buildDedupKey({
                        eventName,
                        template,
                        recipient,
                        entityType,
                        entityId,
                        payload,
                    });

                    const isDuplicate = await this.isDuplicate(dedupKey, template.dedup_window_minutes || 60);
                    if (isDuplicate) {
                        await this.writeLog({
                            template,
                            eventName,
                            category,
                            priority,
                            recipient,
                            dedupKey,
                            status: 'pending',
                            channel: 'in_app',
                            isDuplicate: true,
                            metadata: { skipped: 'deduplicated' },
                        });
                        continue;
                    }

                    const title = renderText(template.subject || template.name || 'Notification', payload);
                    const message = renderText(template.body_template || '', payload);

                    const created = await strapi.documents('api::notification.notification').create({
                        data: {
                            title,
                            message,
                            event_name: eventName,
                            category,
                            priority,
                            channels,
                            audience: template.audience || 'user',
                            payload,
                            dedup_key: dedupKey,
                            is_email_sent: false,
                            recipient_user: { id: recipient.id },
                            template: { documentId: template.documentId },
                            reference_type: entityType,
                            reference_id: entityId,
                        },
                    });

                    let emailSent = false;
                    if (isCritical && channels.includes('email') && this.isEmailAllowed(preference, priority) && recipient.email) {
                        emailSent = await this.sendEmail(recipient.email, title, message);
                    }

                    if (emailSent) {
                        await strapi.documents('api::notification.notification').update({
                            documentId: created.documentId,
                            data: { is_email_sent: true },
                        });
                    }

                    await this.writeLog({
                        notification: created,
                        template,
                        eventName,
                        category,
                        priority,
                        recipient,
                        dedupKey,
                        status: emailSent || !channels.includes('email') ? 'sent' : 'pending',
                        channel: channels.includes('email') ? 'email' : 'in_app',
                        isDuplicate: false,
                        renderedSubject: title,
                        renderedBody: message,
                    });

                    hasDelivered = true;
                    createdNotifications.push(created);
                }
            }

            await strapi.documents('api::notification-event.notification-event').update({
                documentId: eventRecord.documentId,
                data: {
                    status: hasDelivered ? 'processed' : 'deduplicated',
                    processed_at: new Date(),
                },
            });

            return {
                event: eventRecord,
                notifications: createdNotifications,
                matchedRules: templates.length,
            };
        } catch (error) {
            await strapi.documents('api::notification-event.notification-event').update({
                documentId: eventRecord.documentId,
                data: {
                    status: 'failed',
                    error_message: error.message,
                    processed_at: new Date(),
                },
            });
            throw error;
        }
    },

    resolveChannels(template, isCritical) {
        const channels = Array.isArray(template.channels) && template.channels.length
            ? template.channels
            : ['in_app'];

        const inAppChannels = channels.filter((channel) => channel === 'in_app');
        if (isCritical) {
            return [...new Set([...inAppChannels, 'email'])];
        }

        return inAppChannels.length ? inAppChannels : ['in_app'];
    },

    matchesConditions(conditions, payload) {
        if (!conditions || typeof conditions !== 'object') return true;

        const entries = Object.entries(conditions);
        if (!entries.length) return true;

        return entries.every(([key, expected]) => {
            const actual = getPathValue(payload, key) ?? payload[key];
            return String(actual) === String(expected);
        });
    },

    async resolveRecipients(template, payload) {
        const audience = template.audience || 'user';
        const admins = await this.getAdminUsers();

        const payloadUserId = Number(payload.user_id || payload.userId || payload.recipient_user_id || payload.recipientUserId || 0);
        const payloadAssignedTo = Number(payload.assigned_to || payload.assignedTo || 0);

        const recipients = [];

        if (audience === 'admin') {
            recipients.push(...admins);
        }

        if (audience === 'user' || audience === 'both') {
            if (payloadUserId > 0) {
                const user = await this.findUserById(payloadUserId);
                if (user) recipients.push(user);
            }
        }

        if (audience === 'both') {
            recipients.push(...admins);
        }

        if (audience === 'opposite_party') {
            const replyBy = String(payload.reply_by || payload.replyBy || '').toLowerCase();
            if (replyBy === 'agent') {
                if (payloadUserId > 0) {
                    const user = await this.findUserById(payloadUserId);
                    if (user) recipients.push(user);
                }
            } else {
                if (payloadAssignedTo > 0) {
                    const assigned = await this.findUserById(payloadAssignedTo);
                    if (assigned) recipients.push(assigned);
                } else {
                    recipients.push(...admins);
                }
            }
        }

        if (!recipients.length && payloadUserId > 0) {
            const fallbackUser = await this.findUserById(payloadUserId);
            if (fallbackUser) recipients.push(fallbackUser);
        }

        return uniqueById(recipients);
    },

    async getAdminUsers() {
        const users = await strapi.query('plugin::users-permissions.user').findMany({
            where: {
                role: {
                    type: 'rutba_app_user',
                },
            },
            populate: {
                role: {
                    select: ['id', 'type'],
                },
            },
        });

        return users || [];
    },

    async findUserById(id) {
        if (!id) return null;
        const user = await strapi.query('plugin::users-permissions.user').findOne({
            where: { id },
            populate: {
                role: {
                    select: ['id', 'type'],
                },
            },
        });

        if (!user || user.blocked) return null;
        return user;
    },

    async getUserPreference(userId, category) {
        if (!userId || !category) return null;

        const docs = await strapi.documents('api::notification-preference.notification-preference').findMany({
            filters: {
                $and: [
                    { category: { $eq: category } },
                    { user: { id: { $eq: userId } } },
                ],
            },
            pagination: { pageSize: 1 },
        });

        return docs?.[0] || null;
    },

    isInAppAllowed(preference, priority) {
        if (!preference) return true;
        if (preference.in_app_enabled === false) return false;

        const minimum = String(preference.minimum_priority || 'medium').toLowerCase();
        return (PRIORITY_WEIGHT[String(priority || 'medium').toLowerCase()] || 1) >= (PRIORITY_WEIGHT[minimum] || 1);
    },

    isEmailAllowed(preference, priority) {
        if (!preference) return String(priority || '').toLowerCase() === 'critical';
        if (preference.email_enabled === false) return false;

        const minimum = String(preference.minimum_priority || 'medium').toLowerCase();
        return (PRIORITY_WEIGHT[String(priority || 'medium').toLowerCase()] || 1) >= (PRIORITY_WEIGHT[minimum] || 1);
    },

    buildDedupKey({ eventName, template, recipient, entityType, entityId, payload }) {
        const explicit = String(payload?.dedup_key || payload?.dedupKey || '').trim();
        if (explicit) return explicit;

        const templateId = template?.documentId || template?.id || 'no-template';
        const userId = recipient?.id || 'anon';
        const refType = entityType || payload?.entity_type || 'entity';
        const refId = entityId || payload?.entity_id || payload?.ticket_id || payload?.order_id || 'none';
        return `${eventName}:${templateId}:${userId}:${refType}:${refId}`;
    },

    async isDuplicate(dedupKey, dedupWindowMinutes) {
        if (!dedupKey) return false;

        const since = new Date(Date.now() - Number(dedupWindowMinutes || 60) * 60 * 1000);
        const existing = await strapi.documents('api::notification-log.notification-log').findMany({
            filters: {
                $and: [
                    { dedup_key: { $eq: dedupKey } },
                    { sent_at: { $gte: since.toISOString() } },
                    { is_duplicate: { $eq: false } },
                ],
            },
            pagination: { pageSize: 1 },
        });

        return Boolean(existing?.length);
    },

    async sendEmail(to, subject, body) {
        try {
            await strapi.plugin('email').service('email').send({
                to,
                subject,
                html: body,
                text: String(body || '').replace(/<[^>]+>/g, ''),
            });
            return true;
        } catch (error) {
            strapi.log.error(`[notification-engine] email failed: ${error.message}`);
            return false;
        }
    },

    async writeLog({
        notification,
        template,
        eventName,
        category,
        priority,
        recipient,
        dedupKey,
        status,
        channel,
        isDuplicate,
        renderedSubject,
        renderedBody,
        metadata,
    }) {
        await strapi.documents('api::notification-log.notification-log').create({
            data: {
                event_name: eventName,
                trigger_event: normalizeLegacyEvent(eventName),
                template: template ? { documentId: template.documentId } : null,
                notification: notification ? { documentId: notification.documentId } : null,
                category,
                priority,
                channel,
                recipient_user_id: recipient?.id || null,
                recipient_role_type: recipient?.role?.type || null,
                recipient_email: recipient?.email || '',
                dedup_key: dedupKey,
                is_duplicate: Boolean(isDuplicate),
                status: status || 'pending',
                sent_at: new Date(),
                rendered_subject: renderedSubject || null,
                rendered_body: renderedBody || null,
                metadata: metadata || null,
            },
        });
    },
};
