import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { UploadEndpoints as UploadEndpointsApi } from '../../../api/upload.js';

async function upload() {
    const ep = UploadEndpointsApi.upload();
    return authApi.fetch(ep.path, ep.params);
}

async function uploadFiles(files, ref, field, refId, info) {
    const ep = UploadEndpointsApi.uploadFiles(files, ref, field, refId, info);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function deleteFile(fileId) {
    const ep = UploadEndpointsApi.deleteFile(fileId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'UploadEndpoints',
    {
        upload,
        uploadFiles,
        deleteFile,
    },
    ["upload","uploadFiles","deleteFile"],
);

export default endpoints;
export const UploadEndpoints = endpoints;
