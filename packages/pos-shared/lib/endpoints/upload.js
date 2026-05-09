/**
 * UploadEndpoints
 * Centralised path definitions for the Strapi /upload media library routes.
 *
 * Note: upload uses multipart/form-data — params are not applicable.
 * The path is provided for consistency; the caller handles form construction.
 */

export const UploadEndpoints = {

    /** Upload one or more files to the Strapi media library. */
    upload: () => ({ path: '/upload' }),

    /** Async: upload one or more files to the Strapi media library. */
    uploadFiles: (files, ref, field, refId, info) => {
        const form = new FormData();
        if (Array.isArray(files)) {
            for (const file of files) form.append('files', file);
        } else {
            form.append('files', files);
        }
        if (ref) form.append('ref', `api::${ref}.${ref}`);
        if (field) form.append('field', field);
        if (refId) form.append('refId', refId);
        if (info) form.append('fileInfo', JSON.stringify(info));
        return fetch('/api/upload', { method: 'POST', body: form });
    },

    /**
     * Delete a media file by its numeric id.
     * @param {number} fileId
     */
    deleteFile: (fileId) => ({ path: `/upload/files/${fileId}` }),
};

export const UploadEndpointsMeta = {
    uid: null,
    basePath: '/upload',
    methodActions: {
        upload: 'upload',
        deleteFile: 'delete',
    },
};



