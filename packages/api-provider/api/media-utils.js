import { IMAGE_URL, StraipImageUrl, isImage, isPDF, isVideo } from '../lib/api.js';

export const MediaUtilsEndpoints = {
    meta: { domains: ['cms', 'order-management', 'social', 'stock'] },

    imageBaseUrl: () => IMAGE_URL,
    strapiImageUrl: (file) => StraipImageUrl(file),
    isImage: (file) => isImage(file),
    isPDF: (file) => isPDF(file),
    isVideo: (file) => isVideo(file),
};