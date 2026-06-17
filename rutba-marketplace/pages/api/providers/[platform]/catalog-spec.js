import { operatorGet } from '../../../../lib/api-handler';
import engine from '../../../../lib/engine';

// GET /api/providers/:platform/catalog-spec → the provider's mapping spec
// (static, non-sensitive). Drives which dimensions the mapping UI renders.
export default operatorGet((req) => engine.getCatalogSpec(req.query.platform));
