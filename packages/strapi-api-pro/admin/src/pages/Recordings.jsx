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

const StatusBadge = ({ status }) => {
  const color =
    status === 'recording' ? '#1f8a45' : status === 'stopped' ? '#666' : '#999';
  const bg =
    status === 'recording' ? '#e6f7ec' : status === 'stopped' ? '#f0f0f0' : '#f8f8f8';
  return (
    <span
      style={{
        background: bg,
        color,
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
      }}
    >
      {status || 'unknown'}
    </span>
  );
};

const EntryRow = ({ entry }) => {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <Box style={{ borderTop: '1px solid #f0f0f4' }}>
      <Flex
        justifyContent="space-between"
        alignItems="center"
        padding={2}
        style={{ cursor: 'pointer' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <Flex gap={2} alignItems="center">
          <span
            style={{
              padding: '1px 6px',
              border: '1px solid #ccc',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600,
            }}
          >
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

const Recordings = () => {
  const { get, post } = useFetchClient();
  const [sessions, setSessions] = React.useState([]);
  const [entries, setEntries] = React.useState({});
  const [selectedSession, setSelectedSession] = React.useState(null);
  const [newLabel, setNewLabel] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState('');

  const loadSessions = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await get(api('/recordings'));
      setSessions(data?.data || []);
    } catch {
      setMessage('Failed to load sessions.');
    } finally {
      setLoading(false);
    }
  }, [get]);

  React.useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const loadEntries = React.useCallback(
    async (sessionId) => {
      try {
        const { data } = await get(api(`/recordings/${sessionId}/entries`));
        setEntries((e) => ({ ...e, [sessionId]: data?.data || [] }));
      } catch {
        setEntries((e) => ({ ...e, [sessionId]: [] }));
      }
    },
    [get]
  );

  const start = async () => {
    setMessage('');
    try {
      await post(api('/recordings/start'), { name: newLabel || undefined });
      setNewLabel('');
      await loadSessions();
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || 'Failed to start recording.');
    }
  };

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

  return (
    <Box>
      <Typography variant="beta">API Recordings</Typography>
      <Typography variant="omega" textColor="neutral600">
        Capture live API traffic into sessions and convert recordings into interface definitions.
      </Typography>

      <Box paddingTop={4} style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 12 }}>
        <Flex gap={3} alignItems="flex-end" wrap="wrap">
          <Box style={{ flex: '1 1 240px' }}>
            <TextInput
              label="Session label (optional)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. pos-desk happy path"
              disabled={Boolean(activeSession)}
            />
          </Box>
          {activeSession ? (
            <Button variant="danger" onClick={stop} loading={loading}>
              Stop active session
            </Button>
          ) : (
            <Button onClick={start} loading={loading}>
              Start Recording
            </Button>
          )}
          <Button variant="secondary" onClick={loadSessions}>Refresh</Button>
        </Flex>
        {activeSession && (
          <Box paddingTop={2}>
            <Typography variant="pi" textColor="neutral600">
              Recording in progress: <strong>{activeSession.name}</strong> ·
              app=<strong>{activeSession.resolvedAppName}</strong> ·
              role=<strong>{activeSession.resolvedRoleKey}</strong>
            </Typography>
          </Box>
        )}
        {message && (
          <Box paddingTop={2}>
            <Typography textColor="danger700">{message}</Typography>
          </Box>
        )}
      </Box>

      <Box paddingTop={4}>
        <Typography variant="delta">Sessions ({sessions.length})</Typography>
        {sessions.length === 0 && (
          <Typography variant="pi" textColor="neutral500" paddingTop={2}>
            No recording sessions yet. Start one above.
          </Typography>
        )}
        {sessions.map((s) => {
          const isOpen = selectedSession === s.id;
          const sessionEntries = entries[s.id] || [];
          return (
            <Box
              key={s.id}
              style={{
                border: '1px solid #e0e0e0',
                borderRadius: 8,
                marginTop: 8,
                overflow: 'hidden',
              }}
            >
              <Flex
                justifyContent="space-between"
                alignItems="center"
                padding={3}
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
        })}
      </Box>
    </Box>
  );
};

export default Recordings;
