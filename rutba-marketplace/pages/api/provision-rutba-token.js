import { operatorAction } from '../../lib/api-handler';
import { provisionApiToken } from '../../lib/rutba-admin';

// POST /api/provision-rutba-token { base_url, email, password }
// Mints a full-access API token on the peer Rutba (online) instance from admin
// credentials and returns it, so the operator doesn't hand-create one. The
// password is used only for this exchange — never stored (only the token is,
// as the account's api_key on Save).
export default operatorAction(async (req) => {
  const { base_url, email, password } = req.body || {};
  if (!base_url || !email || !password) {
    const e = new Error('base_url, email and password are required');
    e.status = 400;
    throw e;
  }
  const { token, adminRoot } = await provisionApiToken({ baseUrl: base_url, email, password });
  return { token, adminRoot };
});
