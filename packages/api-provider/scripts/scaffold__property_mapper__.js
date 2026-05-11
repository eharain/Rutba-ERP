export function toLegacyAlias(key) {
    if (key.startsWith('fetch') || key.startsWith('post') || key.startsWith('put') || key.startsWith('patch') || key.startsWith('del') || key.startsWith('delete')) {
        return null;
    }

    if (key === 'create') return 'postCreate';
    if (key === 'update') return 'putUpdate';
    if (key === 'remove') return 'deleteById';
    if (key === 'del') return 'deleteById';

    if (key.startsWith('list') || key.startsWith('by') || key.startsWith('get') || key.startsWith('search')) {
        return `fetch${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    }

    return null;
}
