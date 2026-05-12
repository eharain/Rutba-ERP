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
        maxWidth: 320,
      }}
    >
      <Typography variant="sigma">{iface.name}</Typography>
      <Typography variant="pi" textColor="neutral500">
        {iface.key}
      </Typography>
      <Box paddingTop={1}>
        <Typography variant="pi" textColor="neutral500">
          {iface.uid || '—'} · {methodCount} method(s) · {iface.status || 'manual'}
        </Typography>
      </Box>
      <Flex gap={1} paddingTop={3}>
        <Button variant="secondary" onClick={() => onScaffold(iface)}>
          Scaffold
        </Button>
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
    <Box
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <Box
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: 16,
          maxWidth: 800,
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Flex justifyContent="space-between" alignItems="center" paddingBottom={3}>
          <Typography variant="beta">Scaffold: {iface.key}</Typography>
          <Flex gap={2}>
            <Button variant="secondary" onClick={copy}>Copy</Button>
            <Button onClick={onClose}>Close</Button>
          </Flex>
        </Flex>
        {error ? (
          <Typography textColor="danger700">{error}</Typography>
        ) : (
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

  const parseSignature = () =>
    signature.split(',').map((v) => v.trim()).filter(Boolean);

  const validate = async () => {
    setMessage('');
    try {
      const { data } = await post(api('/interfaces/validate-alignment'), {
        path: routePath,
        inputSignature: parseSignature(),
      });
      setResult(data?.data || null);
    } catch {
      setMessage('Validation failed.');
    }
  };

  const previewFix = async () => {
    setMessage('');
    try {
      const { data } = await post(api('/interfaces/preview-guided-fix'), {
        path: routePath,
        inputSignature: parseSignature(),
      });
      setResult(data?.data || null);
    } catch {
      setMessage('Guided fix preview failed.');
    }
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
        <TextInput label="Route path" value={routePath} onChange={(e) => setRoutePath(e.target.value)} />
      </Box>
      <Box paddingTop={2}>
        <TextInput
          label="Input signature (comma-separated)"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
        />
      </Box>
      <Flex gap={2} paddingTop={3}>
        <Button onClick={validate}>Validate</Button>
        <Button variant="secondary" onClick={previewFix}>Preview Guided Fix</Button>
      </Flex>
      {message && (
        <Box paddingTop={2}>
          <Typography textColor="danger700">{message}</Typography>
        </Box>
      )}
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

  const load = React.useCallback(async () => {
    try {
      const { data } = await get(api('/interfaces'));
      setInterfaces(data?.data || []);
    } catch {
      setMessage('Failed to load interfaces.');
    }
  }, [get]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <Box>
      <Flex justifyContent="space-between" alignItems="center">
        <Typography variant="beta">API Interfaces</Typography>
        <Button variant="secondary" onClick={load}>Refresh</Button>
      </Flex>
      <Typography variant="omega" textColor="neutral600">
        Authored under .api-pro/interfaces/ (file = source of truth, DB = runtime mirror).
      </Typography>

      {message && (
        <Box paddingTop={2}>
          <Typography textColor="danger700">{message}</Typography>
        </Box>
      )}

      <Flex gap={3} wrap="wrap" paddingTop={4}>
        {interfaces.length === 0 ? (
          <Typography variant="pi" textColor="neutral500">
            No interfaces yet. Create one by recording API traffic, generating from a content-type,
            or dropping a JSON file into .api-pro/interfaces/.
          </Typography>
        ) : (
          interfaces.map((i) => (
            <InterfaceCard key={i.id} iface={i} onScaffold={setScaffolding} />
          ))
        )}
      </Flex>

      <AlignmentPlayground />

      <ScaffoldModal iface={scaffolding} onClose={() => setScaffolding(null)} />
    </Box>
  );
};

export default Interfaces;
