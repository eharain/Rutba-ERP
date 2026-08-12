import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { MediaLibraryEndpoints as MediaLibraryEndpointsApi } from '../../../api/media-library.js';

async function foldersTree() {
    const ep = MediaLibraryEndpointsApi.foldersTree();
    return authApi.fetch(ep.path, ep.params);
}

async function folders(parentId = null) {
    const ep = MediaLibraryEndpointsApi.folders(parentId);
    return authApi.fetch(ep.path, ep.params);
}

async function folder(id) {
    const ep = MediaLibraryEndpointsApi.folder(id);
    return authApi.fetch(ep.path, ep.params);
}

async function files(params = {}) {
    const ep = MediaLibraryEndpointsApi.files(params);
    return authApi.fetch(ep.path, ep.params);
}

async function file(id) {
    const ep = MediaLibraryEndpointsApi.file(id);
    return authApi.fetch(ep.path, ep.params);
}

async function moveFiles(data) {
    const ep = MediaLibraryEndpointsApi.moveFiles(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function uploadToFolder(data) {
    const ep = MediaLibraryEndpointsApi.uploadToFolder(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function createFolder(data) {
    const ep = MediaLibraryEndpointsApi.createFolder(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function renameFolder(id, data) {
    const ep = MediaLibraryEndpointsApi.renameFolder(id, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function deleteFolder(id) {
    const ep = MediaLibraryEndpointsApi.deleteFolder(id);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function updateFileInfo(id, data) {
    const ep = MediaLibraryEndpointsApi.updateFileInfo(id, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function uploadFile(data) {
    const ep = MediaLibraryEndpointsApi.uploadFile(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function delFile(id) {
    const ep = MediaLibraryEndpointsApi.delFile(id);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function mediaVideos(params = {}) {
    const ep = MediaLibraryEndpointsApi.mediaVideos(params);
    return authApi.fetch(ep.path, ep.params);
}

async function mediaVideoFolders() {
    const ep = MediaLibraryEndpointsApi.mediaVideoFolders();
    return authApi.fetch(ep.path, ep.params);
}

async function linkMediaVideos(data) {
    const ep = MediaLibraryEndpointsApi.linkMediaVideos(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function videoScanStatus() {
    const ep = MediaLibraryEndpointsApi.videoScanStatus();
    return authApi.fetch(ep.path, ep.params);
}

async function videoScan(data = {}) {
    const ep = MediaLibraryEndpointsApi.videoScan(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
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
        mediaVideos,
        mediaVideoFolders,
        linkMediaVideos,
        videoScanStatus,
        videoScan,
        meta: MediaLibraryEndpointsApi.meta,
    },
    ["foldersTree","folders","folder","files","file","moveFiles","uploadToFolder","createFolder","renameFolder","deleteFolder","updateFileInfo","uploadFile","delFile","mediaVideos","mediaVideoFolders","linkMediaVideos","videoScanStatus","videoScan","meta"],
);

export default endpoints;
export const MediaLibraryEndpoints = endpoints;
