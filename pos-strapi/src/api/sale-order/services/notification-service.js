'use strict';

/**
 * Notification Service
 *
 * Renders Liquid-style {{variable}} templates and sends via Strapi Email plugin.
 * Writes an audit record to notification-log.
 */

/**
 * Replace {{variable}} placeholders in a string with values from a map.
 * @param {string} template
 * @param {object} vars
 * @returns {string}
 */
function renderTemplate(template, vars) {
    if (!template) return '';
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return vars[key] !== undefined ? String(vars[key]) : `{{${key}}}`;
    });
}

/**
 * Build the variable map for a given order.
 * @param {object} order  - fully populated order document
 * @returns {object}
 */
function buildVars(order, extraVars = {}) {
    // Snapshot wins over the live person record so notification templates
    // reflect the values the customer entered at order time.
    const snap = order.delivery_snapshot || {};
    const person = order.customer_person || {};
    const rider = order.assigned_rider || {};
    const method = order.delivery_method || {};
    const frontendUrl = process.env.FRONTEND_URL || 'https://rutba.pk';

    return {
        customer_name:      snap.name || person.name || '',
        customer_email:     snap.email || person.email || '',
        customer_phone:     snap.phone || person.phone || '',
        order_id:           order.order_id || '',
        order_status:       order.order_status || '',
        tracking_url:       `${frontendUrl}/order-tracking/${order.documentId}?secret=${order.order_secret || ''}`,
        rider_name:         rider.full_name || '',
        rider_phone:        rider.phone || '',
        delivery_method:    method.name || '',
        estimated_delivery: order.estimated_delivery_time
            ? new Date(order.estimated_delivery_time).toLocaleString('en-PK')
            : '',
        total:              order.total ? `Rs. ${Number(order.total).toFixed(0)}` : '',
        delivery_cost:      order.delivery_cost ? `Rs. ${Number(order.delivery_cost).toFixed(0)}` : '',
        items_summary:      (order.products?.items || [])
            .map((i) => `${i.product_name} × ${i.quantity}`)
            .join(', '),
        ...extraVars,
    };
}

module.exports = {
    /**
     * Send notifications for a trigger event on an order.
     *
     * @param {string} triggerEvent  - e.g. 'order_placed'
     * @param {string} orderDocumentId
     * @param {object} [extraVars]
     */
    async send(triggerEvent, orderDocumentId, extraVars = {}) {
        try {
            // Load active templates for this trigger
            const templates = await strapi.documents('api::notification-template.notification-template').findMany({
                filters: { trigger_event: { $eq: triggerEvent }, is_active: { $eq: true } },
                populate: ['branch'],
            });

            if (!templates || templates.length === 0) return;

            // Load populated order
            const order = await strapi.documents('api::sale-order.sale-order').findOne({
                documentId: orderDocumentId,
                populate: ['customer_person', 'assigned_rider', 'delivery_method', 'products'],
            });

            if (!order) return;

            const vars = buildVars(order, extraVars);
            const customerEmail = () =>
                order.delivery_snapshot?.email || order.customer_person?.email || '';

            const resolveRecipientEmail = async (template) => {
                if (template.send_to === 'customer') return customerEmail();

                if (template.send_to === 'rider') {
                    const riderUser = order.assigned_rider?.user;
                    if (riderUser?.email) return riderUser.email;

                    if (order.assigned_rider?.documentId) {
                        const rider = await strapi.documents('api::rider.rider').findOne({
                            documentId: order.assigned_rider.documentId,
                            populate: ['user'],
                        });
                        return rider?.user?.email || '';
                    }
                    return '';
                }

                if (template.send_to === 'staff' || template.send_to === 'admin') {
                    const fallback = process.env.EMAIL_FROM || '';
                    return process.env.ORDER_ALERT_EMAIL || fallback;
                }

                return customerEmail();
            };

            for (const template of templates) {
                const renderedSubject = renderTemplate(template.subject || 'Order Update', vars);
                const renderedBody    = renderTemplate(template.body_template || '', vars);
                const recipientEmail = await resolveRecipientEmail(template);

                let logStatus = 'pending';
                let errorMsg  = null;

                if ((template.channel === 'email' || template.channel === 'both') && recipientEmail) {
                    try {
                        await strapi.plugin('email').service('email').send({
                            to:      recipientEmail,
                            subject: renderedSubject,
                            html:    renderedBody,
                            text:    renderedBody.replace(/<[^>]+>/g, ''),
                        });
                        logStatus = 'sent';
                    } catch (emailErr) {
                        logStatus = 'failed';
                        errorMsg  = emailErr.message;
                        strapi.log.error(`[notification-service] email failed: ${emailErr.message}`);
                    }
                }

                // Write audit log
                await strapi.documents('api::notification-log.notification-log').create({
                    data: {
                        order:            order.id,
                        template:         template.id,
                        trigger_event:    triggerEvent,
                        recipient_email:  recipientEmail || '',
                        status:           logStatus,
                        sent_at:          new Date(),
                        error_message:    errorMsg,
                        rendered_subject: renderedSubject,
                        rendered_body:    renderedBody,
                    },
                });
            }
        } catch (err) {
            strapi.log.error(`[notification-service] send() failed for ${triggerEvent}: ${err.message}`);
        }
    },
};
