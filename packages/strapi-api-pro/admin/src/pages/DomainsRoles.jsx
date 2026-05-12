import React from 'react';
import {
  Box,
  Typography,
  Button,
  Flex,
  TextInput,
  Textarea,
} from '@strapi/design-system';
import { useFetchClient } from '@strapi/strapi/admin';

const api = (p) => `/api-pro${p}`;

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

  React.useEffect(() => {
    load();
  }, [load]);

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

  const rolesByDomain = React.useMemo(() => {
    const map = new Map();
    map.set('__none__', { label: 'Unassigned', roles: [] });
    for (const d of domains) {
      map.set(String(d.id), { label: `${d.key} — ${d.name}`, roles: [] });
    }
    for (const r of roles) {
      const ds = Array.isArray(r.appDomains) ? r.appDomains : [];
      if (ds.length === 0) {
        map.get('__none__').roles.push(r);
      } else {
        for (const d of ds) {
          const k = String(d.id);
          if (map.has(k)) map.get(k).roles.push(r);
        }
      }
    }
    return Array.from(map.entries());
  }, [domains, roles]);

  return (
    <Box>
      <Typography variant="beta">App Domains & Roles</Typography>
      {message && (
        <Box paddingTop={2}>
          <Typography textColor="danger700">{message}</Typography>
        </Box>
      )}

      <Flex gap={6} alignItems="flex-start" wrap="wrap" paddingTop={4}>
        {/* ── Domains column ────────────────────────────────────────── */}
        <Box style={{ flex: '1 1 320px', minWidth: 280 }}>
          <Typography variant="delta">Domains</Typography>

          <Box paddingTop={3} style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 12 }}>
            <Typography variant="sigma">
              {editingDomainId ? `Edit domain #${editingDomainId}` : 'New domain'}
            </Typography>
            <Box paddingTop={2}>
              <TextInput
                label="Key"
                placeholder="e.g. web-authenticated"
                value={draftDomain.key}
                onChange={(e) => setDraftDomain({ ...draftDomain, key: e.target.value })}
              />
            </Box>
            <Box paddingTop={2}>
              <TextInput
                label="Name"
                value={draftDomain.name}
                onChange={(e) => setDraftDomain({ ...draftDomain, name: e.target.value })}
              />
            </Box>
            <Box paddingTop={2}>
              <Textarea
                label="Description"
                value={draftDomain.description}
                onChange={(e) => setDraftDomain({ ...draftDomain, description: e.target.value })}
              />
            </Box>
            <Flex gap={2} paddingTop={3}>
              <Button onClick={saveDomain} loading={loading}>
                {editingDomainId ? 'Update' : 'Create'}
              </Button>
              {editingDomainId && (
                <Button
                  variant="tertiary"
                  onClick={() => {
                    setEditingDomainId(null);
                    setDraftDomain(blankDomain);
                  }}
                >
                  Cancel
                </Button>
              )}
            </Flex>
          </Box>

          <Box paddingTop={4}>
            {domains.map((d) => (
              <Flex
                key={d.id}
                justifyContent="space-between"
                alignItems="center"
                padding={2}
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
          <Typography variant="delta">Roles</Typography>

          <Box paddingTop={3} style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 12 }}>
            <Typography variant="sigma">
              {editingRoleId ? `Edit role #${editingRoleId}` : 'New role'}
            </Typography>
            <Flex gap={2} paddingTop={2} wrap="wrap">
              <Box style={{ flex: '1 1 200px' }}>
                <TextInput
                  label="Key"
                  placeholder="e.g. web_user"
                  value={draftRole.key}
                  onChange={(e) => setDraftRole({ ...draftRole, key: e.target.value })}
                />
              </Box>
              <Box style={{ flex: '1 1 200px' }}>
                <TextInput
                  label="Name"
                  value={draftRole.name}
                  onChange={(e) => setDraftRole({ ...draftRole, name: e.target.value })}
                />
              </Box>
              <Box style={{ flex: '1 1 200px' }}>
                <TextInput
                  label="Admin Role Code"
                  value={draftRole.adminRoleCode}
                  placeholder="(defaults to key)"
                  onChange={(e) => setDraftRole({ ...draftRole, adminRoleCode: e.target.value })}
                />
              </Box>
            </Flex>
            <Box paddingTop={2}>
              <Textarea
                label="Description"
                value={draftRole.description}
                onChange={(e) => setDraftRole({ ...draftRole, description: e.target.value })}
              />
            </Box>
            <Box paddingTop={2}>
              <Typography variant="pi" textColor="neutral600">Assign to domains</Typography>
              <Flex gap={2} wrap="wrap" paddingTop={1}>
                {domains.map((d) => {
                  const id = `role-domain-${d.id}`;
                  const checked = draftRole.appDomains.includes(String(d.id));
                  return (
                    <label
                      key={d.id}
                      htmlFor={id}
                      style={{
                        cursor: 'pointer',
                        padding: '2px 8px',
                        border: '1px solid #ccc',
                        borderRadius: 12,
                        background: checked ? '#e8eaf6' : 'transparent',
                      }}
                    >
                      <input
                        id={id}
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRoleDomain(d.id)}
                        style={{ marginRight: 4 }}
                      />
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
                <Button
                  variant="tertiary"
                  onClick={() => {
                    setEditingRoleId(null);
                    setDraftRole(blankRole);
                  }}
                >
                  Cancel
                </Button>
              )}
            </Flex>
          </Box>

          <Box paddingTop={4}>
            {rolesByDomain.map(([domainId, group]) => (
              <Box
                key={domainId}
                style={{ border: '1px solid #e0e0e0', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}
              >
                <Box style={{ padding: '6px 10px', background: '#f4f4f8' }}>
                  <Typography variant="pi" fontWeight="semiBold" textColor="neutral600">
                    {group.label} · {group.roles.length} role(s)
                  </Typography>
                </Box>
                {group.roles.map((r) => (
                  <Flex
                    key={`${domainId}-${r.id}`}
                    justifyContent="space-between"
                    alignItems="center"
                    padding={2}
                    style={{ borderTop: '1px solid #f0f0f4' }}
                  >
                    <Box>
                      <Typography variant="sigma">{r.name}</Typography>
                      <Typography variant="pi" textColor="neutral500">
                        {r.key}
                        {r.adminRoleCode && r.adminRoleCode !== r.key ? ` · admin=${r.adminRoleCode}` : ''}
                      </Typography>
                    </Box>
                    <Flex gap={1}>
                      <Button variant="tertiary" onClick={() => editRole(r)}>Edit</Button>
                      <Button variant="danger-light" onClick={() => deleteRole(r)}>Delete</Button>
                    </Flex>
                  </Flex>
                ))}
              </Box>
            ))}
          </Box>
        </Box>
      </Flex>
    </Box>
  );
};

export default DomainsRoles;
