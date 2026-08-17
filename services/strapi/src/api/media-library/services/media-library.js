'use strict';

/**
 * media-library service
 *
 * Wraps Strapi's internal upload plugin queries for folder
 * and file management, exposing them to the content API.
 */

const path = require('path');

const SCAN_MIME_BY_EXT = {
    mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
};

module.exports = ({ strapi }) => ({

    // ─── Folders ────────────────────────────────────────────

    async getFolderTree() {
        const folders = await strapi.db.query('plugin::upload.folder').findMany({
            orderBy: { name: 'asc' },
        });

        // Build tree from flat list
        const map = {};
        const roots = [];

        for (const f of folders) {
            map[f.id] = { ...f, children: [] };
        }

        for (const f of folders) {
            const node = map[f.id];
            // Strapi stores parent as a relation; try parentId or look it up
            const parentId = f.parent?.id ?? f.parent ?? null;
            if (parentId && map[parentId]) {
                map[parentId].children.push(node);
            } else {
                roots.push(node);
            }
        }

        return roots;
    },

    async getFolders(parentId) {
        const where = {};
        if (parentId) {
            where.parent = { id: parentId };
        } else {
            where.$or = [
                { parent: null },
                { parent: { id: { $null: true } } },
            ];
        }

        return strapi.db.query('plugin::upload.folder').findMany({
            where,
            orderBy: { name: 'asc' },
            populate: { parent: true },
        });
    },

    async getFolderById(folderId) {
        return strapi.db.query('plugin::upload.folder').findOne({
            where: { id: folderId },
            populate: { parent: true, children: true },
        });
    },

    async createFolder(name, parentId) {
        // Compute pathId – unique integer for this folder
        const maxPathId = await strapi.db.query('plugin::upload.folder').findMany({
            orderBy: { pathId: 'desc' },
            limit: 1,
            select: ['pathId'],
        });
        const nextPathId = ((maxPathId[0]?.pathId) || 0) + 1;

        // Compute path
        let path = `/${nextPathId}`;
        if (parentId) {
            const parent = await strapi.db.query('plugin::upload.folder').findOne({
                where: { id: parentId },
                select: ['path'],
            });
            if (parent) {
                path = `${parent.path}/${nextPathId}`;
            }
        }

        return strapi.db.query('plugin::upload.folder').create({
            data: {
                name,
                pathId: nextPathId,
                path,
                parent: parentId || null,
            },
        });
    },

    async renameFolder(folderId, name) {
        return strapi.db.query('plugin::upload.folder').update({
            where: { id: folderId },
            data: { name },
        });
    },

    async deleteFolder(folderId) {
        // Look up the folder to get its path
        const folder = await strapi.db.query('plugin::upload.folder').findOne({
            where: { id: folderId },
        });
        if (!folder) return null;

        // Find all descendant folders (path starts with this folder's path)
        const descendantFolders = await strapi.db.query('plugin::upload.folder').findMany({
            where: {
                path: { $startsWith: `${folder.path}/` },
            },
        });
        const allFolderPaths = [folder.path, ...descendantFolders.map((f) => f.path)];

        // Move files in this folder and all descendant folders to root
        const files = await strapi.db.query('plugin::upload.file').findMany({
            where: {
                $or: allFolderPaths.flatMap((p) => [
                    { folderPath: { $eq: p } },
                    { folderPath: { $startsWith: `${p}/` } },
                ]),
            },
        });
        for (const file of files) {
            await strapi.db.query('plugin::upload.file').update({
                where: { id: file.id },
                data: { folder: null, folderPath: '/' },
            });
        }

        // Move direct child folders to root (clear parent relation)
        const childFolders = descendantFolders.filter(
            (f) => f.path.startsWith(`${folder.path}/`) && !f.path.slice(folder.path.length + 1).includes('/')
        );
        for (const child of childFolders) {
            await strapi.db.query('plugin::upload.folder').update({
                where: { id: child.id },
                data: { parent: null },
            });
        }

        // Delete the folder
        return strapi.db.query('plugin::upload.folder').delete({
            where: { id: folderId },
        });
    },

    // ─── Files ──────────────────────────────────────────────

    async getFiles({ folderId, search, mime, sort, page, pageSize }) {
        const where = {};

        // Folder filter
        if (folderId === 'root' || folderId === null || folderId === undefined) {
            // Files with no folder OR null folder
            where.$or = [
                { folder: null },
                { folder: { id: { $null: true } } },
            ];
        } else if (folderId && folderId !== 'all') {
            where.folder = { id: folderId };
        }
        // folderId === 'all' → no folder filter

        // Search
        if (search) {
            where.$and = [
                ...(where.$and || []),
                {
                    $or: [
                        { name: { $containsi: search } },
                        { alternativeText: { $containsi: search } },
                        { caption: { $containsi: search } },
                    ],
                },
            ];
        }

        // Mime filter
        if (mime === 'image') {
            where.mime = { $startsWith: 'image/' };
        } else if (mime === 'video') {
            where.mime = { $startsWith: 'video/' };
        } else if (mime === 'pdf') {
            where.mime = { $eq: 'application/pdf' };
        } else if (mime === 'other') {
            where.mime = { $notStartsWith: 'image/' };
            where.mime = { ...where.mime, $ne: 'application/pdf' };
        }

        // Sort
        let orderBy = { createdAt: 'desc' };
        if (sort) {
            const [field, direction] = sort.split(':');
            orderBy = { [field]: direction || 'asc' };
        }

        const start = ((page || 1) - 1) * (pageSize || 24);
        const limit = pageSize || 24;

        const [files, total] = await Promise.all([
            strapi.db.query('plugin::upload.file').findMany({
                where,
                orderBy,
                offset: start,
                limit,
                populate: { folder: { select: ['id', 'name', 'path'] } },
            }),
            strapi.db.query('plugin::upload.file').count({ where }),
        ]);

        return {
            files,
            pagination: {
                page: page || 1,
                pageSize: limit,
                pageCount: Math.ceil(total / limit),
                total,
            },
        };
    },

    async moveFiles(fileIds, targetFolderId) {
        const folderData = targetFolderId
            ? { folder: targetFolderId }
            : { folder: null };

        // Compute folderPath
        if (targetFolderId) {
            const folder = await strapi.db.query('plugin::upload.folder').findOne({
                where: { id: targetFolderId },
                select: ['path'],
            });
            folderData.folderPath = folder?.path || '/';
        } else {
            folderData.folderPath = '/';
        }

        const results = [];
        for (const fileId of fileIds) {
            const updated = await strapi.db.query('plugin::upload.file').update({
                where: { id: fileId },
                data: folderData,
            });
            results.push(updated);
        }
        return results;
    },

    async getFileById(fileId) {
        return strapi.db.query('plugin::upload.file').findOne({
            where: { id: fileId },
            populate: { folder: { select: ['id', 'name', 'path'] } },
        });
    },

    async updateFileInfo(fileId, { name, alternativeText, caption }) {
        return strapi.db.query('plugin::upload.file').update({
            where: { id: fileId },
            data: { name, alternativeText, caption },
        });
    },

    async deleteFile(fileId) {
        // Use the upload plugin's service to properly clean up thumbnails
        const file = await strapi.db.query('plugin::upload.file').findOne({
            where: { id: fileId },
        });
        if (!file) return null;

        try {
            await strapi.plugin('upload').service('upload').remove(file);
        } catch (err) {
            // Fallback: just delete the DB record
            await strapi.db.query('plugin::upload.file').delete({
                where: { id: fileId },
            });
        }
        return { id: fileId, deleted: true };
    },

    async uploadToFolder(files, folderId, fileInfo) {
        // Upload files using Strapi's upload service, then move to folder
        const uploadService = strapi.plugin('upload').service('upload');

        const uploaded = [];
        for (const file of files) {
            const [result] = await uploadService.upload({
                data: {
                    fileInfo: fileInfo || {},
                },
                files: file,
            });
            uploaded.push(result);
        }

        // Move to folder if specified
        if (folderId && uploaded.length > 0) {
            const ids = uploaded.map(f => f.id);
            await this.moveFiles(ids, folderId);
            // Re-fetch to get updated folder info
            const updatedFiles = [];
            for (const id of ids) {
                const f = await strapi.db.query('plugin::upload.file').findOne({
                    where: { id },
                    populate: { folder: { select: ['id', 'name', 'path'] } },
                });
                updatedFiles.push(f);
            }
            return updatedFiles;
        }

        return uploaded;
    },

    // ─── Media-server video surface (proxy) ─────────────────
    //
    // Video bytes, the drive scanner and the folder tree all belong to the
    // Rutba Media FileServer: it owns the disks, so it is the only thing that
    // can walk them, and it already has a resumable scanner and a metadata
    // index. This backend keeps NO scanner of its own — it forwards to the
    // media server using the upload token (the very credential the upload
    // provider already holds), so ERP users need no media-server account and
    // never talk to that origin directly.

    /** Media-server origin + service token, from the upload provider's options. */
    _mediaService() {
        const cfg = strapi.config.get('plugin::upload') || {};
        const opts = cfg.providerOptions || cfg.config?.providerOptions || {};
        const baseUrl = String(opts.baseUrl || '').replace(/\/+$/, '');
        return { baseUrl, token: opts.uploadToken || '' };
    },

    async _mediaFetch(routePath, { method = 'GET', params = null, body = null } = {}) {
        const { baseUrl, token } = this._mediaService();
        if (!baseUrl || !token) {
            const err = new Error(
                'No media server configured — set MEDIA_BASE_URL and MEDIA_UPLOAD_TOKEN. '
                + 'The video library and its drive scan live on the media server.');
            err.status = 503;
            throw err;
        }
        let url = `${baseUrl}${routePath}`;
        if (params) {
            const qs = new URLSearchParams();
            for (const [k, v] of Object.entries(params)) {
                if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
            }
            const s = qs.toString();
            if (s) url += `?${s}`;
        }
        const res = await fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                'X-Upload-Token': token,
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const text = await res.text();
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
        if (!res.ok) {
            const err = new Error(json?.message || json?.error || `Media server ${res.status}`);
            err.status = res.status;
            throw err;
        }
        return json || {};
    },

    /** Videos the media server has indexed. Params: folder, recursive, q, limit, offset, sort. */
    async mediaVideos(params = {}) {
        const { baseUrl } = this._mediaService();
        const out = await this._mediaFetch('/_api/videos', { params });
        // The media server may hand back origin-relative urls; the ERP's callers
        // need absolute ones, and only this side knows the configured origin.
        const videos = (out.videos || []).map((v) => ({
            ...v,
            url: /^https?:\/\//i.test(v.url || '')
                ? v.url
                : `${baseUrl}/${String(v.url || v.path || '').replace(/^\/+/, '')}`,
        }));
        return { ...out, videos };
    },

    /** Folders that contain videos, with per-folder counts. */
    async mediaVideoFolders() {
        return this._mediaFetch('/_api/videos/folders');
    },

    /**
     * Tags carried by videos, with counts. `params.folder` narrows them to the
     * folder in view, so the gallery's tag filter is a facet of what is on
     * screen rather than of the whole store.
     */
    async mediaVideoTags(params = {}) {
        return this._mediaFetch('/_api/videos/tags', { params });
    },

    /** State of the media server's drive scan. */
    async videoScanStatus() {
        return this._mediaFetch('/_api/videos/scan');
    },

    /** Ask the media server to (re)scan its drives. */
    async videoScanRun({ folder = null } = {}) {
        return this._mediaFetch('/_api/videos/scan', {
            method: 'POST',
            body: folder ? { folder } : {},
        });
    },

    /**
     * Point library rows at videos that already live on the media server, so a
     * scanned file can be attached to a post (posts carry Strapi media
     * relations, which are file ids). Nothing is copied or re-uploaded: the
     * bytes stay put and the row records where they are.
     *
     * `caption` holds the media-server path — the provenance marker AND the
     * dedupe key, so linking the same video twice returns the first row.
     */
    async linkMediaVideos(items = []) {
        const { baseUrl } = this._mediaService();
        const linked = [];
        const errors = [];

        for (const item of Array.isArray(items) ? items : [items]) {
            const rel = String(item?.path || '').replace(/^\/+/, '');
            if (!rel) { errors.push('An entry had no path.'); continue; }
            try {
                const url = /^https?:\/\//i.test(item.url || '') ? item.url : `${baseUrl}/${rel}`;
                const existing = await strapi.db.query('plugin::upload.file').findOne({
                    where: { $or: [{ url }, { caption: rel }] },
                });
                if (existing) { linked.push(existing); continue; }

                const name = item.name || path.basename(rel);
                const ext = path.extname(name) || path.extname(rel);
                const bare = ext.slice(1).toLowerCase();
                const values = {
                    name,
                    alternativeText: item.alternativeText || null,
                    caption: rel,
                    // Strapi derives nothing from `hash` for a remote file, but
                    // every row has one and the media path is already unique.
                    hash: rel.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 200),
                    ext,
                    mime: item.mime || SCAN_MIME_BY_EXT[bare] || 'video/mp4',
                    // Strapi stores kB with 2 decimals; the server reports bytes.
                    size: Math.round(((Number(item.size_bytes ?? item.size) || 0) / 1000) * 100) / 100,
                    url,
                    provider: (strapi.config.get('plugin::upload') || {}).provider || 'strapi-provider-upload-media',
                    width: item.width ?? null,
                    height: item.height ?? null,
                    folderPath: '/',
                };

                // Two backends, one intent: register a row for bytes that are
                // already stored. Core exposes registerRemote for exactly this;
                // Strapi's db layer creates the row directly (its own
                // upload.add() has the same no-provider-write semantics, but
                // takes an admin user context this call has no business faking).
                const uploadSvc = strapi.plugin('upload').service('upload');
                const row = typeof uploadSvc.registerRemote === 'function'
                    ? await uploadSvc.registerRemote(values)
                    : await strapi.db.query('plugin::upload.file').create({ data: values });
                linked.push(row);
            } catch (e) {
                errors.push(`${rel}: ${e.message}`);
            }
        }
        return { linked, count: linked.length, errors };
    },
});
