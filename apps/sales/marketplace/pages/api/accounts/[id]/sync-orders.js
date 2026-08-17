import { operatorAction } from '../../../../lib/api-handler';
import engine from '../../../../lib/engine';

// POST /api/accounts/:id/sync-orders → pull + ingest this account's orders now.
export default operatorAction((req) => engine.syncOrdersForAccount(req.query.id));
