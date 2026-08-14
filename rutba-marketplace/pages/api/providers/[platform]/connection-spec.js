import { operatorGet } from '../../../../lib/api-handler';
import engine from '../../../../lib/engine';

// GET /api/providers/:platform/connection-spec → what the operator must set up
// on the provider's side (app category, APIs to request, callback URL, setup
// steps). Static and non-sensitive — no credentials are read or returned.
// Drives the setup panel on the accounts page.
export default operatorGet((req) => engine.getConnectionSpec(req.query.platform));
