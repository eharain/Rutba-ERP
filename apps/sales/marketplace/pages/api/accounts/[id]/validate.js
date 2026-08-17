import { operatorAction } from '../../../../lib/api-handler';
import engine from '../../../../lib/engine';

// POST /api/accounts/:id/validate → connection-health probe (refreshes if near expiry).
export default operatorAction((req) => engine.validateConnection(req.query.id));
