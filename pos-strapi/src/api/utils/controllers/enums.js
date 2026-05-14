"use strict";

// Resolve a schema by full UID ('api::cms-page.cms-page'), short api name
// ('cms-page' → 'api::cms-page.cms-page'), singular-name match (covers plugin
// content-types and any api where uid !== singular), or component name.
function resolveSchema(name) {
    if (!name) return null;
    if (strapi.contentTypes[name]) return strapi.contentTypes[name];
    const apiUid = `api::${name}.${name}`;
    if (strapi.contentTypes[apiUid]) return strapi.contentTypes[apiUid];
    const bySingular = Object.values(strapi.contentTypes).find(
        (ct) => ct?.info?.singularName === name
    );
    if (bySingular) return bySingular;
    return strapi.components[name] || null;
}

module.exports = {
    async find(ctx) {
        try {
            const { name, field } = ctx.params;
            if (!name || !field) return ctx.badRequest("Schema name and field are required");

            const schema = resolveSchema(name);
            if (!schema) return ctx.notFound(`Schema '${name}' not found`);

            const attr = schema.attributes?.[field];
            if (!attr) return ctx.notFound(`Field '${field}' not found in schema '${name}'`);
            if (attr.type !== "enumeration") {
                return ctx.badRequest(`'${field}' is not an enum (found type '${attr.type}')`);
            }
            return { schema: name, field, values: attr.enum, default: attr.default ?? null };
        } catch (err) {
            strapi.log.error("Error fetching enum values:", err);
            return ctx.internalServerError("Something went wrong");
        }
    },
};
