import { DISABLED_PLACEHOLDERS } from './access-metadata.js';

/**
 * Disabled endpoint placeholders for config parity.
 *
 * Each placeholder method intentionally throws to prevent accidental runtime
 * usage while still exposing full config/action coverage in endpoint metadata.
 */
function createDisabledMethod(uid, action, reason) {
    return () => {
        throw new Error(`[endpoints] Disabled placeholder: ${uid}.${action} (${reason})`);
    };
}

function uidToKey(uid) {
    const [apiPart, typePart] = String(uid || '').split('.');
    const normalized = `${apiPart || ''}.${typePart || ''}`
        .replace(/^api::/, '')
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase());
    return `${normalized}DisabledEndpoints`;
}

const DisabledPlaceholderEndpoints = Object.fromEntries(
    (DISABLED_PLACEHOLDERS || []).map((entry) => {
        const endpointMethods = Object.fromEntries(
            (entry.placeholders || []).map((placeholder) => [
                placeholder.action,
                createDisabledMethod(entry.uid, placeholder.action, placeholder.reason),
            ])
        );

        return [
            uidToKey(entry.uid),
            {
                uid: entry.uid,
                endpointMissing: !!entry.endpointMissing,
                enabled: false,
                status: 'not-implemented',
                placeholders: (entry.placeholders || []),
                ...endpointMethods,
            },
        ];
    })
);

export { DisabledPlaceholderEndpoints };


