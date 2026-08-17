import { operatorAction } from '../../../../lib/api-handler';
import engine from '../../../../lib/engine';

// POST /api/accounts/:id/connect-url → { url } — the Daraz OAuth consent URL.
export default operatorAction((req) => engine.buildConnectUrl(req.query.id));
