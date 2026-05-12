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

const PAGE_SIZE = 15;

const UsersPage = () => {
  const { get, put } = useFetchClient();
  const [users, setUsers] = useState([]);
  const [roleOptions, setRoleOptions] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [filterAppRole, setFilterAppRole] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const api = (path) => `/api-pro${path}`;

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([
        get(api('/users')),
        get(api('/users/role-options')),
      ]);
      const userData = u?.data?.data || [];
      setUsers(userData);
      setRoleOptions(r?.data?.data || []);

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
      return true;
    });
  }, [users, userSearch, filterAppRole]);

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
          <SingleSelect label="Select User" placeholder="Choose user" value={selectedUserId} onChange={selectUser}>
            {users.map((u) => (
              <SingleSelectOption key={u.id} value={String(u.id)}>
                {u.displayName || u.username || u.email}
              </SingleSelectOption>
            ))}
          </SingleSelect>

          {selectedUserId && (
            <Box paddingTop={4}>
              <Typography variant="sigma">Assigned App Roles</Typography>
              <Box paddingTop={2}>
                {rolesByDomain.map(([domainKey, group]) => (
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
