import { operatorAction } from '../../../../lib/api-handler';
import engine from '../../../../lib/engine';

// POST /api/providers/:platform/application-doc → { filename, html, missing }
//
// Renders the provider's API-access application attachment from the operator's
// answers. POST rather than GET on purpose: the answers include business contact
// details, which must not end up in a URL, a browser history entry, or a server
// access log. Nothing is persisted — the document is built and returned.
export default operatorAction((req) =>
  engine.renderApplicationDoc(req.query.platform, req.body?.values));
