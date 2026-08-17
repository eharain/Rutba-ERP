// ./src/api/media/controllers/media.js
const { factories } = require('@strapi/strapi');

module.exports = factories.createCoreController('plugin::upload.file', ({ strapi }) => ({
    /**
     * GET /media/folders?parentId=<documentId>&start=0&limit=24
     */
    async listFolders(ctx) {
        const { parentId, pagination: { page = 0, pageSize = 50 } } = ctx.request.query;
        const start = 1 * page * pageSize;
        const limit = pageSize;
        const filters = parentId == false ? { parent: { $null: true } } : parentId ? { parent: { documentId: parentId } } : {};

        strapi.log.info('listFolders filters:' + limit + ',' + start + ',' + page + ',' + pageSize);

        const folders = await strapi.documents('plugin::upload.folder').findMany({
            filters,
            sort: [{ name: 'asc' }],
            start: Number(start),
            limit: Number(limit),
            // fields: ['name', 'pathId'], // optionally restrict fields
        });

        ctx.body = folders;
    },

    /**
     * GET /media/files?folderId=<documentId>&start=0&limit=24
     */
    async listFiles(ctx) {
        const { folderId, pagination: { page = 0, pageSize = 50 } } = ctx.request.query;
        const start = page * pageSize;
        const limit = pageSize;

        const filters = folderId == false ? { folder: { $null: true } } : folderId ? { folder: { documentId: folderId } } : {};

        const files = await strapi.documents('plugin::upload.file').findMany({
            filters,
            sort: [{ createdAt: 'desc' }],
            start: Number(start),
            limit: Number(limit),
            populate: { folder: true },
        });

        ctx.body = files;
    },

    /**
     * POST /media/folders
     * Body (JSON):
     * { "name": "My Folder", "parentId": "<optional parent documentId>" }
     * — or —
     * { "data": { "name": "My Folder", "parentId": "<id>" } }  // both shapes supported
     */
    async createFolder(ctx) {
        // Accept raw {name, parentId} or Strapi-style { data: { ... } }
        const body = ctx.request.body?.data || ctx.request.body || {};
        const { name, parentId } = body;
        console.log('createFolder body:', body);
        strapi.log.info('createFolder body:', body);

        if (!name) ctx.throw(400, 'Missing "name"');
        try {

            const folderService = strapi.plugin('upload').service('folder');

            const folder = await folderService.create({
                name,
                parent: parentId || null, // parentId must be a numeric DB id, not documentId
            });

            ctx.status = 201;
            ctx.body = folder;
        } catch (err) {
            strapi.log.error('Error creating folder:', err);
            ctx.throw(500, 'Error creating folder');
        }
    },/**
   * PUT /media/folders/:documentId
   * Body: { "name": "New Name", "parentDocumentId": "uuid", "fileDocumentIds": ["uuid1","uuid2"] }
   */
    async folderAddFilesByDocumentId(ctx) {
        try {
            const { documentId } = ctx.params;
            const { fileDocumentIds } = ctx.request.body;

            if (!documentId) {
                return ctx.badRequest('Folder documentId is required in params');
            }

            // Resolve folder id from documentId
            const [folder] = await strapi.db.query('plugin::upload.folder').findMany({
                where: { documentId },
                select: ['id'],
            });

            if (!folder) {
                return ctx.notFound(`Folder with documentId ${documentId} not found`);
            }


            // Attach files (if provided)
            if (Array.isArray(fileDocumentIds) && fileDocumentIds.length > 0) {
                const data = await strapi.db.query('plugin::upload.folder').update({
                    where: { documentId },
                    data: {
                        files: {
                            connect: fileDocumentIds // Use the related entity's documentId or id
                        }
                    }
                });
                ctx.body = {
                    data,
                    message: 'Folder updated successfully',
                };
            } else {
                ctx.body = { message: 'no fileDocumentIds to add to the folder' };
            }


        } catch (err) {
            strapi.log.error('Error updating folder by documentId:', err);
            ctx.throw(500, 'Error updating folder');
        }
    },

    async createFile(ctx) {
        try {
            const fileData = ctx.request.body;

            if (!fileData || !fileData.name || !fileData.hash || !fileData.url) {
                return ctx.badRequest('Required fields: name, hash, url');
            }

            // Create a file entry (no physical upload, just metadata)
            const newFile = await strapi.documents('plugin::upload.file').create({
                data: {
                    name: fileData.name,
                    alternativeText: fileData.alternativeText || null,
                    caption: fileData.caption || null,
                    hash: fileData.hash,
                    ext: fileData.ext,
                    mime: fileData.mime,
                    size: fileData.size,
                    url: fileData.url,
                    provider: fileData.provider || 'local',
                    folderPath: fileData.folderPath || '/',
                    folder: fileData.folder || null, // expects numeric folder id
                    createdAt: fileData.createdAt || new Date(),
                    updatedAt: fileData.updatedAt || new Date(),
                    publishedAt: fileData.publishedAt || new Date(),
                },
            });

            ctx.body = {
                message: 'File registered successfully',
                data: newFile,
            };
        } catch (err) {
            strapi.log.error('Error creating file record:', err);
            ctx.throw(500, 'Error creating file');
        }
    },
    async publishByTypeAndDocumentId(ctx) {
        try {
            const { type, documentId } = ctx.params;

            if (!type || !documentId) {
                return ctx.badRequest("Both type (UID) and documentId are required");
            }

            // Correct UID format: api::<collectionName>.<singularName>
            const UID = `api::${type}.${type}`;

            // Optionally merge body data before publish
            const updateData = ctx.request.body?.data || {};

            if (Object.keys(updateData).length > 0) {
                await strapi.documents(UID).update(documentId, { data: updateData });
            }

            const publishedDoc = await strapi.documents(UID).publish(documentId);

            ctx.body = {
                message: `Content of type '${type}' with documentId '${documentId}' published successfully`,
                data: publishedDoc,
            };
        } catch (err) {
            strapi.log.error("Error publishing document:", err);
            ctx.throw(500, "Error publishing document");
        }
    },
}));
