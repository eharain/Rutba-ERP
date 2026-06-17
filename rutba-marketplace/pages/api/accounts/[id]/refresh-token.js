import { operatorAction } from '../../../../lib/api-handler';
import engine from '../../../../lib/engine';

// POST /api/accounts/:id/refresh-token → force an OAuth token refresh.
export default operatorAction((req) => engine.refreshAccountToken(req.query.id));
