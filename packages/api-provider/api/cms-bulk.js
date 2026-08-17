/**
 * CmsBulkEndpoints
 * Server-side bulk-import endpoint for the rutba-cms Excel I/O flow. The
 * client parses Excel and POSTs chunks of pre-zipped row objects; the server
 * validates contentType against an allowlist, caps chunk size, and upserts
 * each row inside one request boundary (replacing N×3 round-trips from the
 * browser). See pos-strapi/src/api/cms-bulk/controllers/cms-bulk.js for the
 * field rules and per-row response shape.
 */

export const CmsBulkEndpoints = {
    meta: {
        uid: 'custom::cms-bulk',
        domains: ['cms'],
        roles: ['admin'],
    },

    // Named `runImport` (not `import`) so the scaffold-endpoint-providers
    // step emits a valid generated client. `import` is a reserved word in
    // a function-declaration position — the scaffolder writes
    // `async function <name>(...)` from the descriptor key, so the key
    // must be a legal identifier.
    runImport: (contentType, items) => ({
        path: '/cms-bulk/import',
        action: 'create',
        method: 'post',
        apps: ['cms'],
        approle: ['admin'],
        // Chunked at 50 rows per request server-side, but a row is an upsert plus
        // a separate seo-meta upsert, and product rows carry schema coercion and
        // relation resolution on top. Five minutes covers a slow chunk without
        // pretending the whole spreadsheet arrives in one call.
        timeoutMs: 300_000,
        data: { contentType, items },
    }),
};
