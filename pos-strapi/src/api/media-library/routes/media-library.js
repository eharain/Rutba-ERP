'use strict';

/**
 * media-library routes
 *
 * Custom routes that expose folder browsing, file management,
 * upload-to-folder, and drag-and-drop re-organisation via the
 * content API.
 *
 * These are plugin-style routes (no content-type schema)
 * so the app-access-guard middleware skips them (it only
 * guards api:: content-type UIDs).  Authentication is still
 * enforced by Strapi's built-in auth system.
 */

module.exports = {
    routes: [
        // ── Folders ─────────────────────────────────────────
        {
            method: 'GET',
            path: '/media-library/folders/tree',
            handler: 'media-library.folderTree',
            config: { policies: [] },
        },
        {
            method: 'GET',
            path: '/media-library/folders',
            handler: 'media-library.getFolders',
            config: { policies: [] },
        },
        {
            method: 'GET',
            path: '/media-library/folders/:id',
            handler: 'media-library.getFolder',
            config: { policies: [] },
        },
        {
            method: 'POST',
            path: '/media-library/folders',
            handler: 'media-library.createFolder',
            config: { policies: [] },
        },
        {
            method: 'PUT',
            path: '/media-library/folders/:id',
            handler: 'media-library.renameFolder',
            config: { policies: [] },
        },
        {
            method: 'DELETE',
            path: '/media-library/folders/:id',
            handler: 'media-library.deleteFolder',
            config: { policies: [] },
        },

        // ── Files ───────────────────────────────────────────
        {
            method: 'GET',
            path: '/media-library/files',
            handler: 'media-library.getFiles',
            config: { policies: [] },
        },
        {
            method: 'GET',
            path: '/media-library/files/:id',
            handler: 'media-library.getFile',
            config: { policies: [] },
        },
        {
            method: 'POST',
            path: '/media-library/files/move',
            handler: 'media-library.moveFiles',
            config: { policies: [] },
        },
        {
            method: 'PUT',
            path: '/media-library/files/:id',
            handler: 'media-library.updateFileInfo',
            config: { policies: [] },
        },
        {
            method: 'DELETE',
            path: '/media-library/files/:id',
            handler: 'media-library.deleteFile',
            config: { policies: [] },
        },
        {
            method: 'POST',
            path: '/media-library/upload',
            handler: 'media-library.uploadToFolder',
            config: { policies: [] },
        },

        // ── Media-server videos (proxied) ───────────────────
        // Literal paths before any that could shadow them.
        {
            method: 'GET',
            path: '/media-library/videos/folders',
            handler: 'media-library.mediaVideoFolders',
            config: { policies: [] },
        },
        {
            method: 'GET',
            path: '/media-library/videos/tags',
            handler: 'media-library.mediaVideoTags',
            config: { policies: [] },
        },
        {
            method: 'POST',
            path: '/media-library/videos/link',
            handler: 'media-library.linkMediaVideos',
            config: { policies: [] },
        },
        {
            method: 'GET',
            path: '/media-library/videos',
            handler: 'media-library.mediaVideos',
            config: { policies: [] },
        },
        {
            method: 'GET',
            path: '/media-library/video-scan',
            handler: 'media-library.videoScanStatus',
            config: { policies: [] },
        },
        {
            method: 'POST',
            path: '/media-library/video-scan',
            handler: 'media-library.videoScan',
            config: { policies: [] },
        },
    ],
};
