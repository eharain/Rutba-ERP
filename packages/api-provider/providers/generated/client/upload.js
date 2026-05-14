import { authApi } from '../../../lib/api.js';
import { withQuery, strictEndpointGuard } from './___core__.js';
import { UploadEndpoints as UploadEndpointsApi } from '../../../api/upload.js';

async function uploadFiles(files, ref, field, refId, info) {
    const ep = UploadEndpointsApi.uploadFiles(files, ref, field, refId, info);
    return authApi.fetch(ep.path, ep.params);
}

async function deleteFile(fileId) {
    const ep = UploadEndpointsApi.deleteFile(fileId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'UploadEndpoints',
    {
        uploadFiles,
        deleteFile,
        meta: UploadEndpointsApi.meta,
    },
    ["uploadFiles","deleteFile","meta"],
);

export default endpoints;
export const UploadEndpoints = endpoints;
