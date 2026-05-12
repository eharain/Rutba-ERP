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

const api = (p) => `/api-pro${p}`;

// ── Sample context for live $-token preview ───────────────────────────────
const SAMPLE_CONTEXT = {
  user: { id: 9, email: 'user@example.com', branch: { id: 2 }, hr_employee: { documentId: 'abc' } },
  claim: { appName: 'pos-desk', roleKey: 'pos_desk_cashier', domainKey: 'pos-desk' },
  query: { q: 'shoes' },
  params: { documentId: 'abc123' },
  body: { name: 'Sample', price: 199 },
  strapi: { request: { method: 'GET', path: '/api/products' } },
};

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

const BUILDERS = {
  filtersTemplate: FiltersBuilder,
  populateTemplate: PopulateBuilder,
  bodyTemplate: KeyValueEditor,
  queryTemplate: KeyValueEditor,
};
const TEMPLATE_FIELDS = ['filtersTemplate', 'populateTemplate', 'queryTemplate', 'bodyTemplate'];
const TEMPLATE_LABELS = {
  filtersTemplate: 'Filters',
  populateTemplate: 'Populate',
  queryTemplate: 'Query (sort/fields/pagination)',
  bodyTemplate: 'Body (force / overwrite)',
};

function emptyPolicy() {
  return {
    filtersTemplate: {},
    populateTemplate: {},
    bodyTemplate: {},
    queryTemplate: {},
    resolverMode: 'strict',
  };
}

