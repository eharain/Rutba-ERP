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



