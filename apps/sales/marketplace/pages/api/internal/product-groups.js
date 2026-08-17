import { operatorGet } from '../../../lib/api-handler';
import strapi from '../../../lib/strapi';

// GET /api/internal/product-groups — product-groups for the account's publish-set
// selector (service-token fetched, so the operator needs no cross-domain grant).
export default operatorGet(async () => ({ items: await strapi.listProductGroups() }));
