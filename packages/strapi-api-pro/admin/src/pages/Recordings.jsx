import React from 'react';
import {
  Box,
  Typography,
  Button,
  Flex,
  TextInput,
} from '@strapi/design-system';
import { useFetchClient } from '@strapi/strapi/admin';

const api = (p) => `/api-pro${p}`;
const PAGE_SIZE = 15;

const StatusBadge = ({ status }) => {
  const color = status === 'recording' ? '#1f8a45' : status === 'stopped' ? '#666' : '#999';
  const bg = status === 'recording' ? '#e6f7ec' : status === 'stopped' ? '#f0f0f0' : '#f8f8f8';
  return (
    <span style={{ background: bg, color, padding: '2px 8px', borderRadius: 12,
      fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
      {status || 'unknown'}
    </span>
  );
};

const EntryRow = ({ entry }) => {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <Box style={{ borderTop: '1px solid #f0f0f4' }}>
      <Flex justifyContent="space-between" alignItems="center" padding={2}
        style={{ cursor: 'pointer' }} onClick={() => setExpanded((v) => !v)}>
        <Flex gap={2} alignItems="center">
          <span style={{ padding: '1px 6px', border: '1px solid #ccc', borderRadius: 4,
            fontSize: 10, fontWeight: 600 }}>
            {(entry.method || 'GET').toUpperCase()}
          </span>
          <Typography variant="pi">{entry.path}</Typography>
        </Flex>
        <Flex gap={2} alignItems="center">
          <Typography variant="pi" textColor="neutral500">
            {entry.statusCode || '–'} · {entry.count || 1}×
          </Typography>
          <Typography variant="pi">{expanded ? '▼' : '▶'}</Typography>
        </Flex>
      </Flex>
      {expanded && (
        <Box padding={3} style={{ background: '#fafafa' }}>
          {entry.query && Object.keys(entry.query).length > 0 && (
            <Box paddingBottom={2}>
              <Typography variant="pi" fontWeight="semiBold">Query</Typography>
              <pre style={{ fontSize: 11, margin: 0 }}>{JSON.stringify(entry.query, null, 2)}</pre>
            </Box>
          )}
          {entry.body && Object.keys(entry.body || {}).length > 0 && (
            <Box paddingBottom={2}>
              <Typography variant="pi" fontWeight="semiBold">Body</Typography>
              <pre style={{ fontSize: 11, margin: 0 }}>{JSON.stringify(entry.body, null, 2)}</pre>
            </Box>
          )}
          {entry.claimedContext && (
            <Box>
              <Typography variant="pi" fontWeight="semiBold">Claim</Typography>
              <pre style={{ fontSize: 11, margin: 0 }}>{JSON.stringify(entry.claimedContext, null, 2)}</pre>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const Recordings = () => {
  const { get, post } = useFetchClient();
  const [sessions, setSessions] = React.useState([]);
  const [entries, setEntries] = React.useState({});
  const [selectedSession, setSelectedSession] = React.useState(null);
  const [newLabel, setNewLabel] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [page, setPage] = React.useState(1);

  // Recording filters (captured at start, attached to the session)
  const [filterMethods, setFilterMethods] = React.useState([]);
  const [filterPathPatterns, setFilterPathPatterns] = React.useState('');
  const [filterCtUids, setFilterCtUids] = React.useState('');
  const [showFilters, setShowFilters] = React.useState(false);

  const loadSessions = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await get(api('/recordings'));
      setSessions(data?.data || []);
    } catch { setMessage('Failed to load sessions.'); }
    finally { setLoading(false); }
  }, [get]);

  React.useEffect(() => { loadSessions(); }, [loadSessions]);

  const loadEntries = React.useCallback(async (sessionId) => {
    try {
      const { data } = await get(api(`/recordings/${sessionId}/entries`));
      setEntries((e) => ({ ...e, [sessionId]: data?.data || [] }));
    } catch {
      setEntries((e) => ({ ...e, [sessionId]: [] }));
    }
  }, [get]);

  const toCsvList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

  const start = async () => {
    setMessage('');
    const filters = {
      methods: filterMethods,
      pathPatterns: toCsvList(filterPathPatterns),
      contentTypeUids: toCsvList(filterCtUids),
    };
    try {
      await post(api('/recordings/start'), { name: newLabel || undefined, filters });
      setNewLabel('');
      // keep filter state so the user can re-use it for the next recording
      await loadSessions();
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || 'Failed to start recording.');
    }
  };

  const toggleMethod = (m) => {
    setFilterMethods((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  };

  const filterSummary = (() => {
    const parts = [];
    if (filterMethods.length > 0) parts.push(`methods=${filterMethods.join(',')}`);
    const paths = toCsvList(filterPathPatterns);
    if (paths.length > 0) parts.push(`paths=${paths.length}`);
    const uids = toCsvList(filterCtUids);
    if (uids.length > 0) parts.push(`uids=${uids.length}`);
    return parts.length === 0 ? 'no filters — captures all traffic' : parts.join(' · ');
  })();

  const stop = async () => {
    setMessage('');
    try {
      await post(api('/recordings/stop'), {});
      await loadSessions();
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || 'Failed to stop recording.');
    }
  };

  const activeSession = sessions.find((s) => s.status === 'recording');

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      if (statusFilter && s.status !== statusFilter) return false;
      if (q) {
        const hit = (s.name || '').toLowerCase().includes(q) ||
                    (s.resolvedAppName || '').toLowerCase().includes(q) ||
                    (s.resolvedRoleKey || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [sessions, search, statusFilter]);

  React.useEffect(() => { setPage(1); }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const renderRow = (s) => {
    const isOpen = selectedSession === s.id;
    const sessionEntries = entries[s.id] || [];
    return (
      <Box key={s.id} style={{ border: '1px solid #e0e0e0', borderRadius: 8,
        marginTop: 8, overflow: 'hidden' }}>
        <Flex justifyContent="space-between" alignItems="center" padding={3}
          style={{ background: isOpen ? '#f4f4f8' : 'transparent', cursor: 'pointer' }}
          onClick={() => {
            const next = isOpen ? null : s.id;
            setSelectedSession(next);
            if (next && !entries[s.id]) loadEntries(s.id);
          }}
        >
          <Box>
            <Flex gap={2} alignItems="center">
              <Typography variant="sigma">{s.name}</Typography>
              <StatusBadge status={s.status} />
            </Flex>
            <Typography variant="pi" textColor="neutral500">
              started {s.startedAt || '?'} · stopped {s.stoppedAt || '–'} ·
              app={s.resolvedAppName || '–'} · role={s.resolvedRoleKey || '–'}
            </Typography>
          </Box>
          <Typography variant="pi">{isOpen ? '▼' : '▶'}</Typography>
        </Flex>
        {isOpen && (
          <Box>
            {sessionEntries.length === 0 ? (
              <Box padding={3}>
                <Typography variant="pi" textColor="neutral500">
                  No entries captured (entry-recording middleware is not yet wired).
                </Typography>
              </Box>
            ) : (
              sessionEntries.map((e) => <EntryRow key={e.id} entry={e} />)
            )}
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box>
      <Typography variant="beta">API Recordings</Typography>
      <Typography variant="omega" textColor="neutral600">
        Capture live API traffic into sessions and convert recordings into interface definitions.
      </Typography>

      <Box paddingTop={4} style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 12 }}>
        <Flex gap={3} alignItems="flex-end" wrap="wrap">
          <Box style={{ flex: '1 1 240px' }}>
            <TextInput label="Session label (optional)" value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. pos-desk happy path"
              disabled={Boolean(activeSession)} />
          </Box>
          {activeSession
            ? <Button variant="danger" onClick={stop} loading={loading}>Stop active session</Button>
            : <Button onClick={start} loading={loading}>Start Recording</Button>}
          <Button variant="secondary" onClick={loadSessions}>Refresh</Button>
        </Flex>

        {!activeSession && (
          <Box paddingTop={3}>
            <Flex justifyContent="space-between" alignItems="center"
              style={{ cursor: 'pointer', padding: '4px 0' }}
              onClick={() => setShowFilters((v) => !v)}>
              <Typography variant="sigma">Capture filters</Typography>
              <Typography variant="pi" textColor="neutral500">
                {filterSummary} · {showFilters ? '▼' : '▶'}
              </Typography>
            </Flex>
            {showFilters && (
              <Box paddingTop={2} style={{ background: '#fafafa', padding: 10, borderRadius: 6 }}>
                <Typography variant="pi" textColor="neutral600">
                  Apply filters here to restrict what the session records.
                  Leave all empty to capture every request the middleware sees.
                </Typography>

                <Box paddingTop={2}>
                  <Typography variant="pi" fontWeight="semiBold">HTTP methods</Typography>
                  <Flex gap={1} paddingTop={1} wrap="wrap">
                    {HTTP_METHODS.map((m) => {
                      const checked = filterMethods.includes(m);
                      return (
                        <label key={m} style={{ cursor: 'pointer', padding: '2px 8px',
                          border: '1px solid #ccc', borderRadius: 12,
                          background: checked ? '#e8eaf6' : 'transparent', fontSize: 11 }}>
                          <input type="checkbox" checked={checked}
                            onChange={() => toggleMethod(m)} style={{ marginRight: 4 }} />
                          {m}
                        </label>
                      );
                    })}
                  </Flex>
                </Box>

                <Box paddingTop={2}>
                  <TextInput label="Path patterns (comma-separated)"
                    value={filterPathPatterns}
                    onChange={(e) => setFilterPathPatterns(e.target.value)}
                    placeholder="/api/sale-orders, /api/cash-registers" />
                </Box>

                <Box paddingTop={2}>
                  <TextInput label="Content-type UIDs (comma-separated)"
                    value={filterCtUids}
                    onChange={(e) => setFilterCtUids(e.target.value)}
                    placeholder="api::sale.sale-order, api::cash-register.cash-register" />
                </Box>

                <Box paddingTop={2}>
                  <Typography variant="pi" textColor="neutral500">
                    Filters are stored on the session and applied by the recorder
                    middleware (when wired). Existing sessions keep the filters they
                    were started with.
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>
        )}

        {activeSession && (
          <Box paddingTop={2}>
            <Typography variant="pi" textColor="neutral600">
              Recording in progress: <strong>{activeSession.name}</strong> ·
              app=<strong>{activeSession.resolvedAppName}</strong> ·
              role=<strong>{activeSession.resolvedRoleKey}</strong>
            </Typography>
            {activeSession.filters && Object.values(activeSession.filters).some((v) => Array.isArray(v) && v.length > 0) && (
              <Typography variant="pi" textColor="neutral500">
                Filters: {[
                  activeSession.filters.methods?.length ? `methods=${activeSession.filters.methods.join(',')}` : null,
                  activeSession.filters.pathPatterns?.length ? `${activeSession.filters.pathPatterns.length} path(s)` : null,
                  activeSession.filters.contentTypeUids?.length ? `${activeSession.filters.contentTypeUids.length} CT uid(s)` : null,
                ].filter(Boolean).join(' · ')}
              </Typography>
            )}
          </Box>
        )}
        {message && (
          <Box paddingTop={2}>
            <Typography textColor="danger700">{message}</Typography>
          </Box>
        )}
      </Box>

      <Box paddingTop={4}>
        <Flex justifyContent="space-between" alignItems="flex-end" wrap="wrap" gap={2}>
          <Typography variant="delta">Sessions ({sessions.length})</Typography>
          <Flex gap={2} wrap="wrap" alignItems="flex-end">
            <Box style={{ flex: '0 0 220px' }}>
              <TextInput label="Search" placeholder="name, app or role"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </Box>
            <Box style={{ flex: '0 0 160px' }}>
              <Typography variant="pi" textColor="neutral600">Status</Typography>
              <select value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #c0c0cf',
                  borderRadius: 4, marginTop: 4 }}>
                <option value="">All status</option>
                <option value="recording">Recording</option>
                <option value="stopped">Stopped</option>
                <option value="idle">Idle</option>
              </select>
            </Box>
          </Flex>
        </Flex>

        {filtered.length !== sessions.length && (
          <Typography variant="pi" textColor="neutral500" paddingTop={1}>
            {filtered.length} of {sessions.length}
          </Typography>
        )}

        {sessions.length === 0 && (
          <Typography variant="pi" textColor="neutral500" paddingTop={2}>
            No recording sessions yet. Start one above.
          </Typography>
        )}

        {paged.map(renderRow)}

        {totalPages > 1 && (
          <Flex justifyContent="space-between" alignItems="center" paddingTop={2}>
            <Button variant="secondary" disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
            <Typography variant="pi">Page {safePage} / {totalPages}</Typography>
            <Button variant="secondary" disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
          </Flex>
        )}
      </Box>
    </Box>
  );
};

export default Recordings;
