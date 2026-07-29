import { operatorAction } from '../../../../lib/api-handler';
import engine from '../../../../lib/engine';

// POST /api/accounts/:id/push-status → report our order statuses back now.
export default operatorAction((req) => engine.pushOrderStatusForAccount(req.query.id));
