import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { MediaLibraryEndpoints as MediaLibraryEndpointsApi } from '../../../api/media-library.js';

async function foldersTree() {
    const ep = MediaLibraryEndpointsApi.foldersTree();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function folders(parentId = null) {
    const ep = MediaLibraryEndpointsApi.folders(parentId);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function folder(id) {
    const ep = MediaLibraryEndpointsApi.folder(id);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function files(params = {}) {
    const ep = MediaLibraryEndpointsApi.files(params);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function file(id) {
    const ep = MediaLibraryEndpointsApi.file(id);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function moveFiles(data) {
    const ep = MediaLibraryEndpointsApi.moveFiles(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function uploadToFolder(data) {
    const ep = MediaLibraryEndpointsApi.uploadToFolder(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function createFolder(data) {
    const ep = MediaLibraryEndpointsApi.createFolder(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function renameFolder(id, data) {
    const ep = MediaLibraryEndpointsApi.renameFolder(id, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function deleteFolder(id) {
    const ep = MediaLibraryEndpointsApi.deleteFolder(id);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

async function updateFileInfo(id, data) {
    const ep = MediaLibraryEndpointsApi.updateFileInfo(id, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function uploadFile(data) {
    const ep = MediaLibraryEndpointsApi.uploadFile(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function delFile(id) {
    const ep = MediaLibraryEndpointsApi.delFile(id);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

async function mediaVideos(params = {}) {
    const ep = MediaLibraryEndpointsApi.mediaVideos(params);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function mediaVideoFolders() {
    const ep = MediaLibraryEndpointsApi.mediaVideoFolders();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function mediaVideoTags(params = {}) {
    const ep = MediaLibraryEndpointsApi.mediaVideoTags(params);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function linkMediaVideos(data) {
    const ep = MediaLibraryEndpointsApi.linkMediaVideos(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function videoScanStatus() {
    const ep = MediaLibraryEndpointsApi.videoScanStatus();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function videoScan(data = {}) {
    const ep = MediaLibraryEndpointsApi.videoScan(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
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
        mediaVideoTags,
        linkMediaVideos,
        videoScanStatus,
        videoScan,
        meta: MediaLibraryEndpointsApi.meta,
    },
    ["foldersTree","folders","folder","files","file","moveFiles","uploadToFolder","createFolder","renameFolder","deleteFolder","updateFileInfo","uploadFile","delFile","mediaVideos","mediaVideoFolders","mediaVideoTags","linkMediaVideos","videoScanStatus","videoScan","meta"],
);

export default endpoints;
export const MediaLibraryEndpoints = endpoints;
