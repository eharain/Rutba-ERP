import React from 'react';
import {
  Box,
  Typography,
  Textarea,
  Flex,
  Button,
  SingleSelect,
  SingleSelectOption,
  TextInput,
} from '@strapi/design-system';
import { useFetchClient } from '@strapi/strapi/admin';
import FiltersBuilder from '../components/QueryBuilders/FiltersBuilder';
import PopulateBuilder from '../components/QueryBuilders/PopulateBuilder';
import KeyValueEditor from '../components/QueryBuilders/KeyValueEditor';

const BUILDERS = {
  filtersTemplate: FiltersBuilder,
  populateTemplate: PopulateBuilder,
  bodyTemplate: KeyValueEditor,
  queryTemplate: KeyValueEditor,
};

const api = (p) => `/api-pro${p}`;
const PAGE_SIZE = 20;

// ── Sample context for live $-token preview in the Editor ─────────────────
const SAMPLE_CONTEXT = {
  user: { id: 9, email: 'user@example.com', branch: { id: 2 } },
  claim: { appName: 'pos-desk', roleKey: 'pos_desk_cashier', domainKey: 'pos-desk' },
  query: { q: 'shoes' },
  params: { documentId: 'abc123' },
  body: { name: 'Sample', price: 199 },
  strapi: { request: { method: 'GET', path: '/api/products' } },
};

// ── $-syntax resolver (mirrors server/src/services/policy-resolver.js) ────
function resolveToken(value, context) {
  if (typeof value !== 'string' || !value.startsWith('$')) return value;
  if (value === '$today') return new Date().toISOString().split('T')[0];
  if (value === '$now') return new Date().toISOString();
  const parts = value.slice(1).split('.');
  let result = context;
  for (const part of parts) {
    if (result == null) return undefined;
    result = result[part];
  }
  return result;
}
function resolveDeep(value, context) {
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, context)).filter((v) => v !== undefined);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const r = resolveDeep(v, context);
      if (r !== undefined) out[k] = r;
    }
    return out;
  }
  if (typeof value === 'string' && value.startsWith('$')) return resolveToken(value, context);
  return value;
}
function safeParse(raw, fallback = {}) {
  if (!raw || !raw.trim()) return fallback;
  try { return JSON.parse(raw); } catch (e) { return { __parseError: e.message }; }
}

