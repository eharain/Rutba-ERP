module.exports = {
    routes: [
        {
            method: 'GET', path: '/media/folders',
            handler: 'media.listFolders',
            config: { auth: false }
        },
        {
            method: 'GET', path: '/media/files',
            handler: 'media.listFiles',
            config: { auth: false }
        },
        {
            method: 'POST', path: '/media/folders',
            handler: 'media.createFolder',
            config: { auth: false }
        },
        {
            method: 'PUT',
            path: '/media/folders/:documentId/files',
            handler: 'media.folderAddFilesByDocumentId',
            config: { auth: false },
        },
        {
            method: 'POST',
            path: '/media/files',
            handler: 'media.createFile',
            config: { auth: false },
        },
        {
            method: 'POST',
            path: '/media/publish/:type/:documentId',
            handler: 'media.publishByTypeAndDocumentId',
            config: { auth: false },
        },
    ],
};