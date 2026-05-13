---
name: feedback-scaffolder-inline-generation
description: Generated provider files inline the HTTP dispatch at the call site — scaffolder resolves verb at compile time, no runtime executeEndpoint
metadata: 
  node_type: memory
  type: feedback
  originSessionId: fcd105ef-dfd6-48f9-a4bd-3519a8356db4
---

**Status:** Implemented in 2026-05 — generated providers now use inline dispatch.

**Final shape** of every generated method in `packages/api-provider/providers/generated/client/<entity>.js`:

```js
import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { AccAccountsEndpoints as AccAccountsEndpointsApi } from '../../../api/acc-accounts.js';

async function byId(documentId, arg2 = {}) {
    const ep = AccAccountsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);              // GET — verb baked in
}

async function create(data) {
    const ep = AccAccountsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));   // POST — baked in
}
```

**Why:** Three things converge:
1. Verb dispatch is decided at scaffold time (from descriptor's `method:` literal, falling back to key-prefix rule: `post*`/`put*`/`patch*`/`del*` → matching verb, else GET). No runtime dispatcher.
2. Each generated function mirrors the descriptor's own named parameter list (e.g. `providerCallback(provider, accessToken)`) instead of `(...args)` — destructured patterns get `arg1`/`arg2` aliases that preserve any defaults.
3. Descriptors are canonical: all paths start with `/`. The old `ensureLeadingSlash` was removed (it papered over inconsistent descriptors); the 37 web descriptors that lacked a leading slash were fixed at the source.

**How to apply when touching the scaffolder:**
- `scripts/scaffold-endpoint-providers.mjs::buildProviderArtifacts` is the emission entry point. The two key helpers are `resolveHttpVerb(key, explicitMethod)` and `buildSignatureAndForwarding(paramsRaw)`.
- `scripts/scaffold__core__.js` exports `withQuery`, `wrapData`, `strictEndpointGuard`, and `resolveHttpVerb` (for validators). It does **not** export an `executeEndpoint` — there is no runtime dispatcher to import.
- For spread helpers (`__publish_generic_helper`, `publishMethods`, `standard`), the static shape in `SPREAD_HELPER_SHAPES` carries `method:` per entry so the inline emission knows the verb without re-reading the helper source.
- New descriptors should always declare `method:` explicitly — relying on key-prefix inference is fragile (e.g. `remove:` won't auto-resolve to DELETE without `method: 'delete'`). The scaffolder will silently fall back to GET if both are missing.

**Don't reintroduce a runtime dispatcher.** Helpers like `withQuery`/`wrapData` are pure shape utilities; they reshape path/params/data but never decide the verb. Verb decisions live at scaffold time.

Related: [[feedback-generated-code-verbosity]], [[feedback-strict-rollout-no-warn-phase]], [[project_api_provider_named_policy_architecture]].
