import React from 'react';
import {
  Box,
  Typography,
  Textarea,
  Flex,
  Button,
  SingleSelect,
  SingleSelectOption,
} from '@strapi/design-system';
import { useFetchClient } from '@strapi/strapi/admin';

const api = (p) => `/api-pro${p}`;

// Sample context used for live preview in the Editor tab. Mirrors what the
// server-side policy-resolver will see at runtime.
const SAMPLE_CONTEXT = {
  user: { id: 9, email: 'user@example.com', branch: { id: 2 } },
  claim: { appName: 'pos-desk', domainKey: 'pos-desk-cashier' },
  query: { q: 'shoes' },
  params: { documentId: 'abc123' },
  body: { name: 'Sample', price: 199 },
  strapi: { request: { method: 'GET', path: '/api/products' } },
};

// $-syntax token resolver (mirrors server/src/services/policy-resolver.js).
function resolveToken(value, context) {
  if (typeof value !== 'string' || !value.startsWith('$')) return value;
  if (value === '$today') return new Date().toISOString().split('T')[0];
  if (value === '$now') return new Date().toISOString();
  const parts = value.slice(1).split('.');
  let result = context;
  for (const part of parts) {
    if (result === undefined || result === null) return undefined;
    result = result[part];
  }
  return result;
}

function resolveDeep(value, context) {
  if (Array.isArray(value)) {
    return value.map((v) => resolveDeep(v, context)).filter((v) => v !== undefined);
  }
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const resolved = resolveDeep(v, context);
      if (resolved !== undefined) out[k] = resolved;
    }
    return out;
  }
  if (typeof value === 'string' && value.startsWith('$')) {
    return resolveToken(value, context);
  }
  return value;
}

function safeParse(raw, fallback = {}) {
  if (!raw || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return { __parseError: error.message };
  }
}

const blankPolicyTemplates = {
  filtersTemplate: {},
  populateTemplate: {},
  bodyTemplate: {},
  queryTemplate: {},
};

