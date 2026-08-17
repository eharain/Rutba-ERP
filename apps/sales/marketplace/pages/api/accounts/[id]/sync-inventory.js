import { operatorAction } from '../../../../lib/api-handler';
import engine from '../../../../lib/engine';

// POST /api/accounts/:id/sync-inventory → push stock for this account's listed products now.
export default operatorAction((req) => engine.syncInventoryForAccount(req.query.id));
