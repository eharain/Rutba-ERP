import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { MediaLibraryEndpoints as MediaLibraryEndpointsApi } from '../../../api/media-library.js';

async function foldersTree(...args) {
    return executeEndpoint(authApi, 'foldersTree', MediaLibraryEndpointsApi.foldersTree(...args));
}

async function folders(...args) {
    return executeEndpoint(authApi, 'folders', MediaLibraryEndpointsApi.folders(...args));
}

async function folder(...args) {
    return executeEndpoint(authApi, 'folder', MediaLibraryEndpointsApi.folder(...args));
}

async function files(...args) {
    return executeEndpoint(authApi, 'files', MediaLibraryEndpointsApi.files(...args));
}

async function file(...args) {
    return executeEndpoint(authApi, 'file', MediaLibraryEndpointsApi.file(...args));
}

async function moveFiles(...args) {
    return executeEndpoint(authApi, 'moveFiles', MediaLibraryEndpointsApi.moveFiles(...args));
}

async function uploadToFolder(...args) {
    return executeEndpoint(authApi, 'uploadToFolder', MediaLibraryEndpointsApi.uploadToFolder(...args));
}

async function createFolder(...args) {
    return executeEndpoint(authApi, 'createFolder', MediaLibraryEndpointsApi.createFolder(...args));
}

async function renameFolder(...args) {
    return executeEndpoint(authApi, 'renameFolder', MediaLibraryEndpointsApi.renameFolder(...args));
}

async function deleteFolder(...args) {
    return executeEndpoint(authApi, 'deleteFolder', MediaLibraryEndpointsApi.deleteFolder(...args));
}

async function updateFileInfo(...args) {
    return executeEndpoint(authApi, 'updateFileInfo', MediaLibraryEndpointsApi.updateFileInfo(...args));
}

async function uploadFile(...args) {
    return executeEndpoint(authApi, 'uploadFile', MediaLibraryEndpointsApi.uploadFile(...args));
}

async function delFile(...args) {
    return executeEndpoint(authApi, 'delFile', MediaLibraryEndpointsApi.delFile(...args));
}

const endpoints = strictEndpointGuard(
    'MediaLibraryEndpoints',
    {
        foldersTree,
        folders,
        folder,
        files,
        file,
        moveFiles,
        uploadToFolder,
        createFolder,
        renameFolder,
        deleteFolder,
        updateFileInfo,
        uploadFile,
        delFile,
    },
    ["foldersTree","folders","folder","files","file","moveFiles","uploadToFolder","createFolder","renameFolder","deleteFolder","updateFileInfo","uploadFile","delFile"],
);

export default endpoints;
export const MediaLibraryEndpoints = endpoints;