// ── Interface → Method tree (Browse) ──────────────────────────────────────
const BrowseTree = ({ interfaces, roleCount, onOpenMethod }) => {
  const [search, setSearch] = React.useState('');
  const [collapsed, setCollapsed] = React.useState({});

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return interfaces;
    return interfaces.filter((i) =>
      (i.key || '').toLowerCase().includes(q) ||
      (i.name || '').toLowerCase().includes(q) ||
      (i.uid || '').toLowerCase().includes(q) ||
      (Array.isArray(i.methods) && i.methods.some((m) => (m.name || '').toLowerCase().includes(q)))
    );
  }, [interfaces, search]);

  const toggle = (key) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  const expandAll = () => setCollapsed({});
  const collapseAll = () => {
    const all = {};
    for (const i of filtered) all[i.key] = true;
    setCollapsed(all);
  };

  return (
    <Box>
      <Flex justifyContent="space-between" alignItems="flex-end" wrap="wrap" gap={2} paddingTop={3}>
        <Box style={{ flex: '1 1 300px' }}>
          <TextInput label="Search interfaces / methods"
            placeholder="key, uid, or method name (e.g. cash, findOne)"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </Box>
        <Flex gap={2}>
          <Button variant="tertiary" onClick={expandAll}>Expand all</Button>
          <Button variant="tertiary" onClick={collapseAll}>Collapse all</Button>
        </Flex>
      </Flex>

      {filtered.length === 0 && (
        <Box paddingTop={3}>
          <Typography variant="pi" textColor="neutral500">
            {interfaces.length === 0
              ? 'No interfaces yet — run "Re-seed from api-provider" on Domains & Roles to import defaults.'
              : 'No interfaces match the search.'}
          </Typography>
        </Box>
      )}

      <Box paddingTop={3}>
        {filtered.map((iface) => {
          const methods = Array.isArray(iface.methods) ? iface.methods : [];
          const isCollapsed = collapsed[iface.key];
          return (
            <Box key={iface.key} style={{
              border: '1px solid #e0e0e0', borderRadius: 8, marginBottom: 8, overflow: 'hidden',
            }}>
              <Flex justifyContent="space-between" alignItems="center"
                style={{ cursor: 'pointer', padding: '8px 12px', background: '#f4f4f8' }}
                onClick={() => toggle(iface.key)}>
                <Box style={{ minWidth: 0, flex: 1 }}>
                  <Flex gap={2} alignItems="center">
                    <Typography variant="sigma">{iface.name}</Typography>
                    <code style={{ fontSize: 10, color: '#666' }}>{iface.uid}</code>
                  </Flex>
                  <Typography variant="pi" textColor="neutral500">
                    {iface.key} · {methods.length} method{methods.length === 1 ? '' : 's'}
                  </Typography>
                </Box>
                <Typography variant="pi">{isCollapsed ? '▶' : '▼'}</Typography>
              </Flex>
              {!isCollapsed && methods.map((m) => (
                <Flex key={m.id} justifyContent="space-between" alignItems="center"
                  style={{ padding: '6px 12px', borderTop: '1px solid #f0f0f4' }}>
                  <Flex gap={2} alignItems="center" style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ padding: '1px 6px', border: '1px solid #ccc',
                      borderRadius: 4, fontSize: 10, fontWeight: 700,
                      fontFamily: 'ui-monospace, Menlo, monospace' }}>
                      {(m.method || 'GET').toUpperCase()}
                    </span>
                    <Typography variant="sigma">{m.name}</Typography>
                    <span style={{ background: '#e8eaf6', color: '#4945ff',
                      padding: '0 6px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>
                      {m.action || '?'}
                    </span>
                    <Typography variant="pi" textColor="neutral500"
                      style={{ fontFamily: 'ui-monospace, Menlo, monospace', whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.path}
                    </Typography>
                  </Flex>
                  <Button variant="tertiary"
                    onClick={() => onOpenMethod({ interfaceKey: iface.key, methodName: m.name, action: m.action, path: m.path, httpMethod: m.method, interfaceName: iface.name, interfaceUid: iface.uid })}>
                    Edit policies →
                  </Button>
                </Flex>
              ))}
              {!isCollapsed && methods.length === 0 && (
                <Box padding={3}>
                  <Typography variant="pi" textColor="neutral500">
                    This interface has no methods yet.
                  </Typography>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      <Box paddingTop={2}>
        <Typography variant="pi" textColor="neutral500">
          {filtered.length} interface{filtered.length === 1 ? '' : 's'} ·
          {' '}{roleCount} role{roleCount === 1 ? '' : 's'} available system-wide
        </Typography>
      </Box>
    </Box>
  );
};

// ── Play modal: "act as role" preview against the real Strapi endpoint ────
const PlayModal = ({ open, selection, roleKey, method, onClose }) => {
  const { post } = useFetchClient();
  const [documentId, setDocumentId] = React.useState('');
  const [queryRaw, setQueryRaw] = React.useState('{}');
  const [bodyRaw, setBodyRaw] = React.useState('{}');
  const [actAsUserId, setActAsUserId] = React.useState('');
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!open) {
      setResult(null);
      setError('');
    }
  }, [open]);

  if (!open) return null;

  const isFind = (method?.action || '').toLowerCase() === 'find';
  const isFindOne = (method?.action || '').toLowerCase() === 'findone';
  const isMutation = !isFind && !isFindOne;

  const safeParse = (raw) => {
    if (!raw || !raw.trim()) return {};
    try { return JSON.parse(raw); } catch (e) { throw new Error(`Invalid JSON: ${e.message}`); }
  };

  const run = async () => {
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const payload = {
        interfaceKey: selection.interfaceKey,
        methodName: selection.methodName,
        roleKey,
        actAsUserId: actAsUserId ? Number(actAsUserId) : null,
        pathParams: {},
        queryParams: safeParse(queryRaw),
        bodyData: safeParse(bodyRaw),
        documentId: documentId || null,
      };
      const { data } = await post(api('/play'), payload);
      setResult(data?.data || null);
    } catch (err) {
      setError(err?.response?.data?.error?.message || err?.message || 'Play failed.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Box style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex',
      alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <Box style={{ background: '#fff', borderRadius: 8, padding: 16,
        maxWidth: 1100, width: '94%', maxHeight: '90vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}>
        <Flex justifyContent="space-between" alignItems="flex-start" gap={2}>
          <Box>
            <Typography variant="beta">Play as role</Typography>
            <Flex gap={2} alignItems="center" paddingTop={1} wrap="wrap">
              <span style={{ padding: '1px 6px', border: '1px solid #ccc',
                borderRadius: 4, fontSize: 10, fontWeight: 700,
                fontFamily: 'ui-monospace, Menlo, monospace' }}>
                {(method?.method || 'GET').toUpperCase()}
              </span>
              <code style={{ fontSize: 12 }}>{method?.path || '?'}</code>
              <Typography variant="pi" textColor="neutral500">as</Typography>
              <code style={{ fontSize: 12, background: '#e8eaf6', color: '#4945ff',
                padding: '1px 6px', borderRadius: 4 }}>{roleKey}</code>
            </Flex>
          </Box>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </Flex>

        <Flex gap={3} paddingTop={3} wrap="wrap" alignItems="flex-end">
          {isFindOne && (
            <Box style={{ flex: '1 1 220px' }}>
              <TextInput label="documentId" value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                placeholder="required for findOne" />
            </Box>
          )}
          <Box style={{ flex: '1 1 160px' }}>
            <TextInput label="Act as user (id)" value={actAsUserId}
              onChange={(e) => setActAsUserId(e.target.value)}
              placeholder="(empty = current admin)" />
          </Box>
          <Button onClick={run} loading={running}>Run</Button>
        </Flex>

        <Flex gap={3} paddingTop={3} wrap="wrap" alignItems="flex-start">
          <Box style={{ flex: '1 1 300px' }}>
            <Typography variant="pi" fontWeight="semiBold">Query (JSON)</Typography>
            <Textarea name="query" value={queryRaw}
              onChange={(e) => setQueryRaw(e.target.value)} />
            <Typography variant="pi" textColor="neutral500">
              e.g. {`{ "pagination": { "pageSize": 5 } }`}
            </Typography>
          </Box>
          {isMutation && (
            <Box style={{ flex: '1 1 300px' }}>
              <Typography variant="pi" fontWeight="semiBold">Body (JSON)</Typography>
              <Textarea name="body" value={bodyRaw}
                onChange={(e) => setBodyRaw(e.target.value)} />
              <Typography variant="pi" textColor="neutral500">
                Mutations are NOT executed — only the resolved body is shown.
              </Typography>
            </Box>
          )}
        </Flex>

        {error && (
          <Box paddingTop={3}>
            <Typography textColor="danger700">{error}</Typography>
          </Box>
        )}

        {result && (
          <Box paddingTop={3} style={{ borderTop: '1px solid #e0e0e0', marginTop: 12 }}>
            <Flex gap={3} alignItems="flex-start" paddingTop={3} style={{ overflowX: 'auto' }}>
              <Box style={{ flex: '0 0 280px' }}>
                <Typography variant="sigma">Token context</Typography>
                <Typography variant="pi" textColor="neutral500">
                  {result.actAsUser
                    ? `as user #${result.actAsUser.id} (${result.actAsUser.email || result.actAsUser.username})`
                    : 'as current admin'}
                </Typography>
                <pre style={{ background: '#f4f4f8', padding: 8, borderRadius: 4,
                  fontSize: 11, margin: 0, marginTop: 4, maxHeight: 220, overflowY: 'auto' }}>
                  {JSON.stringify(result.tokenContext, null, 2)}
                </pre>
              </Box>
              <Box style={{ flex: '0 0 280px' }}>
                <Typography variant="sigma">Resolved templates</Typography>
                <Typography variant="pi" textColor={result.policyFound ? 'success700' : 'warning700'}>
                  {result.policyFound ? 'policy found' : 'no policy for this role'}
                </Typography>
                {['filters', 'populate', 'body', 'query'].map((k) => (
                  <Box key={k} paddingTop={1}>
                    <Typography variant="pi" fontWeight="semiBold">{k}</Typography>
                    <pre style={{ background: '#fafafa', padding: 6, borderRadius: 4,
                      fontSize: 10, margin: 0, maxHeight: 100, overflowY: 'auto' }}>
                      {JSON.stringify(result.resolved?.[k] || {}, null, 2)}
                    </pre>
                  </Box>
                ))}
              </Box>
              <Box style={{ flex: '1 1 320px', minWidth: 280 }}>
                <Typography variant="sigma">Strapi response</Typography>
                {result.executed ? (
                  <>
                    <Typography variant="pi" textColor="success700">executed</Typography>
                    <pre style={{ background: '#f4f4f8', padding: 8, borderRadius: 4,
                      fontSize: 11, margin: 0, marginTop: 4, maxHeight: 320, overflowY: 'auto' }}>
                      {JSON.stringify(result.response, null, 2)}
                    </pre>
                  </>
                ) : (
                  <Typography variant="pi" textColor="neutral500">
                    {result.executionError
                      ? `Not executed: ${result.executionError}`
                      : 'Not executed (mutation action — preview only).'}
                  </Typography>
                )}
                <Box paddingTop={2}>
                  <Typography variant="pi" fontWeight="semiBold">Final query sent to Strapi</Typography>
                  <pre style={{ background: '#fafafa', padding: 6, borderRadius: 4,
                    fontSize: 10, margin: 0, maxHeight: 140, overflowY: 'auto' }}>
                    {JSON.stringify(result.finalQuery, null, 2)}
                  </pre>
                </Box>
              </Box>
            </Flex>
          </Box>
        )}
      </Box>
    </Box>
  );
};

// ── Role column inside the Method Editor ──────────────────────────────────
const RoleColumn = ({ role, value, onChange, onRemove, sample, selection, method, onPlay }) => {
  const [rawByField, setRawByField] = React.useState({});

  const previews = React.useMemo(() => {
    const out = {};
    for (const f of TEMPLATE_FIELDS) {
      out[f] = resolveDeep(value?.[f] || {}, sample);
    }
    return out;
  }, [value, sample]);

  return (
    <Box style={{
      flex: '0 0 460px', minWidth: 420, maxWidth: 480,
      border: '1px solid #e0e0e0', borderRadius: 8, padding: 12,
      background: '#fff', maxHeight: '70vh', overflowY: 'auto',
    }}>
      <Flex justifyContent="space-between" alignItems="flex-start" paddingBottom={2}
        style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 2,
          borderBottom: '1px solid #f0f0f4' }}>
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Typography variant="sigma">{role.name || role.key}</Typography>
          <Typography variant="pi" textColor="neutral500">
            <code>{role.key}</code>
          </Typography>
          {role.appDomains?.length > 0 && (
            <Flex gap={1} paddingTop={1} wrap="wrap">
              {role.appDomains.map((d) => (
                <span key={d.id} style={{ background: '#f0f0f4', color: '#666',
                  padding: '0 6px', borderRadius: 8, fontSize: 10 }}>
                  {d.key}
                </span>
              ))}
            </Flex>
          )}
        </Box>
        <Flex gap={1}>
          {onPlay && (
            <Button variant="secondary" onClick={() => onPlay(role)} title="Play as this role">
              ▶ Play
            </Button>
          )}
          <Button variant="danger-light" onClick={onRemove} title="Remove policy for this role">
            ×
          </Button>
        </Flex>
      </Flex>

      {TEMPLATE_FIELDS.map((field) => {
        const Builder = BUILDERS[field];
        const showRaw = !!rawByField[field];
        const fieldValue = value?.[field] || {};
        return (
          <Box key={field} paddingTop={3}>
            <Flex justifyContent="space-between" alignItems="center">
              <Typography variant="pi" fontWeight="semiBold">{TEMPLATE_LABELS[field]}</Typography>
              <button type="button" onClick={() => setRawByField((s) => ({ ...s, [field]: !s[field] }))}
                style={{ border: 'none', background: 'transparent', color: '#4945ff',
                  cursor: 'pointer', fontSize: 10, padding: 0 }}>
                {showRaw ? 'visual' : 'raw JSON'}
              </button>
            </Flex>
            <Box paddingTop={1}>
              {showRaw ? (
                <Textarea name={field}
                  value={JSON.stringify(fieldValue, null, 2)}
                  onChange={(e) => {
                    try {
                      onChange({ ...value, [field]: JSON.parse(e.target.value || '{}') });
                    } catch {
                      // ignore invalid JSON while typing
                    }
                  }} />
              ) : (
                <Builder
                  value={fieldValue}
                  onChange={(next) => onChange({ ...value, [field]: next || {} })}
                />
              )}
            </Box>
            <Box paddingTop={1}>
              <Typography variant="pi" textColor="neutral500">Resolved (sample $-context)</Typography>
              <pre style={{ background: '#fafafa', padding: 6, borderRadius: 4,
                fontSize: 10, margin: 0, maxHeight: 100, overflowY: 'auto' }}>
                {JSON.stringify(previews[field], null, 2)}
              </pre>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};

// ── Method Editor (comparative role columns) ──────────────────────────────
const MethodEditor = ({ selection, onBack }) => {
  const { get, put } = useFetchClient();
  const [methodInfo, setMethodInfo] = React.useState(null);
  const [allRoles, setAllRoles] = React.useState([]);
  // Working state: { [roleKey]: { filtersTemplate, ... } | null (= delete) }
  const [policies, setPolicies] = React.useState({});
  const [initialPolicies, setInitialPolicies] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [addRoleKey, setAddRoleKey] = React.useState('');
  const [roleSearch, setRoleSearch] = React.useState('');

  const { interfaceKey, methodName } = selection;

  const load = React.useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const { data } = await get(api(`/policies/method/${interfaceKey}/${methodName}`));
      const d = data?.data || {};
      setMethodInfo(d.method || null);
      setAllRoles(d.allRoles || []);
      setPolicies(d.policies || {});
      setInitialPolicies(d.policies || {});
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || 'Failed to load method policies.');
    } finally {
      setLoading(false);
    }
  }, [get, interfaceKey, methodName]);

  React.useEffect(() => { load(); }, [load]);

  const updateRole = (roleKey, next) => {
    setPolicies((p) => ({ ...p, [roleKey]: next }));
  };

  const addRole = () => {
    if (!addRoleKey) return;
    if (policies[addRoleKey] != null) { setAddRoleKey(''); return; }
    setPolicies((p) => ({ ...p, [addRoleKey]: emptyPolicy() }));
    setAddRoleKey('');
  };

  const removeRole = (roleKey) => {
    // null in state = mark for deletion on save
    setPolicies((p) => ({ ...p, [roleKey]: null }));
  };

  const undoRemove = (roleKey) => {
    setPolicies((p) => ({ ...p, [roleKey]: initialPolicies[roleKey] || emptyPolicy() }));
  };

  const saveAll = async () => {
    setSaving(true);
    setMessage('');
    try {
      const { data } = await put(api(`/policies/method/${interfaceKey}/${methodName}`), { policies });
      const r = data?.data || {};
      setMessage(`Saved ${r.saved?.length || 0} · deleted ${r.deleted?.length || 0}` +
        (r.errors?.length ? ` · ${r.errors.length} error(s)` : ''));
      await load();
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const dirty = React.useMemo(() => {
    const ka = new Set([...Object.keys(policies), ...Object.keys(initialPolicies)]);
    for (const k of ka) {
      if (JSON.stringify(policies[k] || null) !== JSON.stringify(initialPolicies[k] || null)) return true;
    }
    return false;
  }, [policies, initialPolicies]);

  // Filter the visible role columns by search (just for visibility; doesn't affect save)
  const presentRoles = React.useMemo(() => {
    const list = [];
    for (const role of allRoles) {
      if (policies[role.key] !== undefined) list.push(role);
    }
    return list;
  }, [allRoles, policies]);

  const visibleRoles = React.useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    if (!q) return presentRoles;
    return presentRoles.filter((r) =>
      (r.key || '').toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q)
    );
  }, [presentRoles, roleSearch]);

  const addableRoles = React.useMemo(() =>
    allRoles.filter((r) => policies[r.key] == null && !initialPolicies[r.key]),
    [allRoles, policies, initialPolicies]
  );

  // Play modal state — opened from a role column
  const [playRoleKey, setPlayRoleKey] = React.useState(null);

  return (
    <Box>
      {/* Sticky header */}
      <Box style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 10,
        borderBottom: '1px solid #e0e0e0', paddingBottom: 8, marginBottom: 8 }}>
        <Flex justifyContent="space-between" alignItems="center" wrap="wrap" gap={2}>
          <Box>
            <Button variant="tertiary" onClick={onBack}>← back to browse</Button>
            <Box paddingTop={1}>
              <Flex gap={2} alignItems="center" wrap="wrap">
                <Typography variant="beta">{selection.interfaceName || interfaceKey}</Typography>
                <Typography variant="pi" textColor="neutral500">/</Typography>
                <Typography variant="sigma">{methodName}</Typography>
                {methodInfo && (
                  <>
                    <span style={{ padding: '1px 6px', border: '1px solid #ccc',
                      borderRadius: 4, fontSize: 10, fontWeight: 700,
                      fontFamily: 'ui-monospace, Menlo, monospace' }}>
                      {(methodInfo.method || 'GET').toUpperCase()}
                    </span>
                    <code style={{ fontSize: 11, color: '#666' }}>{methodInfo.path}</code>
                  </>
                )}
              </Flex>
              {selection.interfaceUid && (
                <Typography variant="pi" textColor="neutral500">
                  <code style={{ fontSize: 11 }}>{selection.interfaceUid}.{methodInfo?.action || methodName}</code>
                </Typography>
              )}
            </Box>
          </Box>
          <Flex gap={2} alignItems="center">
            {dirty && <Typography variant="pi" textColor="warning700">unsaved changes</Typography>}
            <Button variant="secondary" onClick={load} disabled={saving}>Reload</Button>
            <Button onClick={saveAll} loading={saving} disabled={!dirty}>Save All</Button>
          </Flex>
        </Flex>

        {message && (
          <Box paddingTop={2}>
            <Typography textColor={message.startsWith('Saved') ? 'success700' : 'danger700'}>
              {message}
            </Typography>
          </Box>
        )}

        <Flex gap={3} paddingTop={3} wrap="wrap" alignItems="flex-end">
          <Box style={{ flex: '0 0 260px' }}>
            <SingleSelect label="Add policy for role"
              placeholder={addableRoles.length === 0 ? 'all roles already configured' : 'pick a role…'}
              value={addRoleKey}
              onChange={(v) => setAddRoleKey(v || '')}
              onClear={() => setAddRoleKey('')}
              disabled={addableRoles.length === 0}
            >
              {addableRoles.map((r) => (
                <SingleSelectOption key={r.id} value={r.key}>{r.key}</SingleSelectOption>
              ))}
            </SingleSelect>
          </Box>
          <Button onClick={addRole} disabled={!addRoleKey}>+ Add column</Button>
          <Box style={{ flex: '0 0 260px' }}>
            <TextInput label="Filter visible columns" placeholder="role key or name"
              value={roleSearch} onChange={(e) => setRoleSearch(e.target.value)} />
          </Box>
          <Typography variant="pi" textColor="neutral500">
            {presentRoles.length} role policy column{presentRoles.length === 1 ? '' : 's'} ·
            {' '}showing {visibleRoles.length}
          </Typography>
        </Flex>
      </Box>

      {loading ? (
        <Typography textColor="neutral500">Loading…</Typography>
      ) : presentRoles.length === 0 ? (
        <Box paddingTop={4}>
          <Typography variant="pi" textColor="neutral500">
            No role policies for this method yet. Add one via the "Add policy for role" picker above.
          </Typography>
        </Box>
      ) : (
        <Flex gap={3} alignItems="flex-start" style={{ overflowX: 'auto', paddingBottom: 12 }}>
          {visibleRoles.map((role) => {
            const value = policies[role.key];
            if (value === null) {
              // Marked for deletion
              return (
                <Box key={role.key} style={{
                  flex: '0 0 280px', border: '1px dashed #d02b20', borderRadius: 8,
                  padding: 12, background: '#fcecea',
                }}>
                  <Typography variant="sigma">{role.name || role.key}</Typography>
                  <Typography variant="pi" textColor="danger700" paddingTop={1}>
                    Marked for deletion. Save All to apply.
                  </Typography>
                  <Box paddingTop={2}>
                    <Button variant="tertiary" onClick={() => undoRemove(role.key)}>Undo</Button>
                  </Box>
                </Box>
              );
            }
            return (
              <RoleColumn key={role.key}
                role={role}
                value={value}
                onChange={(next) => updateRole(role.key, next)}
                onRemove={() => removeRole(role.key)}
                onPlay={(r) => setPlayRoleKey(r.key)}
                sample={SAMPLE_CONTEXT}
                selection={selection}
                method={methodInfo}
              />
            );
          })}
        </Flex>
      )}

      <PlayModal
        open={Boolean(playRoleKey)}
        selection={selection}
        roleKey={playRoleKey}
        method={methodInfo}
        onClose={() => setPlayRoleKey(null)}
      />
    </Box>
  );
};

// ── Page shell ────────────────────────────────────────────────────────────
const Policies = ({ initialSelection, onConsumeInitialSelection }) => {
  const { get } = useFetchClient();
  const [interfaces, setInterfaces] = React.useState([]);
  const [roleCount, setRoleCount] = React.useState(0);
  const [view, setView] = React.useState('browse');
  const [selection, setSelection] = React.useState(null);

  // If another page deep-linked us with a (interface, method) selection, jump
  // into the Method Editor immediately and consume the parent prop so back-
  // navigating doesn't re-open it.
  React.useEffect(() => {
    if (initialSelection) {
      setSelection(initialSelection);
      setView('method');
      onConsumeInitialSelection?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelection]);

  React.useEffect(() => {
    (async () => {
      try {
        const [i, r] = await Promise.all([get(api('/interfaces')), get(api('/roles'))]);
        setInterfaces(i?.data?.data || []);
        setRoleCount((r?.data?.data || []).length);
      } catch { /* surfaced inside views */ }
    })();
  }, [get]);

  const openMethod = (sel) => {
    setSelection(sel);
    setView('method');
  };
  const backToBrowse = () => {
    setView('browse');
    setSelection(null);
  };

  return (
    <Box>
      {view === 'browse' ? (
        <>
          <Typography variant="beta">Method Policies</Typography>
          <Typography variant="omega" textColor="neutral600">
            Pick a method to edit its policies for all roles side-by-side.
          </Typography>
          <BrowseTree interfaces={interfaces} roleCount={roleCount} onOpenMethod={openMethod} />
        </>
      ) : (
        <MethodEditor selection={selection} onBack={backToBrowse} />
      )}
    </Box>
  );
};

export default Policies;