const Editor = ({ interfaces, roles }) => {
  const { get, put } = useFetchClient();
  const [interfaceKey, setInterfaceKey] = React.useState('');
  const [methodKey, setMethodKey] = React.useState('');
  const [roleKey, setRoleKey] = React.useState('');
  const [templates, setTemplates] = React.useState({
    filtersTemplate: '{}',
    populateTemplate: '{}',
    bodyTemplate: '{}',
    queryTemplate: '{}',
  });
  const [message, setMessage] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const currentInterface = React.useMemo(
    () => interfaces.find((i) => i.key === interfaceKey),
    [interfaces, interfaceKey]
  );
  const methodOptions = React.useMemo(
    () => (currentInterface?.methods || []).map((m) => ({ key: m.name, label: m.name })),
    [currentInterface]
  );

  // Reset method when interface changes
  React.useEffect(() => {
    if (currentInterface && !methodOptions.find((m) => m.key === methodKey)) {
      setMethodKey('');
    }
  }, [currentInterface, methodOptions, methodKey]);

  const loadExisting = React.useCallback(async () => {
    if (!interfaceKey || !methodKey || !roleKey) return;
    setMessage('');
    try {
      const { data } = await get(api(`/policies/${interfaceKey}/${methodKey}/${roleKey}`));
      const p = data?.data || blankPolicyTemplates;
      setTemplates({
        filtersTemplate: JSON.stringify(p.filtersTemplate || {}, null, 2),
        populateTemplate: JSON.stringify(p.populateTemplate || {}, null, 2),
        bodyTemplate: JSON.stringify(p.bodyTemplate || {}, null, 2),
        queryTemplate: JSON.stringify(p.queryTemplate || {}, null, 2),
      });
    } catch {
      // 404 = no policy yet; start blank
      setTemplates({
        filtersTemplate: '{}',
        populateTemplate: '{}',
        bodyTemplate: '{}',
        queryTemplate: '{}',
      });
    }
  }, [get, interfaceKey, methodKey, roleKey]);

  React.useEffect(() => {
    loadExisting();
  }, [loadExisting]);

  const save = async () => {
    if (!interfaceKey || !methodKey || !roleKey) {
      setMessage('Select interface, method and role first.');
      return;
    }
    const payload = {
      filtersTemplate: safeParse(templates.filtersTemplate),
      populateTemplate: safeParse(templates.populateTemplate),
      bodyTemplate: safeParse(templates.bodyTemplate),
      queryTemplate: safeParse(templates.queryTemplate),
    };
    for (const [k, v] of Object.entries(payload)) {
      if (v && v.__parseError) {
        setMessage(`Invalid JSON in ${k}: ${v.__parseError}`);
        return;
      }
    }

    setLoading(true);
    setMessage('');
    try {
      await put(api(`/policies/${interfaceKey}/${methodKey}/${roleKey}`), payload);
      setMessage('Saved.');
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || 'Save failed.');
    } finally {
      setLoading(false);
    }
  };

  const previews = React.useMemo(() => {
    const out = {};
    for (const k of Object.keys(templates)) {
      const parsed = safeParse(templates[k]);
      out[k] = parsed && parsed.__parseError ? { error: parsed.__parseError } : resolveDeep(parsed, SAMPLE_CONTEXT);
    }
    return out;
  }, [templates]);

  return (
    <Box paddingTop={4}>
      <Flex gap={3} wrap="wrap">
        <Box style={{ flex: '1 1 200px', minWidth: 180 }}>
          <SingleSelect label="Interface" value={interfaceKey} onChange={setInterfaceKey} placeholder="Choose">
            {interfaces.map((i) => (
              <SingleSelectOption key={i.id} value={i.key}>
                {i.key} — {i.name}
              </SingleSelectOption>
            ))}
          </SingleSelect>
        </Box>
        <Box style={{ flex: '1 1 200px', minWidth: 180 }}>
          <SingleSelect label="Method" value={methodKey} onChange={setMethodKey} placeholder="Choose" disabled={!currentInterface}>
            {methodOptions.map((m) => (
              <SingleSelectOption key={m.key} value={m.key}>{m.label}</SingleSelectOption>
            ))}
          </SingleSelect>
        </Box>
        <Box style={{ flex: '1 1 200px', minWidth: 180 }}>
          <SingleSelect label="Role" value={roleKey} onChange={setRoleKey} placeholder="Choose">
            {roles.map((r) => (
              <SingleSelectOption key={r.id} value={r.key}>{r.key} — {r.name}</SingleSelectOption>
            ))}
          </SingleSelect>
        </Box>
      </Flex>

      {message && (
        <Box paddingTop={2}>
          <Typography textColor={message === 'Saved.' ? 'success700' : 'danger700'}>{message}</Typography>
        </Box>
      )}

      <Box paddingTop={3}>
        <Typography variant="pi" textColor="neutral600">
          Tokens use $-syntax: $user.id, $user.branch.id, $claim.appName, $query.q, $params.documentId, $body.x, $today, $now.
        </Typography>
      </Box>

      {['filtersTemplate', 'populateTemplate', 'queryTemplate', 'bodyTemplate'].map((field) => (
        <Box key={field} paddingTop={4}>
          <Typography variant="sigma">{field}</Typography>
          <Flex gap={3} alignItems="flex-start" wrap="wrap" paddingTop={2}>
            <Box style={{ flex: '1 1 380px', minWidth: 300 }}>
              <Textarea
                name={field}
                value={templates[field]}
                onChange={(e) => setTemplates((t) => ({ ...t, [field]: e.target.value }))}
              />
            </Box>
            <Box style={{ flex: '1 1 380px', minWidth: 300 }}>
              <Typography variant="pi" textColor="neutral500">Resolved (sample context)</Typography>
              <pre style={{ background: '#f4f4f8', padding: 8, borderRadius: 4, fontSize: 12, margin: 0 }}>
                {JSON.stringify(previews[field], null, 2)}
              </pre>
            </Box>
          </Flex>
        </Box>
      ))}

      <Flex paddingTop={4} gap={2}>
        <Button onClick={save} loading={loading} disabled={!interfaceKey || !methodKey || !roleKey}>
          Save Policy
        </Button>
        <Button variant="secondary" onClick={loadExisting} disabled={!interfaceKey || !methodKey || !roleKey}>
          Reload
        </Button>
      </Flex>
    </Box>
  );
};

