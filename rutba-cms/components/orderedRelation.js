export function toOrderedRelation(docIds) {
    if (!Array.isArray(docIds) || docIds.length === 0) {
        return { set: [] };
    }
    return {
        set: docIds.map((documentId, index) => ({
            documentId,
            position: index === 0 ? { start: true } : { after: docIds[index - 1] },
        })),
    };
}
