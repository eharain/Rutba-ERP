import { operatorGet } from '../../../lib/api-handler';
import strapi from '../../../lib/strapi';

// GET /api/internal/products?page=&pageSize=&q=
// Our products for the listing-selection UI (service-token fetched, so the
// operator needs no cross-domain stock read grant).
export default operatorGet((req) => strapi.listProducts({
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 50,
    q: req.query.q,
}));
