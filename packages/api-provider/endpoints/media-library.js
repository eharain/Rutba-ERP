import { authApi } from '../lib/api.js';
import { UploadEndpoints } from './upload.js';

/**
 * MediaLibraryEndpoints
 * Centralised path + params definitions for the custom media library routes.
 */
export const MediaLibraryEndpoints = {
    foldersTree: () => ({ path: '/media-library/folders/tree' }),
    folders: (parentId = null) => ({
        path: '/media-library/folders',
        params: parentId ? { parent: parentId } : {},
    }),
    folder: (id) => ({ path: `/media-library/folders/${id}` }),
    files: (params = {}) => ({ path: '/media-library/files', params }),
    file: (id) => ({ path: `/media-library/files/${id}` }),
    moveFiles: () => ({ path: '/media-library/files/move' }),
    uploadToFolder: () => ({ path: '/media-library/upload' }),
    createFolder: () => ({ path: '/media-library/folders' }),
    renameFolder: (id) => ({ path: `/media-library/folders/${id}` }),
    deleteFolder: (id) => ({ path: `/media-library/folders/${id}` }),
    updateFileInfo: (id) => ({ path: `/media-library/files/${id}` }),

    fetchFoldersTree: () => authApi.fetch('/media-library/folders/tree'),
    fetchFolders: (parentId = null) => authApi.fetch('/media-library/folders', parentId ? { parent: parentId } : {}),
    fetchFile: (id) => authApi.fetch(`/media-library/files/${id}`),
    fetchFiles: (params = {}) => authApi.fetch('/media-library/files', params),
    postMoveFiles: (data) => authApi.post('/media-library/files/move', data),
    postUpload: (files, info, ref, field, refId) => UploadEndpoints.uploadFiles(files, ref, field, refId, info),
    uploadFile: (files, info, ref, field, refId) => UploadEndpoints.uploadFiles(files, ref, field, refId, info),
    postCreateFolder: (data) => authApi.post('/media-library/folders', data),
    putRenameFolder: (id, data) => authApi.put(`/media-library/folders/${id}`, data),
    delFolder: (id) => authApi.del(`/media-library/folders/${id}`),
    putUpdateFileInfo: (id, data) => authApi.put(`/media-library/files/${id}`, data),
    delFile: (id) => authApi.del(`/media-library/files/${id}`),
};
