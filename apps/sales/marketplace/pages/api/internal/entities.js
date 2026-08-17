import { operatorGet } from '../../../lib/api-handler';
import strapi from '../../../lib/strapi';

// GET /api/internal/entities?kind=category|brand|term_type|term
// Our taxonomy entities for the mapping UI (service-token fetched, so the
// operator needs no cross-domain read grants).
export default operatorGet(async (req) => ({ items: await strapi.listInternalEntities(req.query.kind || 'category') }));
