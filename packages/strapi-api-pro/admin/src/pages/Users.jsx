import React, { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Flex,
  TextInput,
  SingleSelect,
  SingleSelectOption,
} from '@strapi/design-system';
import { useFetchClient } from '@strapi/strapi/admin';

// The left panel previously had a SingleSelect listing every user, which gets
// unusable past a few dozen entries. We drop the dropdown and rely on the
// right-panel list (which already has search + filter + pagination + click to
// select); the left panel becomes a focused editor for the currently-selected
// user with an empty state when none is picked.

const PAGE_SIZE = 15;
const NO_UP_ROLE = '__none__';

const UsersPage = () => {
  const { get, put, post, del } = useFetchClient();
  const [users, setUsers] = useState([]);
  const [roleOptions, setRoleOptions] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [filterAppRole, setFilterAppRole] = useState('');
  const [filterUpRole, setFilterUpRole] = useState('');
  const [assignedRoleFilter, setAssignedRoleFilter] = useState('');
  const [copyFromUserId, setCopyFromUserId] = useState('');
  const [applyTemplateId, setApplyTemplateId] = useState('');
  const [newTemplateName, setNewTemplateName] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const api = (path) => `/api-pro${path}`;

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [u, r, t] = await Promise.all([
        get(api('/users')),
        get(api('/users/role-options')),
        get(api('/templates')),
      ]);
      const userData = u?.data?.data || [];
      setUsers(userData);
      setRoleOptions(r?.data?.data || []);
      setTemplates(t?.data?.data || []);

      if (selectedUserId) {
        const selected = userData.find((x) => String(x.id) === String(selectedUserId));
        setSelectedRoleIds((selected?.app_roles || []).map((ar) => String(ar.id)));
      }
    } catch {
      setMessage('Failed to load users/app roles.');
    } finally {
      setLoading(false);
    }
  }, [get, selectedUserId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const rolesByDomain = useMemo(() => {
    const map = new Map();
    roleOptions.forEach((role) => {
      const domains = Array.isArray(role.appDomains) && role.appDomains.length ? role.appDomains : null;
      if (domains) {
        domains.forEach((domain) => {
          const dk = String(domain.id);
          const label = domain.key || domain.name || `Domain #${domain.id}`;
          if (!map.has(dk)) map.set(dk, { label, roles: [] });
          map.get(dk).roles.push(role);
        });
      } else {
        if (!map.has('__none__')) map.set('__none__', { label: 'No Domain', roles: [] });
        map.get('__none__').roles.push(role);
      }
    });
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === '__none__') return 1;
      if (b === '__none__') return -1;
      return String(a).localeCompare(String(b));
    });
  }, [roleOptions]);

  const selectedSet = useMemo(() => new Set(selectedRoleIds.map(String)), [selectedRoleIds]);

  const selectedUser = useMemo(
    () => users.find((u) => String(u.id) === String(selectedUserId)) || null,
    [users, selectedUserId]
  );

  // Distinct users-permissions roles derived from loaded users — used in the
  // filter dropdown beside the App Role filter.
  const upRoleOptions = useMemo(() => {
    const map = new Map();
    users.forEach((u) => {
      if (!u.role) {
        map.set(NO_UP_ROLE, { id: NO_UP_ROLE, name: 'No Role', type: 'none' });
        return;
      }
      const id = String(u.role.id);
      if (!map.has(id)) {
        map.set(id, { id, name: u.role.name || u.role.type || `Role #${u.role.id}`, type: u.role.type || '' });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const visibleRolesByDomain = useMemo(() => {
    const q = assignedRoleFilter.trim().toLowerCase();
    if (!q) return rolesByDomain;
    return rolesByDomain
      .map(([k, group]) => [
        k,
        {
          ...group,
          roles: group.roles.filter((role) => {
            const key = (role.key || '').toLowerCase();
            const name = (role.name || '').toLowerCase();
            return key.includes(q) || name.includes(q);
          }),
        },
      ])
      .filter(([, group]) => group.roles.length > 0);
  }, [rolesByDomain, assignedRoleFilter]);

  const visibleRoleIds = useMemo(
    () => visibleRolesByDomain.flatMap(([, g]) => g.roles.map((r) => String(r.id))),
    [visibleRolesByDomain]
  );

  const visibleSelectedCount = useMemo(
    () => visibleRoleIds.filter((id) => selectedSet.has(id)).length,
    [visibleRoleIds, selectedSet]
  );

  const addFilteredRoles = () => {
    if (visibleRoleIds.length === 0) return;
    setSelectedRoleIds((prev) => Array.from(new Set([...prev.map(String), ...visibleRoleIds])));
  };

  const removeFilteredRoles = () => {
    if (visibleRoleIds.length === 0) return;
    const drop = new Set(visibleRoleIds);
    setSelectedRoleIds((prev) => prev.map(String).filter((id) => !drop.has(id)));
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (userSearch) {
        const q = userSearch.toLowerCase();
        const match =
          (u.username || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.displayName || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      if (filterAppRole) {
        const hasRole = (u.app_roles || []).some((r) => String(r.id) === filterAppRole);
        if (!hasRole) return false;
      }
      if (filterUpRole) {
        const uid = u.role ? String(u.role.id) : NO_UP_ROLE;
        if (uid !== filterUpRole) return false;
      }
      return true;
    });
  }, [users, userSearch, filterAppRole, filterUpRole]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filteredUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleRole = (roleId) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  const selectUser = (id) => {
    setSelectedUserId(id);
    const selected = users.find((u) => String(u.id) === String(id));
    setSelectedRoleIds((selected?.app_roles || []).map((r) => String(r.id)));
    setCopyFromUserId('');
    setApplyTemplateId('');
  };

  // Copy: pulls another user's currently-saved app_roles into the editor
  // selection without persisting. The admin still has to click Save to apply.
  const copyFromUser = (sourceId) => {
    setCopyFromUserId(sourceId);
    if (!sourceId) return;
    const source = users.find((u) => String(u.id) === String(sourceId));
    if (!source) return;
    const ids = (source.app_roles || []).map((r) => String(r.id));
    setSelectedRoleIds(ids);
    setMessage(
      `Copied ${ids.length} role${ids.length === 1 ? '' : 's'} from ${source.displayName || source.username || source.email}. Click Save Assignment to apply.`
    );
  };

  const applyTemplate = (templateId) => {
    setApplyTemplateId(templateId);
    if (!templateId) return;
    const tpl = templates.find((t) => String(t.id) === String(templateId));
    if (!tpl) return;
    const ids = (tpl.appRoles || []).map((r) => String(r.id));
    setSelectedRoleIds(ids);
    setMessage(
      `Loaded template "${tpl.name}" (${ids.length} role${ids.length === 1 ? '' : 's'}). Click Save Assignment to apply.`
    );
  };

  const save = async () => {
    if (!selectedUserId) return;
    setLoading(true);
    setMessage('');
    try {
      await put(api(`/users/${selectedUserId}/roles`), { roleIds: selectedRoleIds.map(Number) });
      setMessage('App roles assignment saved.');
      await load();
    } catch {
      setMessage('Failed to save app role assignment.');
    } finally {
      setLoading(false);
    }
  };

  const saveAsTemplate = async () => {
    if (typeof window === 'undefined') return;
    const name = window.prompt('Save current selection as template — enter a name:');
    if (!name || !name.trim()) return;
    setLoading(true);
    setMessage('');
    try {
      await post(api('/templates'), {
        name: name.trim(),
        roleIds: selectedRoleIds.map(Number),
      });
      setMessage(`Template "${name.trim()}" saved.`);
      const t = await get(api('/templates'));
      setTemplates(t?.data?.data || []);
    } catch {
      setMessage('Failed to save template.');
    } finally {
      setLoading(false);
    }
  };

  const deleteTemplate = async (templateId) => {
    const tpl = templates.find((t) => String(t.id) === String(templateId));
    if (!tpl) return;
    if (typeof window !== 'undefined' && !window.confirm(`Delete template "${tpl.name}"?`)) return;
    setLoading(true);
    setMessage('');
    try {
      await del(api(`/templates/${templateId}`));
      if (String(applyTemplateId) === String(templateId)) setApplyTemplateId('');
      const t = await get(api('/templates'));
      setTemplates(t?.data?.data || []);
      setMessage(`Template "${tpl.name}" deleted.`);
    } catch {
      setMessage('Failed to delete template.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="beta">User App Role Assignments</Typography>
      {message && (
        <Box paddingTop={2}>
          <Typography textColor="neutral600">{message}</Typography>
        </Box>
      )}

      <Flex gap={6} alignItems="flex-start" wrap="wrap" paddingTop={4}>
        <Box style={{ flex: '0 0 360px' }}>
          {!selectedUser && (
            <Box padding={4} style={{ border: '1px dashed #e0e0e0', borderRadius: 8 }}>
              <Typography variant="pi" textColor="neutral500">
                Pick a user from the list to edit their app role assignments.
              </Typography>
            </Box>
          )}

          {selectedUser && (
            <Box>
              <Typography variant="sigma">
                {selectedUser.displayName || selectedUser.username || selectedUser.email}
              </Typography>
              {selectedUser.email && (
                <Box paddingTop={1}>
                  <Typography variant="pi" textColor="neutral500">{selectedUser.email}</Typography>
                </Box>
              )}
              {selectedUser.role && (
                <Box paddingTop={1}>
                  <Typography variant="pi" textColor="neutral500">
                    Users-permissions role: {selectedUser.role.name || selectedUser.role.type}
                  </Typography>
                </Box>
              )}

              <Box paddingTop={4} style={{ border: '1px solid #e8e8f0', borderRadius: 8, padding: 10 }}>
                <Typography variant="sigma">Copy permissions</Typography>
                <Box paddingTop={2}>
                  <SingleSelect
                    label="Copy from user"
                    placeholder="Select a user to copy from"
                    value={copyFromUserId}
                    onChange={(v) => copyFromUser(v || '')}
                  >
                    {users
                      .filter((u) => String(u.id) !== String(selectedUserId))
                      .map((u) => (
                        <SingleSelectOption key={u.id} value={String(u.id)}>
                          {(u.displayName || u.username || u.email)} ({(u.app_roles || []).length})
                        </SingleSelectOption>
                      ))}
                  </SingleSelect>
                </Box>

                <Box paddingTop={3}>
                  <SingleSelect
                    label="Apply template"
                    placeholder={templates.length === 0 ? 'No templates yet' : 'Select a template'}
                    value={applyTemplateId}
                    onChange={(v) => applyTemplate(v || '')}
                    disabled={templates.length === 0}
                  >
                    {templates.map((t) => (
                      <SingleSelectOption key={t.id} value={String(t.id)}>
                        {t.name} ({(t.appRoles || []).length})
                      </SingleSelectOption>
                    ))}
                  </SingleSelect>
                  {applyTemplateId && (
                    <Box paddingTop={2}>
                      <Button
                        variant="danger-light"
                        size="S"
                        onClick={() => deleteTemplate(applyTemplateId)}
                      >
                        Delete selected template
                      </Button>
                    </Box>
                  )}
                </Box>

                <Box paddingTop={3}>
                  <TextInput
                    label="Save current selection as template"
                    placeholder="Template name (e.g. cashier-default)"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                  />
                  <Box paddingTop={2}>
                    <Button
                      variant="secondary"
                      onClick={saveAsTemplate}
                      disabled={!newTemplateName.trim()}
                    >
                      Save as new template ({selectedRoleIds.length})
                    </Button>
                  </Box>
                </Box>
              </Box>

              <Box paddingTop={4}>
                <Flex justifyContent="space-between" alignItems="center">
                  <Typography variant="sigma">Assigned App Roles</Typography>
                  <Typography variant="pi" textColor="neutral500">
                    {selectedRoleIds.length} selected
                  </Typography>
                </Flex>

              <Box paddingTop={2}>
                <TextInput
                  label="Filter roles"
                  placeholder="Filter roles by name or key"
                  value={assignedRoleFilter}
                  onChange={(e) => setAssignedRoleFilter(e.target.value)}
                />
              </Box>

              <Flex gap={2} paddingTop={2} alignItems="center" wrap="wrap">
                <Button
                  variant="tertiary"
                  disabled={visibleRoleIds.length === 0 || visibleSelectedCount === visibleRoleIds.length}
                  onClick={addFilteredRoles}
                >
                  Add {assignedRoleFilter ? 'filtered' : 'all'} ({visibleRoleIds.length - visibleSelectedCount})
                </Button>
                <Button
                  variant="tertiary"
                  disabled={visibleSelectedCount === 0}
                  onClick={removeFilteredRoles}
                >
                  Remove {assignedRoleFilter ? 'filtered' : 'all'} ({visibleSelectedCount})
                </Button>
                {assignedRoleFilter && (
                  <Button variant="tertiary" onClick={() => setAssignedRoleFilter('')}>
                    Clear filter
                  </Button>
                )}
              </Flex>

              <Box paddingTop={2}>
                {visibleRolesByDomain.length === 0 ? (
                  <Box paddingTop={2}>
                    <Typography variant="pi" textColor="neutral500">
                      No roles match "{assignedRoleFilter}".
                    </Typography>
                  </Box>
                ) : null}
                {visibleRolesByDomain.map(([domainKey, group]) => (
                  <Box key={domainKey} style={{ marginBottom: 12, border: '1px solid #e8e8f0', borderRadius: 8, overflow: 'hidden' }}>
                    <Flex justifyContent="space-between" alignItems="center" style={{ padding: '6px 10px', background: '#f4f4f8' }}>
                      <Typography variant="pi" fontWeight="semiBold" textColor="neutral600">{group.label}</Typography>
                    </Flex>
                    <Box style={{ padding: '6px 10px' }}>
                      {group.roles.map((role) => {
                        const id = `assign-role-${role.id}`;
                        const checked = selectedSet.has(String(role.id));
                        return (
                          <Flex key={role.id} gap={2} alignItems="center" paddingBottom={1}>
                            <input id={id} type="checkbox" checked={checked} onChange={() => toggleRole(String(role.id))} />
                            <label htmlFor={id} style={{ cursor: 'pointer', flex: 1 }}>
                              <Typography variant="pi">{role.key}</Typography>
                              {role.name && role.name !== role.key && (
                                <Typography variant="pi" textColor="neutral400" style={{ fontSize: 10, marginLeft: 4 }}>
                                  {role.name}
                                </Typography>
                              )}
                            </label>
                          </Flex>
                        );
                      })}
                    </Box>
                  </Box>
                ))}
              </Box>
              <Button onClick={save} loading={loading} style={{ marginTop: 16 }}>Save Assignment</Button>
              </Box>
            </Box>
          )}
        </Box>

        <Box style={{ flex: 1, minWidth: 0 }}>
          <Flex gap={3} wrap="wrap" alignItems="flex-end" paddingBottom={3}>
            <Box style={{ flex: '1 1 200px' }}>
              <TextInput label="Search Users" placeholder="Name or email" value={userSearch} onChange={(e) => { setUserSearch(e.target.value); setPage(1); }} />
            </Box>
            <Box style={{ flex: '1 1 180px' }}>
              <SingleSelect label="Filter by App Role" placeholder="All app roles" value={filterAppRole} onChange={(v) => { setFilterAppRole(v || ''); setPage(1); }}>
                {roleOptions.map((r) => (
                  <SingleSelectOption key={r.id} value={String(r.id)}>{r.key}</SingleSelectOption>
                ))}
              </SingleSelect>
            </Box>
            <Box style={{ flex: '1 1 180px' }}>
              <SingleSelect label="Filter by UP Role" placeholder="All UP roles" value={filterUpRole} onChange={(v) => { setFilterUpRole(v || ''); setPage(1); }}>
                {upRoleOptions.map((r) => (
                  <SingleSelectOption key={r.id} value={String(r.id)}>{r.name}</SingleSelectOption>
                ))}
              </SingleSelect>
            </Box>
            {(filterAppRole || filterUpRole || userSearch) && (
              <Box>
                <Button
                  variant="tertiary"
                  onClick={() => {
                    setFilterAppRole('');
                    setFilterUpRole('');
                    setUserSearch('');
                    setPage(1);
                  }}
                >
                  Clear filters
                </Button>
              </Box>
            )}
          </Flex>

          <Typography variant="pi" textColor="neutral500" paddingBottom={2}>
            {filteredUsers.length} of {users.length} users
          </Typography>

          {paged.map((u) => (
            <Flex key={u.id} justifyContent="space-between" alignItems="center" padding={3}
              style={{
                background: String(u.id) === selectedUserId ? '#e8eaf6' : 'transparent',
                border: '1px solid #e0e0e0',
                borderRadius: 8,
                marginBottom: 6,
                cursor: 'pointer',
              }}
              onClick={() => selectUser(String(u.id))}
            >
              <Box>
                <Typography variant="sigma">{u.displayName || u.username}</Typography>
                <Typography variant="pi" textColor="neutral500">{u.email}</Typography>
                {u.role && (
                  <Typography variant="pi" textColor="neutral400" style={{ fontSize: 10 }}>
                    {u.role.name || u.role.type}
                  </Typography>
                )}
              </Box>
              <Box style={{ background: (u.app_roles || []).length > 0 ? '#e8f5e9' : '#f5f5f5', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                {(u.app_roles || []).length} app role{(u.app_roles || []).length !== 1 ? 's' : ''}
              </Box>
            </Flex>
          ))}

          <Flex justifyContent="space-between" paddingTop={2}>
            <Button variant="secondary" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
            <Typography variant="pi">Page {safePage} / {totalPages}</Typography>
            <Button variant="secondary" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
          </Flex>
        </Box>
      </Flex>
    </Box>
  );
};

export default UsersPage;
