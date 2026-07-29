import { operatorAction } from '../../../../lib/api-handler';
import engine from '../../../../lib/engine';

// POST /api/accounts/:id/sync-messages → exchange order conversation messages
// with this account's marketplace now (pull theirs, then push ours).
export default operatorAction((req) => engine.syncOrderMessagesForAccount(req.query.id));
