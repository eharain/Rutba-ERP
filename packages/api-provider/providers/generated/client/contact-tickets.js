import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { ContactTicketsEndpoints as ContactTicketsEndpointsApi } from '../../../api/contact-tickets.js';

async function listMine() {
    const ep = ContactTicketsEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function submitInternal(data) {
    const ep = ContactTicketsEndpointsApi.submitInternal(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function listTeam() {
    const ep = ContactTicketsEndpointsApi.listTeam();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function resolve(documentId) {
    const ep = ContactTicketsEndpointsApi.resolve(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'ContactTicketsEndpoints',
    {
        listMine,
        submitInternal,
        listTeam,
        resolve,
        meta: ContactTicketsEndpointsApi.meta,
    },
    ["listMine","submitInternal","listTeam","resolve","meta"],
);

export default endpoints;
export const ContactTicketsEndpoints = endpoints;
