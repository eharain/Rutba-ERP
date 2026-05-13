import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { MediaUtilsEndpoints as MediaUtilsEndpointsApi } from '../../../api/media-utils.js';

async function imageBaseUrl(...args) {
    return executeEndpoint(authApi, 'imageBaseUrl', MediaUtilsEndpointsApi.imageBaseUrl(...args));
}

async function strapiImageUrl(...args) {
    return executeEndpoint(authApi, 'strapiImageUrl', MediaUtilsEndpointsApi.strapiImageUrl(...args));
}

async function isImage(...args) {
    return executeEndpoint(authApi, 'isImage', MediaUtilsEndpointsApi.isImage(...args));
}

async function isPDF(...args) {
    return executeEndpoint(authApi, 'isPDF', MediaUtilsEndpointsApi.isPDF(...args));
}

async function isVideo(...args) {
    return executeEndpoint(authApi, 'isVideo', MediaUtilsEndpointsApi.isVideo(...args));
}

const endpoints = strictEndpointGuard(
    'MediaUtilsEndpoints',
    {
        imageBaseUrl,
        strapiImageUrl,
        isImage,
        isPDF,
        isVideo,
    },
    ["imageBaseUrl","strapiImageUrl","isImage","isPDF","isVideo"],
);

export default endpoints;
export const MediaUtilsEndpoints = endpoints;
