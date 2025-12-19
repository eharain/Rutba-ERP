"use strict";
;
module.exports = {
    async find(ctx) {
        try {
            const { name, field } = ctx.params;
            if (!name || !field) return ctx.badRequest("Schema name and field are required");

            // Look in APIs first, then in components
            const schema =
                strapi.contentTypes[`api::${name}.${name}`] || strapi.components[name];

            if (!schema) return ctx.notFound(`Schema '${name}' not found`);

            const attr = schema.attributes[field];
            if (!attr) return ctx.notFound(`Field '${field}' not found in schema '${name}'`);
            if (attr.type !== "enumeration") {
                return ctx.badRequest(`'${field}' is not an enum (found type '${attr.type}')`);
            }
            return { schema: name, field, values: attr.enum };
        } catch (err) {
            strapi.log.error("Error fetching enum values:", err);
            return ctx.internalServerError("Something went wrong");
        }
    },
};
