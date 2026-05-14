import { UploadEndpoints } from './upload.js';

/**
 * MediaLibraryEndpoints
 * Centralised path + params definitions for the custom media library routes.
 */
export const MediaLibraryEndpoints = {
    meta: { domains: ['cms', 'social'] },

    foldersTree: () => ({ path: '/media-library/folders/tree' }),
    folders: (parentId = null) => ({
        path: '/media-library/folders',
        params: parentId ? { parent: parentId } : {},
    }),
    folder: (id) => ({ path: `/media-library/folders/${id}` }),
    files: (params = {}) => ({ path: '/media-library/files', params }),
    file: (id) => ({ path: `/media-library/files/${id}` }),
    moveFiles: (data) => ({ path: '/media-library/files/move', action: 'moveFiles', method: 'post', data }),
    uploadToFolder: (data) => ({ path: '/media-library/upload', action: 'uploadToFolder', method: 'post', data }),
    createFolder: (data) => ({ path: '/media-library/folders', action: 'createFolder', method: 'post', data }),
    renameFolder: (id, data) => ({ path: `/media-library/folders/${id}`, action: 'renameFolder', method: 'put', data }),
    deleteFolder: (id) => ({ path: `/media-library/folders/${id}`, action: 'deleteFolder', method: 'delete' }),
    updateFileInfo: (id, data) => ({ path: `/media-library/files/${id}`, action: 'updateFileInfo', method: 'put', data }),
    // todo: speculative stub — rutba-cms/pages/media.js and rutba-social/pages/media.js
    // call these. Verify the upload route shape (multipart vs JSON) and the
    // delete file route exists in pos-strapi media-library plugin/controller.
    uploadFile: (data) => ({ path: '/media-library/upload', action: 'uploadFile', method: 'post', data }),
    // todo: speculative stub — see uploadFile above. Confirm DELETE route is wired.
    delFile: (id) => ({ path: `/media-library/files/${id}`, action: 'delFile', method: 'delete' }),

};