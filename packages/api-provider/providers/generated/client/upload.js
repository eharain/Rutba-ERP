import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { UploadEndpoints as UploadEndpointsApi } from '../../../api/upload.js';

async function upload(...args) {
    return executeEndpoint(authApi, 'upload', UploadEndpointsApi.upload(...args));
}

async function uploadFiles(...args) {
    return executeEndpoint(authApi, 'uploadFiles', UploadEndpointsApi.uploadFiles(...args));
}

async function deleteFile(...args) {
    return executeEndpoint(authApi, 'deleteFile', UploadEndpointsApi.deleteFile(...args));
}

const endpoints = {
    upload,
    uploadFiles,
    deleteFile,
};

export default endpoints;
export const UploadEndpoints = endpoints;
