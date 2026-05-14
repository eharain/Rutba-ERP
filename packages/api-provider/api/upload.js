/**
 * UploadEndpoints
 * Centralised path definitions for the Strapi /upload media library routes.
 *
 * Note: upload uses multipart/form-data — params are not applicable. The
 * actual multipart request (auth header, full Strapi URL, parsed response)
 * is handled inside lib/api.js via authApi.uploadFile / authApi.deleteFile,
 * so the descriptors here delegate to those rather than reinventing the
 * request. This module is also re-exported as-is from endpoints/index.js to
 * bypass the auto-generated HTTP wrapper, which otherwise mangles the
 * non-descriptor return shapes into `/apiundefined` requests.
 */
// authApi is resolved lazily on the first call, not at module-load time.
// lib/api.js performs `await initApiConfig(...)` at top level, which
// propagates a TLA dependency to every module that statically imports it.
// Several modules (e.g. api/media-library.js, generated client/*.js)
// evaluate this descriptor module synchronously at app bootstrap; making
// them transitively TLA-dependent caused the generated wrappers to see an
// `undefined` import for the not-yet-initialised api/* descriptors. Lazy
// import keeps the bootstrap graph synchronous.
let _authApi = null;
async function getAuthApi() {
    if (_authApi) return _authApi;
    const mod = await import('../lib/api.js');
    _authApi = mod.authApi;
    return _authApi;
}

export const UploadEndpoints = {
    meta: { domains: ['social', 'stock'] },

    /** Upload one or more files to the Strapi media library, optionally
     *  attaching them to an entity field (`ref`/`refId`/`field`). */
    uploadFiles: async (files, ref, field, refId, info) => {
        const authApi = await getAuthApi();
        return authApi.uploadFile(files, ref, field, refId, info);
    },

    /** Delete a media file by its numeric id. */
    deleteFile: async (fileId) => {
        const authApi = await getAuthApi();
        return authApi.deleteFile(fileId);
    },
};