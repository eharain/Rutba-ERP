'use strict';

/**
 * media-library controller
 *
 * Custom API wrapping Strapi's upload plugin to provide
 * folder browsing, file management, and media organisation
 * via the public content API.
 */

module.exports = {

    // ─── Folders ────────────────────────────────────────────

    async folderTree(ctx) {
        const tree = await strapi.service('api::media-library.media-library').getFolderTree();
        ctx.body = { data: tree };
    },

    async getFolders(ctx) {
        const parentId = ctx.query.parent || null;
        const folders = await strapi.service('api::media-library.media-library').getFolders(
            parentId ? Number(parentId) : null
        );
        ctx.body = { data: folders };
    },

    async getFolder(ctx) {
        const { id } = ctx.params;
        const folder = await strapi.service('api::media-library.media-library').getFolderById(Number(id));
        if (!folder) return ctx.notFound('Folder not found');
        ctx.body = { data: folder };
    },

    async createFolder(ctx) {
        const body = ctx.request.body?.data ?? ctx.request.body ?? {};
        const { name, parent } = body;
        if (!name || !name.trim()) {
            return ctx.badRequest('Folder name is required');
        }
        const folder = await strapi.service('api::media-library.media-library').createFolder(
            name.trim(),
            parent ? Number(parent) : null
        );
        ctx.body = { data: folder };
    },

    async renameFolder(ctx) {
        const { id } = ctx.params;
        const body = ctx.request.body?.data ?? ctx.request.body ?? {};
        const { name } = body;
        if (!name || !name.trim()) {
            return ctx.badRequest('Folder name is required');
        }
        const folder = await strapi.service('api::media-library.media-library').renameFolder(
            Number(id),
            name.trim()
        );
        ctx.body = { data: folder };
    },

    async deleteFolder(ctx) {
        const { id } = ctx.params;
        await strapi.service('api::media-library.media-library').deleteFolder(Number(id));
        ctx.body = { data: { id: Number(id), deleted: true } };
    },

    // ─── Files ──────────────────────────────────────────────

    async getFiles(ctx) {
        const {
            folder: folderId,
            search,
            mime,
            sort,
            page,
            pageSize,
        } = ctx.query;

        const result = await strapi.service('api::media-library.media-library').getFiles({
            folderId: folderId || 'all',
            search,
            mime,
            sort,
            page: page ? Number(page) : 1,
            pageSize: pageSize ? Number(pageSize) : 24,
        });

        ctx.body = {
            data: result.files,
            meta: { pagination: result.pagination },
        };
    },

    async getFile(ctx) {
        const { id } = ctx.params;
        const file = await strapi.service('api::media-library.media-library').getFileById(Number(id));
        if (!file) return ctx.notFound('File not found');
        ctx.body = { data: file };
    },

    async moveFiles(ctx) {
        const body = ctx.request.body?.data ?? ctx.request.body ?? {};
        const { fileIds, targetFolderId } = body;
        if (!Array.isArray(fileIds) || fileIds.length === 0) {
            return ctx.badRequest('fileIds array is required');
        }
        const results = await strapi.service('api::media-library.media-library').moveFiles(
            fileIds.map(Number),
            targetFolderId ? Number(targetFolderId) : null
        );
        ctx.body = { data: results };
    },

    async updateFileInfo(ctx) {
        const { id } = ctx.params;
        const body = ctx.request.body?.data ?? ctx.request.body ?? {};
        const { name, alternativeText, caption } = body;
        const file = await strapi.service('api::media-library.media-library').updateFileInfo(
            Number(id),
            { name, alternativeText, caption }
        );
        ctx.body = { data: file };
    },

    async deleteFile(ctx) {
        const { id } = ctx.params;
        const result = await strapi.service('api::media-library.media-library').deleteFile(Number(id));
        if (!result) return ctx.notFound('File not found');
        ctx.body = { data: result };
    },

    async uploadToFolder(ctx) {
        const { files } = ctx.request;
        const { folderId } = ctx.request.body || ctx.query;

        if (!files || (!files.file && !files.files)) {
            return ctx.badRequest('No files provided');
        }

        const uploadFiles = files.files || files.file;
        const fileArray = Array.isArray(uploadFiles) ? uploadFiles : [uploadFiles];

        const result = await strapi.service('api::media-library.media-library').uploadToFolder(
            fileArray,
            folderId ? Number(folderId) : null,
            ctx.request.body?.fileInfo ? JSON.parse(ctx.request.body.fileInfo) : {}
        );

        ctx.body = { data: result };
    },

    // ─── Media-server video surface ─────────────────────────
    // Thin proxies. The media server owns the bytes, the drives and the
    // scanner; these exist so ERP users reach it with their ERP session
    // instead of a media-server credential.

    /** Videos indexed on the media server. ?folder=&recursive=&q=&limit=&offset=&sort= */
    async mediaVideos(ctx) {
        const svc = strapi.service('api::media-library.media-library');
        try {
            ctx.body = { data: await svc.mediaVideos(ctx.query || {}) };
        } catch (e) {
            ctx.status = e.status || 502;
            ctx.body = { error: { message: e.message } };
        }
    },

    /** Folders on the media server that contain videos. */
    async mediaVideoFolders(ctx) {
        const svc = strapi.service('api::media-library.media-library');
        try {
            ctx.body = { data: await svc.mediaVideoFolders() };
        } catch (e) {
            ctx.status = e.status || 502;
            ctx.body = { error: { message: e.message } };
        }
    },

    /** State of the media server's drive scan. */
    async videoScanStatus(ctx) {
        const svc = strapi.service('api::media-library.media-library');
        try {
            ctx.body = { data: await svc.videoScanStatus() };
        } catch (e) {
            ctx.status = e.status || 502;
            ctx.body = { error: { message: e.message } };
        }
    },

    /** Ask the media server to rescan its drives. Body: { data: { folder? } }. */
    async videoScan(ctx) {
        const body = ctx.request.body?.data ?? ctx.request.body ?? {};
        const svc = strapi.service('api::media-library.media-library');
        try {
            ctx.body = { data: await svc.videoScanRun({ folder: body.folder || null }) };
        } catch (e) {
            ctx.status = e.status || 502;
            ctx.body = { error: { message: e.message } };
        }
    },

    /** Register media-server videos as library rows. Body: { data: { videos: [...] } }. */
    async linkMediaVideos(ctx) {
        const body = ctx.request.body?.data ?? ctx.request.body ?? {};
        const items = body.videos || body.items || [];
        if (!Array.isArray(items) || items.length === 0) {
            return ctx.badRequest('videos array is required');
        }
        const svc = strapi.service('api::media-library.media-library');
        try {
            ctx.body = { data: await svc.linkMediaVideos(items) };
        } catch (e) {
            ctx.status = e.status || 502;
            ctx.body = { error: { message: e.message } };
        }
    },
};
