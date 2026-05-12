import React from 'react';
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

const api = (p) => `/api-pro${p}`;
const PAGE_SIZE = 12;

const InterfaceCard = ({ iface, onScaffold }) => {
  const methodCount = Array.isArray(iface.methods) ? iface.methods.length : 0;
  return (
    <Box
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        padding: 12,
        flex: '1 1 280px',
        minWidth: 240,
        maxWidth: 360,
      }}
    >
      <Typography variant="sigma">{iface.name}</Typography>
      <Typography variant="pi" textColor="neutral500">{iface.key}</Typography>
      <Box paddingTop={1}>
        <Typography variant="pi" textColor="neutral500">
          {iface.uid || '—'} · {methodCount} method(s) ·{' '}
          <span style={{ background: iface.status === 'generated' ? '#e8f5e9' : '#fff3e0',
            padding: '1px 6px', borderRadius: 8, fontSize: 10 }}>
            {iface.status || 'manual'}
          </span>
        </Typography>
      </Box>
      <Flex gap={1} paddingTop={3}>
        <Button variant="secondary" onClick={() => onScaffold(iface)}>Scaffold</Button>
      </Flex>
    </Box>
  );
};

const ScaffoldModal = ({ iface, onClose }) => {
  const { get } = useFetchClient();
  const [code, setCode] = React.useState('// loading...');
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!iface) return;
    (async () => {
      try {
        const { data } = await get(api(`/interfaces/${iface.key}/scaffold`));
        setCode(data?.data?.code || '');
      } catch (err) {
        setError(err?.response?.data?.error?.message || 'Failed to scaffold.');
      }
    })();
  }, [iface, get]);

  const copy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
  };

  if (!iface) return null;

  return (
    <Box style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex',
      alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <Box style={{ background: '#fff', borderRadius: 8, padding: 16,
        maxWidth: 800, width: '90%', maxHeight: '80vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <Flex justifyContent="space-between" alignItems="center" paddingBottom={3}>
          <Typography variant="beta">Scaffold: {iface.key}</Typography>
          <Flex gap={2}>
            <Button variant="secondary" onClick={copy}>Copy</Button>
            <Button onClick={onClose}>Close</Button>
          </Flex>
        </Flex>
        {error ? <Typography textColor="danger700">{error}</Typography> : (
          <pre style={{ background: '#f4f4f8', padding: 12, borderRadius: 4, fontSize: 12, margin: 0 }}>
            {code}
          </pre>
        )}
      </Box>
    </Box>
  );
};

const AlignmentPlayground = () => {
  const { post } = useFetchClient();
  const [routePath, setRoutePath] = React.useState('/cms-footers/:documentId');
  const [signature, setSignature] = React.useState('documentId');
  const [result, setResult] = React.useState(null);
  const [message, setMessage] = React.useState('');

  const parseSignature = () => signature.split(',').map((v) => v.trim()).filter(Boolean);

  const validate = async () => {
    setMessage('');
    try {
      const { data } = await post(api('/interfaces/validate-alignment'),
        { path: routePath, inputSignature: parseSignature() });
      setResult(data?.data || null);
    } catch { setMessage('Validation failed.'); }
  };

  const previewFix = async () => {
    setMessage('');
    try {
      const { data } = await post(api('/interfaces/preview-guided-fix'),
        { path: routePath, inputSignature: parseSignature() });
      setResult(data?.data || null);
    } catch { setMessage('Guided fix preview failed.'); }
  };

  return (
    <Box paddingTop={6} style={{ borderTop: '1px solid #e0e0e0' }}>
      <Box paddingTop={4}>
        <Typography variant="delta">Alignment Playground</Typography>
        <Typography variant="pi" textColor="neutral600">
          Validate that route :tokens line up with method signature args.
        </Typography>
      </Box>
      <Box paddingTop={3}>
        <TextInput label="Route path" value={routePath}
          onChange={(e) => setRoutePath(e.target.value)} />
      </Box>
      <Box paddingTop={2}>
        <TextInput label="Input signature (comma-separated)" value={signature}
          onChange={(e) => setSignature(e.target.value)} />
      </Box>
      <Flex gap={2} paddingTop={3}>
        <Button onClick={validate}>Validate</Button>
        <Button variant="secondary" onClick={previewFix}>Preview Guided Fix</Button>
      </Flex>
      {message && <Box paddingTop={2}><Typography textColor="danger700">{message}</Typography></Box>}
      {result && (
        <Box paddingTop={3}>
          <pre style={{ background: '#f4f4f8', padding: 8, borderRadius: 4, fontSize: 12, margin: 0 }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </Box>
      )}
    </Box>
  );
};

const Interfaces = () => {
  const { get } = useFetchClient();
  const [interfaces, setInterfaces] = React.useState([]);
  const [scaffolding, setScaffolding] = React.useState(null);
  const [message, setMessage] = React.useState('');

  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [page, setPage] = React.useState(1);

  const load = React.useCallback(async () => {
    try {
      const { data } = await get(api('/interfaces'));
      setInterfaces(data?.data || []);
    } catch { setMessage('Failed to load interfaces.'); }
  }, [get]);

  React.useEffect(() => { load(); }, [load]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return interfaces.filter((i) => {
      if (q) {
        const inText = (i.key || '').toLowerCase().includes(q) ||
                       (i.name || '').toLowerCase().includes(q) ||
                       (i.uid || '').toLowerCase().includes(q);
        if (!inText) return false;
      }
      if (statusFilter && (i.status || 'manual') !== statusFilter) return false;
      return true;
    });
  }, [interfaces, search, statusFilter]);

  React.useEffect(() => { setPage(1); }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <Box>
      <Flex justifyContent="space-between" alignItems="center" wrap="wrap" gap={2}>
        <Box>
          <Typography variant="beta">API Interfaces</Typography>
          <Typography variant="omega" textColor="neutral600">
            {interfaces.length} interface(s) — authored under .api-pro/interfaces/ (file = source of truth, DB = runtime mirror).
          </Typography>
        </Box>
        <Button variant="secondary" onClick={load}>Refresh</Button>
      </Flex>

      {message && <Box paddingTop={2}><Typography textColor="danger700">{message}</Typography></Box>}

      <Flex gap={3} paddingTop={4} wrap="wrap" alignItems="flex-end">
        <Box style={{ flex: '1 1 240px' }}>
          <TextInput label="Search" placeholder="key, name, or uid"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </Box>
        <Box style={{ flex: '0 0 200px' }}>
          <SingleSelect label="Status" placeholder="All"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v || '')}
            onClear={() => setStatusFilter('')}
          >
            <SingleSelectOption value="generated">Generated</SingleSelectOption>
            <SingleSelectOption value="modified">Modified</SingleSelectOption>
            <SingleSelectOption value="manual">Manual</SingleSelectOption>
          </SingleSelect>
        </Box>
        <Typography variant="pi" textColor="neutral500">
          {filtered.length} of {interfaces.length}
        </Typography>
      </Flex>

      <Flex gap={3} wrap="wrap" paddingTop={4}>
        {paged.length === 0 ? (
          <Typography variant="pi" textColor="neutral500">
            {interfaces.length === 0
              ? 'No interfaces yet — run "Re-seed from api-provider" on the Domains & Roles tab to import from @rutba/api-provider.'
              : 'No interfaces match the current filters.'}
          </Typography>
        ) : (
          paged.map((i) => <InterfaceCard key={i.id} iface={i} onScaffold={setScaffolding} />)
        )}
      </Flex>

      {totalPages > 1 && (
        <Flex justifyContent="space-between" alignItems="center" paddingTop={3}>
          <Button variant="secondary" disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
          <Typography variant="pi">Page {safePage} / {totalPages}</Typography>
          <Button variant="secondary" disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
        </Flex>
      )}

      <AlignmentPlayground />

      <ScaffoldModal iface={scaffolding} onClose={() => setScaffolding(null)} />
    </Box>
  );
};

export default Interfaces;