const Comparative = ({ interfaces, roles }) => {
  const { get } = useFetchClient();
  const [interfaceKey, setInterfaceKey] = React.useState('');
  const [methodKey, setMethodKey] = React.useState('');
  const [policiesByRole, setPoliciesByRole] = React.useState({});
  const [loading, setLoading] = React.useState(false);

  const currentInterface = interfaces.find((i) => i.key === interfaceKey);
  const methodOptions = (currentInterface?.methods || []).map((m) => ({ key: m.name, label: m.name }));

  React.useEffect(() => {
    if (currentInterface && !methodOptions.find((m) => m.key === methodKey)) {
      setMethodKey('');
    }
  }, [currentInterface, methodOptions, methodKey]);

  const load = React.useCallback(async () => {
    if (!interfaceKey || !methodKey) return;
    setLoading(true);
    const out = {};
    await Promise.all(
      roles.map(async (r) => {
        try {
          const { data } = await get(api(`/policies/${interfaceKey}/${methodKey}/${r.key}`));
          out[r.key] = data?.data || null;
        } catch {
          out[r.key] = null;
        }
      })
    );
    setPoliciesByRole(out);
    setLoading(false);
  }, [get, interfaceKey, methodKey, roles]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <Box paddingTop={4}>
      <Flex gap={3} wrap="wrap">
        <Box style={{ flex: '1 1 200px', minWidth: 180 }}>
          <SingleSelect label="Interface" value={interfaceKey} onChange={setInterfaceKey} placeholder="Choose">
            {interfaces.map((i) => (
              <SingleSelectOption key={i.id} value={i.key}>{i.key}</SingleSelectOption>
            ))}
          </SingleSelect>
        </Box>
        <Box style={{ flex: '1 1 200px', minWidth: 180 }}>
          <SingleSelect label="Method" value={methodKey} onChange={setMethodKey} placeholder="Choose" disabled={!currentInterface}>
            {methodOptions.map((m) => (
              <SingleSelectOption key={m.key} value={m.key}>{m.label}</SingleSelectOption>
            ))}
          </SingleSelect>
        </Box>
      </Flex>

      {loading && <Typography textColor="neutral500" paddingTop={2}>Loading…</Typography>}

      {interfaceKey && methodKey && !loading && (
        <Flex gap={3} paddingTop={3} alignItems="flex-start" style={{ overflowX: 'auto' }}>
          {roles.map((r) => {
            const p = policiesByRole[r.key];
            return (
              <Box
                key={r.id}
                style={{
                  flex: '0 0 280px',
                  border: '1px solid #e0e0e0',
                  borderRadius: 8,
                  padding: 12,
                  background: p ? 'transparent' : '#fafafa',
                }}
              >
                <Typography variant="sigma">{r.key}</Typography>
                <Typography variant="pi" textColor="neutral500">{r.name}</Typography>
                {p ? (
                  <Box paddingTop={2}>
                    {['filtersTemplate', 'populateTemplate', 'queryTemplate', 'bodyTemplate'].map((f) => {
                      const value = p[f];
                      const isEmpty = !value || (typeof value === 'object' && Object.keys(value).length === 0);
                      return (
                        <Box key={f} paddingTop={2}>
                          <Typography variant="pi" fontWeight="semiBold" textColor="neutral600">{f}</Typography>
                          <pre style={{ background: '#f4f4f8', padding: 6, borderRadius: 4, fontSize: 11, margin: 0 }}>
                            {isEmpty ? '(empty)' : JSON.stringify(value, null, 2)}
                          </pre>
                        </Box>
                      );
                    })}
                  </Box>
                ) : (
                  <Box paddingTop={2}>
                    <Typography variant="pi" textColor="neutral400">No policy for this role.</Typography>
                  </Box>
                )}
              </Box>
            );
          })}
        </Flex>
      )}
    </Box>
  );
};

const Policies = () => {
  const { get } = useFetchClient();
  const [tab, setTab] = React.useState('editor');
  const [interfaces, setInterfaces] = React.useState([]);
  const [roles, setRoles] = React.useState([]);

  React.useEffect(() => {
    (async () => {
      try {
        const [i, r] = await Promise.all([get(api('/interfaces')), get(api('/roles'))]);
        setInterfaces(i?.data?.data || []);
        setRoles(r?.data?.data || []);
      } catch {
        /* surfaced inside the tab */
      }
    })();
  }, [get]);

  return (
    <Box>
      <Typography variant="beta">Method Policies</Typography>
      <Flex gap={2} paddingTop={2}>
        <Button variant={tab === 'editor' ? 'default' : 'secondary'} onClick={() => setTab('editor')}>
          Editor
        </Button>
        <Button variant={tab === 'comparative' ? 'default' : 'secondary'} onClick={() => setTab('comparative')}>
          Comparative
        </Button>
      </Flex>

      {tab === 'editor' ? (
        <Editor interfaces={interfaces} roles={roles} />
      ) : (
        <Comparative interfaces={interfaces} roles={roles} />
      )}
    </Box>
  );
};

export default Policies;
