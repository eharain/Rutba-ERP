'use strict';

/**
 * media-library service
 *
 * Wraps Strapi's internal upload plugin queries for folder
 * and file management, exposing them to the content API.
 */

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
        // Move all files in this folder to root first
        await strapi.db.query('plugin::upload.file').updateMany({
            where: { folder: { id: folderId } },
            data: { folder: null, folderPath: '/' },
        });

        // Move child folders to root
        await strapi.db.query('plugin::upload.folder').updateMany({
            where: { parent: { id: folderId } },
            data: { parent: null },
        });

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
});
