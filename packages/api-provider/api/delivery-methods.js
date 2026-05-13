import __publish_generic_helper from "./__publish_generic_helper.js";
import { listParams, byIdParams } from './__param_builders.js';

export const DeliveryMethodsEndpoints = {
    // todo: spread adds updateDraft/publish/unpublish/create/del. Verify the
    // delivery-method content type has draft-publish enabled; the inline
    // create/update below will override the helper's versions either way.
    ...__publish_generic_helper('delivery-methods'),
    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/delivery-methods',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['priority:asc', 'createdAt:desc'], populate: ['delivery_zones', 'product_groups'], pageSize: 200 },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/delivery-methods/${documentId}`,
        params: byIdParams({ populate, fields }),
    }),
    byIdDraft: (documentId, { populate, fields } = {}) => ({
        path: `/delivery-methods/${documentId}`,
        params: byIdParams({ populate, fields }, {}, { status: 'draft' }),
    }),
    byIdPublished: (documentId, { populate, fields } = {}) => ({
        path: `/delivery-methods/${documentId}`,
        params: byIdParams({ populate, fields }, {}, { status: 'published' }),
    }),
    create: (data) => ({ path: '/delivery-methods' , data }),
    update: (documentId, data) => ({ path: `/delivery-methods/${documentId}` , data }),

};