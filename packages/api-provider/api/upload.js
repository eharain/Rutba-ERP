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
import { authApi } from '../lib/api.js';

export const UploadEndpoints = {
    meta: { domains: ['social', 'stock'] },

    /** Upload one or more files to the Strapi media library, optionally
     *  attaching them to an entity field (`ref`/`refId`/`field`). */
    uploadFiles: (files, ref, field, refId, info) =>
        authApi.uploadFile(files, ref, field, refId, info),

    /** Delete a media file by its numeric id. */
    deleteFile: (fileId) => authApi.deleteFile(fileId),
};