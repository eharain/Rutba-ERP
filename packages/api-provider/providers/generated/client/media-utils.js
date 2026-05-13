import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { MediaUtilsEndpoints as MediaUtilsEndpointsApi } from '../../../api/media-utils.js';

async function imageBaseUrl() {
    const ep = MediaUtilsEndpointsApi.imageBaseUrl();
    return authApi.fetch(ep.path, ep.params);
}

async function strapiImageUrl(file) {
    const ep = MediaUtilsEndpointsApi.strapiImageUrl(file);
    return authApi.fetch(ep.path, ep.params);
}

async function isImage(file) {
    const ep = MediaUtilsEndpointsApi.isImage(file);
    return authApi.fetch(ep.path, ep.params);
}

async function isPDF(file) {
    const ep = MediaUtilsEndpointsApi.isPDF(file);
    return authApi.fetch(ep.path, ep.params);
}

async function isVideo(file) {
    const ep = MediaUtilsEndpointsApi.isVideo(file);
    return authApi.fetch(ep.path, ep.params);
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
