'use strict';
const pluralize = require('pluralize')
function schemaLookup(name) {
    const names = pluralize.singular(name)
    const schema = strapi.contentTypes[`api::${name}.${name}`] ||
        strapi.contentTypes[`api::${names}.${names}`] ||
        strapi.components[names] ||
        strapi.components[name];
    return schema;
}
module.exports = {
    async contentTypeFields(ctx) {
        try {
            const { name, fieldType } = ctx.params;

           
            if (!name || !fieldType) return ctx.badRequest("Schema name and field are required");

            // Look in APIs first, then in components 
            const schema = schemaLookup(name);
            if (!schema) return ctx.notFound(`Schema '${name}' not found`);

            return Array.from(schema.attributes).map(([key, value]) => { return key });

            //const attr = schema.attributes[fieldType];
            //if (!attr) return ctx.notFound(`Field '${fieldType}' not found in schema '${name}'`);
            //if (attr.type !== "enumeration")
            //    return ctx.badRequest(`'${fieldType}' is not an enum (found type '${attr.type}')`);
            //return { schema: name, fieldType, values: attr.enum };

        } catch (err) {
            strapi.log.error("Error fetching enum values:", err);
            return ctx.internalServerError("Something went wrong");
        }
    },
    async validate(ctx) {
        try {
            let { uid } = ctx.params;
            const data = ctx.request.body || {};

            if (!uid) {
                return ctx.badRequest('Content-type UID is required');
            }

            // Load content-type schema
           // const schema = strapi.contentTypes[uid];
            const schema = schemaLookup(uid);

            if (!schema) {
                return ctx.notFound(`Content type not found: ${uid}`);
            }

            const attributes = schema.attributes || {};

            const schemaFields = Object.keys(attributes);
            const payloadFields = Object.keys(data);

            // Fields defined in schema but missing in payload
            const missingFields = schemaFields.filter(
                (field) =>
                    attributes[field].required === true &&
                    data[field] === undefined
            );

            // Fields present in payload but not in schema
            const extraFields = payloadFields.filter(
                (field) => !schemaFields.includes(field)
            );

            // Valid fields
            const validFields = payloadFields.filter(
                (field) => schemaFields.includes(field)
            );

            ctx.send({
                contentType: uid,
                summary: {
                    schemaFieldCount: schemaFields.length,
                    payloadFieldCount: payloadFields.length,
                },
                result: {
                    missingRequiredFields: missingFields,
                    extraFields,
                    validFields,
                },
            });
        } catch (err) {
            strapi.log.error('Schema validation error:', err);
            ctx.internalServerError('Schema validation failed');
        }
    },
};
