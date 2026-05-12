/*not managed*/
export function publishMethods(contentType) {
    return {
        updateDraft: (documentId, data) => ({ path: `/${contentType}/${documentId}`, action: 'update', method: 'put', params: { status: 'draft' }, data, data }),
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