import { operatorAction } from '../../../../lib/api-handler';
import engine from '../../../../lib/engine';

// POST /api/accounts/:id/sync-catalog → push the full catalog (products +
// variants + media) for this account's publish set now. Catalog-capable
// providers only (Rutba targets); others report skipped.
export default operatorAction((req) => engine.syncCatalogForAccount(req.query.id));