// ── Inline editor — replaces the row when "Edit" is clicked ───────────────
const InlineEditor = ({ interfaces, roles, selection, onSaved, onCancel }) => {
  const { get, put, del } = useFetchClient();
  const { interfaceKey, methodName, roleKey } = selection;
  const [templates, setTemplates] = React.useState({
    filtersTemplate: '{}',
    populateTemplate: '{}',
    bodyTemplate: '{}',
    queryTemplate: '{}',
  });
  const [message, setMessage] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  // showRawByField[fieldName] = boolean. Default false → use builder (when one
  // exists for that field); true → raw JSON textarea.
  const [showRawByField, setShowRawByField] = React.useState({
    filtersTemplate: false,
    populateTemplate: false,
    bodyTemplate: false,
    queryTemplate: false,
  });
  const toggleRaw = (field) => setShowRawByField((s) => ({ ...s, [field]: !s[field] }));

  React.useEffect(() => {
    if (!interfaceKey || !methodName || !roleKey) return;
    (async () => {
      try {
        const { data } = await get(api(`/policies/${interfaceKey}/${methodName}/${roleKey}`));
        const p = data?.data || {};
        setTemplates({
          filtersTemplate: JSON.stringify(p.filtersTemplate || {}, null, 2),
          populateTemplate: JSON.stringify(p.populateTemplate || {}, null, 2),
          bodyTemplate: JSON.stringify(p.bodyTemplate || {}, null, 2),
          queryTemplate: JSON.stringify(p.queryTemplate || {}, null, 2),
        });
      } catch {
        setTemplates({
          filtersTemplate: '{}', populateTemplate: '{}', bodyTemplate: '{}', queryTemplate: '{}',
        });
      }
    })();
  }, [get, interfaceKey, methodName, roleKey]);

  const previews = React.useMemo(() => {
    const out = {};
    for (const k of Object.keys(templates)) {
      const parsed = safeParse(templates[k]);
      out[k] = parsed && parsed.__parseError ? { error: parsed.__parseError } : resolveDeep(parsed, SAMPLE_CONTEXT);
    }
    return out;
  }, [templates]);

  const save = async () => {
    const payload = {
      filtersTemplate: safeParse(templates.filtersTemplate),
      populateTemplate: safeParse(templates.populateTemplate),
      bodyTemplate: safeParse(templates.bodyTemplate),
      queryTemplate: safeParse(templates.queryTemplate),
    };
    for (const [k, v] of Object.entries(payload)) {
      if (v && v.__parseError) { setMessage(`Invalid JSON in ${k}: ${v.__parseError}`); return; }
    }
    setLoading(true);
    setMessage('');
    try {
      await put(api(`/policies/${interfaceKey}/${methodName}/${roleKey}`), payload);
      onSaved?.();
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || 'Save failed.');
    } finally {
      setLoading(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete policy ${interfaceKey} / ${methodName} / ${roleKey}?`)) return;
    setLoading(true);
    try {
      await del(api(`/policies/${interfaceKey}/${methodName}/${roleKey}`));
      onSaved?.();
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || 'Delete failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box style={{ border: '2px solid #4945ff', borderRadius: 8, padding: 16, marginBottom: 12 }}>
      <Flex justifyContent="space-between" alignItems="center">
        <Typography variant="delta">
          Editing: <code>{interfaceKey}</code> / <code>{methodName}</code> / <code>{roleKey}</code>
        </Typography>
        <Flex gap={2}>
          <Button variant="danger-light" onClick={remove} disabled={loading}>Delete</Button>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button onClick={save} loading={loading}>Save</Button>
        </Flex>
      </Flex>

      <Box paddingTop={2}>
        <Typography variant="pi" textColor="neutral600">
          Tokens: <code>$user.id</code>, <code>$user.branch.id</code>, <code>$claim.roleKey</code>, <code>$claim.appName</code>, <code>$query.q</code>, <code>$params.documentId</code>, <code>$body.x</code>, <code>$today</code>, <code>$now</code>
        </Typography>
      </Box>

      {message && (
        <Box paddingTop={2}>
          <Typography textColor="danger700">{message}</Typography>
        </Box>
      )}

      {['filtersTemplate', 'populateTemplate', 'queryTemplate', 'bodyTemplate'].map((field) => {
        const Builder = BUILDERS[field];
        const hasBuilder = Boolean(Builder);
        const showRaw = !hasBuilder || showRawByField[field];
        const parsedValue = (() => { try { return JSON.parse(templates[field] || '{}'); } catch { return {}; } })();
        return (
          <Box key={field} paddingTop={3}>
            <Flex justifyContent="space-between" alignItems="center">
              <Typography variant="sigma">{field}</Typography>
              {hasBuilder && (
                <Button variant="tertiary" onClick={() => toggleRaw(field)}>
                  {showRaw ? 'Use visual builder' : 'Show raw JSON'}
                </Button>
              )}
            </Flex>
            <Flex gap={2} alignItems="flex-start" wrap="wrap" paddingTop={1}>
              <Box style={{ flex: '1 1 360px', minWidth: 300 }}>
                {showRaw ? (
                  <Textarea name={field} value={templates[field]}
                    onChange={(e) => setTemplates((t) => ({ ...t, [field]: e.target.value }))} />
                ) : (
                  <Builder
                    value={parsedValue}
                    onChange={(nextObj) => setTemplates((t) => ({ ...t, [field]: JSON.stringify(nextObj || {}, null, 2) }))}
                  />
                )}
              </Box>
              <Box style={{ flex: '1 1 360px', minWidth: 300 }}>
                <Typography variant="pi" textColor="neutral500">Resolved (sample context)</Typography>
                <pre style={{ background: '#f4f4f8', padding: 8, borderRadius: 4, fontSize: 11, margin: 0 }}>
                  {JSON.stringify(previews[field], null, 2)}
                </pre>
              </Box>
            </Flex>
          </Box>
        );
      })}
    </Box>
  );
};

// ── Browse tab ────────────────────────────────────────────────────────────
const Browse = ({ interfaces, roles }) => {
  const { get } = useFetchClient();
  const [interfaceKey, setInterfaceKey] = React.useState('');
  const [methodName, setMethodName] = React.useState('');
  const [roleKey, setRoleKey] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [policies, setPolicies] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [editing, setEditing] = React.useState(null); // { interfaceKey, methodName, roleKey }

  const currentInterface = interfaces.find((i) => i.key === interfaceKey);
  const methodOptions = (currentInterface?.methods || []).map((m) => m.name);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (interfaceKey) params.set('interfaceKey', interfaceKey);
      if (methodName) params.set('methodKey', methodName);
      if (roleKey) params.set('roleKey', roleKey);
      const { data } = await get(api(`/policies?${params.toString()}`));
      setPolicies(data?.data || []);
    } catch {
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  }, [get, interfaceKey, methodName, roleKey]);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { setPage(1); }, [interfaceKey, methodName, roleKey, search]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return policies;
    return policies.filter((p) =>
      (p.roleKey || '').toLowerCase().includes(q) ||
      (p.key || '').toLowerCase().includes(q) ||
      (p.name || '').toLowerCase().includes(q)
    );
  }, [policies, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Parse method name out of composite key `${interfaceKey}:${methodName}`
  const methodNameOf = (p) => {
    const k = p.interfaceMethod?.key || '';
    const colon = k.indexOf(':');
    return colon > 0 ? k.slice(colon + 1) : p.interfaceMethod?.name || '';
  };
  const interfaceKeyOf = (p) => {
    const k = p.interfaceMethod?.key || '';
    const colon = k.indexOf(':');
    return colon > 0 ? k.slice(0, colon) : '';
  };

  const summarize = (obj) => {
    if (!obj || typeof obj !== 'object') return '';
    const keys = Object.keys(obj);
    if (keys.length === 0) return '(empty)';
    return keys.slice(0, 3).join(', ') + (keys.length > 3 ? `, +${keys.length - 3}` : '');
  };

  const openEditor = (p) =>
    setEditing({ interfaceKey: interfaceKeyOf(p), methodName: methodNameOf(p), roleKey: p.roleKey });

  const closeEditor = (refresh) => {
    setEditing(null);
    if (refresh) load();
  };

  return (
    <Box paddingTop={4}>
      <Flex gap={3} wrap="wrap" alignItems="flex-end">
        <Box style={{ flex: '1 1 200px', minWidth: 180 }}>
          <SingleSelect label="Interface" value={interfaceKey} onChange={setInterfaceKey}
            placeholder="All interfaces" onClear={() => setInterfaceKey('')}>
            {interfaces.map((i) => (
              <SingleSelectOption key={i.id} value={i.key}>{i.key}</SingleSelectOption>
            ))}
          </SingleSelect>
        </Box>
        <Box style={{ flex: '1 1 200px', minWidth: 180 }}>
          <SingleSelect label="Method" value={methodName} onChange={setMethodName}
            placeholder="All methods" disabled={!currentInterface}
            onClear={() => setMethodName('')}>
            {methodOptions.map((m) => (
              <SingleSelectOption key={m} value={m}>{m}</SingleSelectOption>
            ))}
          </SingleSelect>
        </Box>
        <Box style={{ flex: '1 1 200px', minWidth: 180 }}>
          <SingleSelect label="Role" value={roleKey} onChange={setRoleKey}
            placeholder="All roles" onClear={() => setRoleKey('')}>
            {roles.map((r) => (
              <SingleSelectOption key={r.id} value={r.key}>{r.key}</SingleSelectOption>
            ))}
          </SingleSelect>
        </Box>
        <Box style={{ flex: '1 1 200px' }}>
          <TextInput label="Search" placeholder="role, key or name"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </Box>
        <Typography variant="pi" textColor="neutral500">
          {filtered.length} match{filtered.length === 1 ? '' : 'es'}
        </Typography>
      </Flex>

      <Box paddingTop={3}>
        {editing && (
          <InlineEditor
            interfaces={interfaces}
            roles={roles}
            selection={editing}
            onSaved={() => closeEditor(true)}
            onCancel={() => closeEditor(false)}
          />
        )}

        {loading && <Typography textColor="neutral500">Loading…</Typography>}

        {!loading && paged.length === 0 && (
          <Typography variant="pi" textColor="neutral500">
            {policies.length === 0
              ? 'No policies match the current filters. Run "Re-seed from api-provider" on Domains & Roles to import defaults.'
              : 'No policies match the search.'}
          </Typography>
        )}

        {!loading && paged.map((p) => {
          const ik = interfaceKeyOf(p);
          const mn = methodNameOf(p);
          const isOpen = editing && editing.interfaceKey === ik && editing.methodName === mn && editing.roleKey === p.roleKey;
          if (isOpen) return null;
          return (
            <Flex key={p.id} justifyContent="space-between" alignItems="center" padding={2}
              style={{ border: '1px solid #e0e0e0', borderRadius: 8, marginBottom: 6 }}
            >
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Flex gap={2} alignItems="center" wrap="wrap">
                  <Typography variant="sigma">{p.roleKey}</Typography>
                  <span style={{ padding: '1px 6px', background: '#e8eaf6', borderRadius: 8, fontSize: 10 }}>
                    {ik}
                  </span>
                  <span style={{ padding: '1px 6px', background: '#fff3e0', borderRadius: 8, fontSize: 10 }}>
                    {mn}
                  </span>
                </Flex>
                <Typography variant="pi" textColor="neutral500">
                  filters: {summarize(p.filtersTemplate)} · populate: {summarize(p.populateTemplate)} ·{' '}
                  body: {summarize(p.bodyTemplate)} · query: {summarize(p.queryTemplate)}
                </Typography>
              </Box>
              <Button variant="tertiary" onClick={() => openEditor(p)}>Edit</Button>
            </Flex>
          );
        })}
      </Box>

      {totalPages > 1 && (
        <Flex justifyContent="space-between" alignItems="center" paddingTop={2}>
          <Button variant="secondary" disabled={safePage <= 1}
            onClick={() => setPage((x) => Math.max(1, x - 1))}>Prev</Button>
          <Typography variant="pi">Page {safePage} / {totalPages}</Typography>
          <Button variant="secondary" disabled={safePage >= totalPages}
            onClick={() => setPage((x) => Math.min(totalPages, x + 1))}>Next</Button>
        </Flex>
      )}
    </Box>
  );
};

// ── Comparative tab ───────────────────────────────────────────────────────
const Comparative = ({ interfaces, roles }) => {
  const { get } = useFetchClient();
  const [interfaceKey, setInterfaceKey] = React.useState('');
  const [methodName, setMethodName] = React.useState('');
  const [selectedRoleKeys, setSelectedRoleKeys] = React.useState([]);
  const [policiesByRole, setPoliciesByRole] = React.useState({});
  const [roleSearch, setRoleSearch] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const currentInterface = interfaces.find((i) => i.key === interfaceKey);
  const methodOptions = (currentInterface?.methods || []).map((m) => m.name);

  React.useEffect(() => {
    if (currentInterface && !methodOptions.includes(methodName)) setMethodName('');
  }, [currentInterface, methodOptions, methodName]);

  const load = React.useCallback(async () => {
    if (!interfaceKey || !methodName || selectedRoleKeys.length === 0) {
      setPoliciesByRole({});
      return;
    }
    setLoading(true);
    const out = {};
    await Promise.all(
      selectedRoleKeys.map(async (rk) => {
        try {
          const { data } = await get(api(`/policies/${interfaceKey}/${methodName}/${rk}`));
          out[rk] = data?.data || null;
        } catch { out[rk] = null; }
      })
    );
    setPoliciesByRole(out);
    setLoading(false);
  }, [get, interfaceKey, methodName, selectedRoleKeys]);

  React.useEffect(() => { load(); }, [load]);

  const filteredRoleOptions = React.useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    return roles.filter((r) => !q || (r.key || '').toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q));
  }, [roles, roleSearch]);

  const toggleRole = (key) => {
    setSelectedRoleKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= 6) return prev; // hard cap to keep view usable
      return [...prev, key];
    });
  };

  return (
    <Box paddingTop={4}>
      <Flex gap={3} wrap="wrap" alignItems="flex-end">
        <Box style={{ flex: '1 1 200px', minWidth: 180 }}>
          <SingleSelect label="Interface" value={interfaceKey} onChange={setInterfaceKey} placeholder="Choose">
            {interfaces.map((i) => <SingleSelectOption key={i.id} value={i.key}>{i.key}</SingleSelectOption>)}
          </SingleSelect>
        </Box>
        <Box style={{ flex: '1 1 200px', minWidth: 180 }}>
          <SingleSelect label="Method" value={methodName} onChange={setMethodName}
            placeholder="Choose" disabled={!currentInterface}>
            {methodOptions.map((m) => <SingleSelectOption key={m} value={m}>{m}</SingleSelectOption>)}
          </SingleSelect>
        </Box>
        <Box style={{ flex: '1 1 220px' }}>
          <TextInput label="Filter roles" placeholder="key or name"
            value={roleSearch} onChange={(e) => setRoleSearch(e.target.value)} />
        </Box>
      </Flex>

      <Box paddingTop={3}>
        <Typography variant="pi" textColor="neutral600">
          Pick up to 6 roles to compare side-by-side · {selectedRoleKeys.length} / 6 selected
        </Typography>
        <Flex gap={1} wrap="wrap" paddingTop={1} style={{ maxHeight: 100, overflowY: 'auto' }}>
          {filteredRoleOptions.map((r) => {
            const checked = selectedRoleKeys.includes(r.key);
            const disabled = !checked && selectedRoleKeys.length >= 6;
            return (
              <label key={r.id} style={{ cursor: disabled ? 'not-allowed' : 'pointer',
                padding: '2px 8px', border: '1px solid #ccc', borderRadius: 12,
                background: checked ? '#e8eaf6' : 'transparent', fontSize: 11, opacity: disabled ? 0.5 : 1 }}>
                <input type="checkbox" checked={checked} disabled={disabled}
                  onChange={() => toggleRole(r.key)} style={{ marginRight: 4 }} />
                {r.key}
              </label>
            );
          })}
        </Flex>
      </Box>

      {loading && <Typography textColor="neutral500" paddingTop={2}>Loading…</Typography>}

      {interfaceKey && methodName && selectedRoleKeys.length > 0 && !loading && (
        <Flex gap={3} paddingTop={3} alignItems="flex-start" style={{ overflowX: 'auto' }}>
          {selectedRoleKeys.map((rk) => {
            const p = policiesByRole[rk];
            return (
              <Box key={rk} style={{ flex: '0 0 280px', border: '1px solid #e0e0e0',
                borderRadius: 8, padding: 12, background: p ? 'transparent' : '#fafafa' }}>
                <Typography variant="sigma">{rk}</Typography>
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

// ── Page shell ────────────────────────────────────────────────────────────
const Policies = () => {
  const { get } = useFetchClient();
  const [tab, setTab] = React.useState('browse');
  const [interfaces, setInterfaces] = React.useState([]);
  const [roles, setRoles] = React.useState([]);

  React.useEffect(() => {
    (async () => {
      try {
        const [i, r] = await Promise.all([get(api('/interfaces')), get(api('/roles'))]);
        setInterfaces(i?.data?.data || []);
        setRoles(r?.data?.data || []);
      } catch { /* surfaced inside the tab */ }
    })();
  }, [get]);

  return (
    <Box>
      <Typography variant="beta">Method Policies</Typography>
      <Typography variant="omega" textColor="neutral600">
        {interfaces.length} interface(s) · {roles.length} role(s) available
      </Typography>
      <Flex gap={2} paddingTop={2}>
        <Button variant={tab === 'browse' ? 'default' : 'secondary'} onClick={() => setTab('browse')}>
          Browse & Edit
        </Button>
        <Button variant={tab === 'comparative' ? 'default' : 'secondary'} onClick={() => setTab('comparative')}>
          Comparative
        </Button>
      </Flex>

      {tab === 'browse'
        ? <Browse interfaces={interfaces} roles={roles} />
        : <Comparative interfaces={interfaces} roles={roles} />
      }
    </Box>
  );
};

export default Policies;
