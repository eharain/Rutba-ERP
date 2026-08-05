/*not managed*/
// Draft editing alone. Every content type can take a draft update; only the
// ones with a /publish route can be published, which is why these are split —
// spreading the full set onto a type that has no such route publishes nothing
// and just leaves an endpoint the apps can call and never get an answer from.
export function draftMethods(contentType) {
    return {
        updateDraft: (documentId, data) => ({ path: `/${contentType}/${documentId}`, action: 'update', method: 'put', params: { status: 'draft' }, data }),
    }
}

export function publishMethods(contentType) {
    return {
        ...draftMethods(contentType),
        publish: (documentId) => ({ path: `/${contentType}/${documentId}/publish`, action: 'publish', method: 'post' }),
        unpublish: (documentId) => ({ path: `/${contentType}/${documentId}/unpublish`, action: 'unpublish', method: 'post' }),
    }
}

export function standard(contentType) {
    return {
        create: (data) => ({ path: `/${contentType}`, action: 'create', method: 'post', data }),
        del: (documentId) => ({ path: `/${contentType}/${documentId}`, action: 'delete', method: 'delete' }),
    }
}

export default (contentType) => ({ ...publishMethods(contentType), ...standard(contentType) });