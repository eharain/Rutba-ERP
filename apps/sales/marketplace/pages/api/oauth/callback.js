import engine from '../../../lib/engine';

// Public OAuth redirect target. Daraz sends the browser back here with
// ?state&code; the engine verifies the nonce in `state`, exchanges the code,
// and stores the tokens in Strapi. Returns a tiny popup-closer page.
function popupHtml({ ok, message }) {
  const payload = JSON.stringify({ source: 'rutba-marketplace-oauth', ok, message });
  return `<!doctype html><html><head><meta charset="utf-8"><title>Connecting…</title></head>
<body style="font-family:system-ui;padding:2rem;text-align:center">
<p>${ok ? '✅ Connected. You can close this window.' : '❌ ' + (message || 'Connection failed')}</p>
<script>
  try { if (window.opener) window.opener.postMessage(${payload}, '*'); } catch (e) {}
  setTimeout(function(){ window.close(); }, ok ? 600 : 4000);
</script>
</body></html>`;
}

export default async function handler(req, res) {
  const { state, code, error, error_description } = req.query;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    const r = await engine.handleOAuthCallback({ state, code, error, error_description });
    return res.status(200).send(popupHtml({ ok: true, message: `${r.platform} · ${r.account_name || ''}` }));
  } catch (e) {
    return res.status(200).send(popupHtml({ ok: false, message: e.message }));
  }
}
