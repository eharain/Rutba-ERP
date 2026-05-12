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

// ── Role column inside the Method Editor ──────────────────────────────────
const RoleColumn = ({ role, value, onChange, onRemove, sample }) => {
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
        <Box>
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
        <Button variant="danger-light" onClick={onRemove} title="Remove policy for this role">
          ×
        </Button>
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
                sample={SAMPLE_CONTEXT}
              />
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
  const [interfaces, setInterfaces] = React.useState([]);
  const [roleCount, setRoleCount] = React.useState(0);
  const [view, setView] = React.useState('browse');
  const [selection, setSelection] = React.useState(null);

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
