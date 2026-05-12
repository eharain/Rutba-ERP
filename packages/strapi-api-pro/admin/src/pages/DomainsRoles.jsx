import React from 'react';
import {
  Box,
  Typography,
  Button,
  Flex,
  TextInput,
  Textarea,
  SingleSelect,
  SingleSelectOption,
} from '@strapi/design-system';
import { useFetchClient } from '@strapi/strapi/admin';

const api = (p) => `/api-pro${p}`;
const PAGE_SIZE = 25;

const blankDomain = { key: '', name: '', description: '' };
const blankRole = { key: '', name: '', description: '', adminRoleCode: '', appDomains: [] };

const DomainsRoles = () => {
  const { get, post, put, del } = useFetchClient();

  const [domains, setDomains] = React.useState([]);
  const [roles, setRoles] = React.useState([]);
  const [draftDomain, setDraftDomain] = React.useState(blankDomain);
  const [draftRole, setDraftRole] = React.useState(blankRole);
  const [editingDomainId, setEditingDomainId] = React.useState(null);
  const [editingRoleId, setEditingRoleId] = React.useState(null);
  const [message, setMessage] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  // Role list filters / pagination
  const [roleSearch, setRoleSearch] = React.useState('');
  const [roleDomainFilter, setRoleDomainFilter] = React.useState('');
  const [rolePage, setRolePage] = React.useState(1);

  // Seed state
  const [seeding, setSeeding] = React.useState(false);
  const [seedResult, setSeedResult] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [d, r] = await Promise.all([get(api('/domains')), get(api('/roles'))]);
      setDomains(d?.data?.data || []);
      setRoles(r?.data?.data || []);
    } catch {
      setMessage('Failed to load domains/roles.');
    } finally {
      setLoading(false);
    }
  }, [get]);

  React.useEffect(() => { load(); }, [load]);

  const runSeed = async () => {
    if (!window.confirm('Re-seed domains, roles, interfaces, methods and policies from @rutba/api-provider? This is idempotent — existing rows are updated by key, no data is destroyed.')) return;
    setSeeding(true);
    setSeedResult(null);
    setMessage('');
    try {
      const { data } = await post(api('/admin/seed'), {});
      setSeedResult(data?.data || null);
      await load();
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || 'Seed failed.');
    } finally {
      setSeeding(false);
    }
  };

  const saveDomain = async () => {
    if (!draftDomain.key || !draftDomain.name) {
      setMessage('Domain key and name are required.');
      return;
    }
    try {
      if (editingDomainId) {
        await put(api(`/domains/${editingDomainId}`), draftDomain);
      } else {
        await post(api('/domains'), draftDomain);
      }
      setDraftDomain(blankDomain);
      setEditingDomainId(null);
      setMessage('');
      await load();
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || 'Failed to save domain.');
    }
  };

  const editDomain = (d) => {
    setEditingDomainId(d.id);
    setDraftDomain({ key: d.key, name: d.name, description: d.description || '' });
  };

  const deleteDomain = async (d) => {
    const roleCount = (d.appRoles || []).length;
    const ok = window.confirm(
      roleCount > 0
        ? `Delete domain '${d.key}'? ${roleCount} role(s) still reference it.`
        : `Delete domain '${d.key}'?`
    );
    if (!ok) return;
    try {
      await del(api(`/domains/${d.id}`));
      await load();
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || 'Failed to delete domain.');
    }
  };

  const saveRole = async () => {
    if (!draftRole.key || !draftRole.name) {
      setMessage('Role key and name are required.');
      return;
    }
    try {
      const payload = { ...draftRole, appDomains: draftRole.appDomains.map(Number) };
      if (editingRoleId) {
        await put(api(`/roles/${editingRoleId}`), payload);
      } else {
        await post(api('/roles'), payload);
      }
      setDraftRole(blankRole);
      setEditingRoleId(null);
      setMessage('');
      await load();
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || 'Failed to save role.');
    }
  };

  const editRole = (r) => {
    setEditingRoleId(r.id);
    setDraftRole({
      key: r.key,
      name: r.name,
      description: r.description || '',
      adminRoleCode: r.adminRoleCode || '',
      appDomains: (r.appDomains || []).map((d) => String(d.id)),
    });
  };

  const deleteRole = async (r) => {
    if (!window.confirm(`Delete role '${r.key}'?`)) return;
    try {
      await del(api(`/roles/${r.id}`));
      await load();
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || 'Failed to delete role.');
    }
  };

  const toggleRoleDomain = (domainId) => {
    const id = String(domainId);
    setDraftRole((prev) => ({
      ...prev,
      appDomains: prev.appDomains.includes(id)
        ? prev.appDomains.filter((d) => d !== id)
        : [...prev.appDomains, id],
    }));
  };

  // Filtered + paginated roles
  const filteredRoles = React.useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    return roles.filter((r) => {
      if (q) {
        const inText = (r.key || '').toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q);
        if (!inText) return false;
      }
      if (roleDomainFilter) {
        const has = (r.appDomains || []).some((d) => String(d.id) === roleDomainFilter);
        if (!has) return false;
      }
      return true;
    });
  }, [roles, roleSearch, roleDomainFilter]);

  React.useEffect(() => { setRolePage(1); }, [roleSearch, roleDomainFilter]);

  const totalRolePages = Math.max(1, Math.ceil(filteredRoles.length / PAGE_SIZE));
  const safeRolePage = Math.min(rolePage, totalRolePages);
  const pagedRoles = filteredRoles.slice((safeRolePage - 1) * PAGE_SIZE, safeRolePage * PAGE_SIZE);

  return (
    <Box>
      <Flex justifyContent="space-between" alignItems="center" wrap="wrap" gap={2}>
        <Box>
          <Typography variant="beta">App Domains & Roles</Typography>
          <Typography variant="omega" textColor="neutral600">
            {domains.length} domain(s) · {roles.length} role(s) total
          </Typography>
        </Box>
        <Flex gap={2}>
          <Button variant="secondary" onClick={load} disabled={loading}>Refresh</Button>
          <Button onClick={runSeed} loading={seeding}>Re-seed from api-provider</Button>
        </Flex>
      </Flex>

      {seedResult && (
        <Box paddingTop={2}>
          <Typography variant="pi" textColor="success700">
            Seed OK — domains={seedResult.domains}, roles={seedResult.roles}, interfaces={seedResult.interfaces},
            methods={seedResult.methods}, policies={seedResult.policies} (scanned {seedResult.descriptorsScanned} descriptors)
          </Typography>
        </Box>
      )}

      {message && (
        <Box paddingTop={2}>
          <Typography textColor="danger700">{message}</Typography>
        </Box>
      )}

      <Flex gap={6} alignItems="flex-start" wrap="wrap" paddingTop={4}>
        {/* ── Domains column ────────────────────────────────────────── */}
        <Box style={{ flex: '1 1 320px', minWidth: 280 }}>
          <Typography variant="delta">Domains ({domains.length})</Typography>

          <Box paddingTop={3} style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 12 }}>
            <Typography variant="sigma">
              {editingDomainId ? `Edit domain #${editingDomainId}` : 'New domain'}
            </Typography>
            <Box paddingTop={2}>
              <TextInput label="Key" placeholder="e.g. web-authenticated" value={draftDomain.key}
                onChange={(e) => setDraftDomain({ ...draftDomain, key: e.target.value })} />
            </Box>
            <Box paddingTop={2}>
              <TextInput label="Name" value={draftDomain.name}
                onChange={(e) => setDraftDomain({ ...draftDomain, name: e.target.value })} />
            </Box>
            <Box paddingTop={2}>
              <Textarea label="Description" value={draftDomain.description}
                onChange={(e) => setDraftDomain({ ...draftDomain, description: e.target.value })} />
            </Box>
            <Flex gap={2} paddingTop={3}>
              <Button onClick={saveDomain} loading={loading}>
                {editingDomainId ? 'Update' : 'Create'}
              </Button>
              {editingDomainId && (
                <Button variant="tertiary" onClick={() => { setEditingDomainId(null); setDraftDomain(blankDomain); }}>
                  Cancel
                </Button>
              )}
            </Flex>
          </Box>

          <Box paddingTop={4} style={{ maxHeight: 480, overflowY: 'auto' }}>
            {domains.map((d) => (
              <Flex key={d.id} justifyContent="space-between" alignItems="center" padding={2}
                style={{ border: '1px solid #e0e0e0', borderRadius: 8, marginBottom: 6 }}
              >
                <Box>
                  <Typography variant="sigma">{d.name}</Typography>
                  <Typography variant="pi" textColor="neutral500">
                    {d.key} · {(d.appRoles || []).length} role(s)
                  </Typography>
                </Box>
                <Flex gap={1}>
                  <Button variant="tertiary" onClick={() => editDomain(d)}>Edit</Button>
                  <Button variant="danger-light" onClick={() => deleteDomain(d)}>Delete</Button>
                </Flex>
              </Flex>
            ))}
          </Box>
        </Box>

        {/* ── Roles column ──────────────────────────────────────────── */}
        <Box style={{ flex: '2 1 480px', minWidth: 360 }}>
          <Typography variant="delta">Roles ({roles.length})</Typography>

          <Box paddingTop={3} style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 12 }}>
            <Typography variant="sigma">
              {editingRoleId ? `Edit role #${editingRoleId}` : 'New role'}
            </Typography>
            <Flex gap={2} paddingTop={2} wrap="wrap">
              <Box style={{ flex: '1 1 180px' }}>
                <TextInput label="Key" placeholder="e.g. accountant" value={draftRole.key}
                  onChange={(e) => setDraftRole({ ...draftRole, key: e.target.value })} />
              </Box>
              <Box style={{ flex: '1 1 180px' }}>
                <TextInput label="Name" value={draftRole.name}
                  onChange={(e) => setDraftRole({ ...draftRole, name: e.target.value })} />
              </Box>
              <Box style={{ flex: '1 1 180px' }}>
                <TextInput label="Admin Role Code" value={draftRole.adminRoleCode}
                  placeholder="(defaults to key)"
                  onChange={(e) => setDraftRole({ ...draftRole, adminRoleCode: e.target.value })} />
              </Box>
            </Flex>
            <Box paddingTop={2}>
              <Textarea label="Description" value={draftRole.description}
                onChange={(e) => setDraftRole({ ...draftRole, description: e.target.value })} />
            </Box>
            <Box paddingTop={2}>
              <Typography variant="pi" textColor="neutral600">Assign to domains</Typography>
              <Flex gap={2} wrap="wrap" paddingTop={1} style={{ maxHeight: 100, overflowY: 'auto' }}>
                {domains.map((d) => {
                  const id = `role-domain-${d.id}`;
                  const checked = draftRole.appDomains.includes(String(d.id));
                  return (
                    <label key={d.id} htmlFor={id}
                      style={{ cursor: 'pointer', padding: '2px 8px', border: '1px solid #ccc',
                        borderRadius: 12, background: checked ? '#e8eaf6' : 'transparent', fontSize: 11 }}
                    >
                      <input id={id} type="checkbox" checked={checked}
                        onChange={() => toggleRoleDomain(d.id)} style={{ marginRight: 4 }} />
                      {d.key}
                    </label>
                  );
                })}
              </Flex>
            </Box>
            <Flex gap={2} paddingTop={3}>
              <Button onClick={saveRole} loading={loading}>
                {editingRoleId ? 'Update' : 'Create'}
              </Button>
              {editingRoleId && (
                <Button variant="tertiary" onClick={() => { setEditingRoleId(null); setDraftRole(blankRole); }}>
                  Cancel
                </Button>
              )}
            </Flex>
          </Box>

          {/* ── filters ─────────────────────────────────────────── */}
          <Flex gap={3} paddingTop={4} wrap="wrap" alignItems="flex-end">
            <Box style={{ flex: '1 1 220px' }}>
              <TextInput label="Search roles" placeholder="key or name"
                value={roleSearch}
                onChange={(e) => setRoleSearch(e.target.value)} />
            </Box>
            <Box style={{ flex: '1 1 200px' }}>
              <SingleSelect label="Filter by domain" placeholder="All domains"
                value={roleDomainFilter}
                onChange={(v) => setRoleDomainFilter(v || '')}
                onClear={() => setRoleDomainFilter('')}
              >
                {domains.map((d) => (
                  <SingleSelectOption key={d.id} value={String(d.id)}>
                    {d.key}
                  </SingleSelectOption>
                ))}
              </SingleSelect>
            </Box>
            <Typography variant="pi" textColor="neutral500">
              {filteredRoles.length} of {roles.length}
            </Typography>
          </Flex>

          <Box paddingTop={2} style={{ maxHeight: 480, overflowY: 'auto' }}>
            {pagedRoles.length === 0 && (
              <Typography variant="pi" textColor="neutral500" paddingTop={2}>
                No roles match the current filters.
              </Typography>
            )}
            {pagedRoles.map((r) => (
              <Flex key={r.id} justifyContent="space-between" alignItems="center" padding={2}
                style={{ border: '1px solid #e0e0e0', borderRadius: 8, marginBottom: 6 }}
              >
                <Box style={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="sigma">{r.name}</Typography>
                  <Typography variant="pi" textColor="neutral500">
                    {r.key}
                    {r.adminRoleCode && r.adminRoleCode !== r.key ? ` · admin=${r.adminRoleCode}` : ''}
                  </Typography>
                  <Flex gap={1} paddingTop={1} wrap="wrap">
                    {(r.appDomains || []).map((d) => (
                      <span key={d.id}
                        style={{ background: '#f0f0f4', color: '#666', padding: '1px 6px',
                          borderRadius: 8, fontSize: 10 }}>
                        {d.key}
                      </span>
                    ))}
                  </Flex>
                </Box>
                <Flex gap={1}>
                  <Button variant="tertiary" onClick={() => editRole(r)}>Edit</Button>
                  <Button variant="danger-light" onClick={() => deleteRole(r)}>Delete</Button>
                </Flex>
              </Flex>
            ))}
          </Box>

          <Flex justifyContent="space-between" alignItems="center" paddingTop={2}>
            <Button variant="secondary" disabled={safeRolePage <= 1}
              onClick={() => setRolePage((p) => Math.max(1, p - 1))}>Prev</Button>
            <Typography variant="pi">
              Page {safeRolePage} / {totalRolePages}
            </Typography>
            <Button variant="secondary" disabled={safeRolePage >= totalRolePages}
              onClick={() => setRolePage((p) => Math.min(totalRolePages, p + 1))}>Next</Button>
          </Flex>
        </Box>
      </Flex>
    </Box>
  );
};

export default DomainsRoles;
