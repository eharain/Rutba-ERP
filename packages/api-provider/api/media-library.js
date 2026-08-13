/**
 * MediaLibraryEndpoints
 * Centralised path + params definitions for the custom media library routes.
 */
export const MediaLibraryEndpoints = {
    meta: {
        uid: 'plugin::upload.file',
        domains: ['cms', 'social', 'stock'],
        roles: ['admin', 'manager', 'staff'],
    },

    // Every descriptor here spells out `action`, and the value is the media-library
    // controller's handler name — `folderTree`, not `foldersTree`. That name is
    // what both backends put in the route handler api-pro parses (pos-strapi via
    // `media-library.<handler>`, rutba-core via the module route's `action`), so a
    // policy seeded under any other spelling is never found and the route 403s.
    // Nothing infers it: these method names are not verb-shaped, so the seeder's
    // name-based action guess returns null and skips them entirely.
    foldersTree: () => ({ path: '/media-library/folders/tree', action: 'folderTree', method: 'get' }),
    folders: (parentId = null) => ({
        path: '/media-library/folders',
        action: 'getFolders',
        method: 'get',
        params: parentId ? { parent: parentId } : {},
    }),
    folder: (id) => ({ path: `/media-library/folders/${id}`, action: 'getFolder', method: 'get' }),
    files: (params = {}) => ({ path: '/media-library/files', action: 'getFiles', method: 'get', params }),
    file: (id) => ({ path: `/media-library/files/${id}`, action: 'getFile', method: 'get' }),
    moveFiles: (data) => ({ path: '/media-library/files/move', action: 'moveFiles', method: 'post', data }),
    uploadToFolder: (data) => ({ path: '/media-library/upload', action: 'uploadToFolder', method: 'post', data }),
    createFolder: (data) => ({ path: '/media-library/folders', action: 'createFolder', method: 'post', data }),
    renameFolder: (id, data) => ({ path: `/media-library/folders/${id}`, action: 'renameFolder', method: 'put', data }),
    deleteFolder: (id) => ({ path: `/media-library/folders/${id}`, action: 'deleteFolder', method: 'delete' }),
    updateFileInfo: (id, data) => ({ path: `/media-library/files/${id}`, action: 'updateFileInfo', method: 'put', data }),
    // Second name for the upload route rutba-cms/pages/media.js and
    // rutba-social/pages/media.js call. Same path, same handler as
    // uploadToFolder above — so it declares the same action and the seeder
    // treats it as the alias it is rather than minting a second policy.
    uploadFile: (data) => ({ path: '/media-library/upload', action: 'uploadToFolder', method: 'post', data }),
    // `deleteFile` is the controller's handler; `delFile` is only what this
    // client method is called.
    delFile: (id) => ({ path: `/media-library/files/${id}`, action: 'deleteFile', method: 'delete' }),

    // Media-server video surface. The backend proxies these to the Rutba Media
    // FileServer, which owns the video bytes, the drives and the scanner.
    //
    // `action` is spelled out on every one of these, including the GETs, and it
    // must stay that way. The seeder infers an action from the method name and
    // the HTTP verb, and infers NOTHING from a name like `mediaVideos` on a
    // descriptor with no `method` — it returns null and skips the descriptor
    // entirely, so no policy row is ever written and api-pro's deny-by-default
    // answers every call with 403. The value is the controller's handler name,
    // which is what the runtime matches a custom route against.
    mediaVideos: (params = {}) => ({ path: '/media-library/videos', action: 'mediaVideos', method: 'get', params }),
    mediaVideoFolders: () => ({ path: '/media-library/videos/folders', action: 'mediaVideoFolders', method: 'get' }),
    // Tags actually carried by videos, with counts — `folder` narrows them to
    // the folder in view so the filter matches what is on screen.
    mediaVideoTags: (params = {}) => ({ path: '/media-library/videos/tags', action: 'mediaVideoTags', method: 'get', params }),
    // Register media-server videos as library rows so a post can attach them.
    // Nothing is copied — the row points at the bytes where they already live.
    linkMediaVideos: (data) => ({ path: '/media-library/videos/link', action: 'linkMediaVideos', method: 'post', data }),
    videoScanStatus: () => ({ path: '/media-library/video-scan', action: 'videoScanStatus', method: 'get' }),
    videoScan: (data = {}) => ({ path: '/media-library/video-scan', action: 'videoScan', method: 'post', data }),

};