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

// ── Category derivation ──────────────────────────────────────────────────
// Maps each interface to a friendly content-type-family label.
// Order matters — first match wins. Fallthrough to 'Other'.
const CATEGORY_RULES = [
  { id: 'acc',      label: 'Accounting',     test: (k) => /^acc[-_]/.test(k) || /accounting/.test(k) },
  { id: 'pay',      label: 'Payroll',        test: (k) => /^pay[-_]/.test(k) || /payroll/.test(k) || /payslip/.test(k) },
  { id: 'hr',       label: 'HR',             test: (k) => /^hr[-_]/.test(k) },
  { id: 'cms',      label: 'CMS',            test: (k) => /^cms[-_]/.test(k) || /^site/.test(k) || /^cms-page/.test(k) },
  { id: 'crm',      label: 'CRM',            test: (k) => /^crm[-_]/.test(k) },
  { id: 'auth',     label: 'Auth & Users',   test: (k) => /^auth/.test(k) || /^users?/.test(k) || /^user[-_]/.test(k) },
  { id: 'sale',     label: 'Sales & POS',    test: (k) => /^sale/.test(k) || /^pos[-_]/.test(k) || /^payment/.test(k) || /^cash[-_]/.test(k) || /^return[-_]/.test(k) },
  { id: 'commerce', label: 'Commerce catalog', test: (k) => /^product/.test(k) || /^categor/.test(k) || /^brand/.test(k) || /^customer/.test(k) || /^branch/.test(k) },
  { id: 'stock',    label: 'Stock & Inventory', test: (k) => /^stock/.test(k) || /^suppl/.test(k) || /^purchase/.test(k) || /^warehouse/.test(k) },
  { id: 'delivery', label: 'Delivery & Riders', test: (k) => /^deliver/.test(k) || /^rider/.test(k) || /^zone/.test(k) },
  { id: 'order',    label: 'Orders',         test: (k) => /^order/.test(k) || /^web-order/.test(k) },
  { id: 'social',   label: 'Social',         test: (k) => /^social/.test(k) },
  { id: 'media',    label: 'Media & Files',  test: (k) => /^media/.test(k) || /^file/.test(k) || /^upload/.test(k) },
  { id: 'enums',    label: 'Enumerations',   test: (k) => /^enum/.test(k) },
];
const OTHER = { id: 'other', label: 'Other' };

function categoryOf(iface) {
  const key = String(iface?.key || iface?.uid || '').toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.test(key)) return rule;
  }
  return OTHER;
}

// ── Components ───────────────────────────────────────────────────────────
const InterfaceCard = ({ iface, onScaffold }) => {
  const methodCount = Array.isArray(iface.methods) ? iface.methods.length : 0;
  return (
    <Box style={{
      border: '1px solid #e0e0e0', borderRadius: 8, padding: 10,
      flex: '1 1 240px', minWidth: 220, maxWidth: 320, background: '#fff',
    }}>
      <Typography variant="sigma">{iface.name}</Typography>
      <Typography variant="pi" textColor="neutral500">{iface.key}</Typography>
      <Box paddingTop={1}>
        <Typography variant="pi" textColor="neutral500">
          <code style={{ fontSize: 10 }}>{iface.uid || '—'}</code>
        </Typography>
      </Box>
      <Flex gap={1} paddingTop={1} alignItems="center" justifyContent="space-between">
        <Flex gap={1} alignItems="center">
          <span style={{ background: '#e8eaf6', color: '#4945ff', padding: '1px 6px',
            borderRadius: 8, fontSize: 10, fontWeight: 600 }}>
            {methodCount} method{methodCount === 1 ? '' : 's'}
          </span>
          <span style={{ background: iface.status === 'generated' ? '#e8f5e9' : '#fff3e0',
            padding: '1px 6px', borderRadius: 8, fontSize: 10 }}>
            {iface.status || 'manual'}
          </span>
        </Flex>
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
      onClick={onClose}>
      <Box style={{ background: '#fff', borderRadius: 8, padding: 16,
        maxWidth: 800, width: '90%', maxHeight: '80vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}>
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
  const [categoryFilter, setCategoryFilter] = React.useState('');
  const [collapsedGroups, setCollapsedGroups] = React.useState({});

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
      if (categoryFilter && categoryOf(i).id !== categoryFilter) return false;
      return true;
    });
  }, [interfaces, search, statusFilter, categoryFilter]);

  // Group filtered interfaces by category, preserving category-rules order.
  const grouped = React.useMemo(() => {
    const buckets = new Map();
    for (const rule of CATEGORY_RULES) buckets.set(rule.id, { rule, items: [] });
    buckets.set(OTHER.id, { rule: OTHER, items: [] });
    for (const iface of filtered) {
      const c = categoryOf(iface);
      buckets.get(c.id).items.push(iface);
    }
    return Array.from(buckets.values()).filter((b) => b.items.length > 0);
  }, [filtered]);

  const categoryOptions = CATEGORY_RULES.concat([OTHER]);

  const toggleGroup = (id) => setCollapsedGroups((c) => ({ ...c, [id]: !c[id] }));
  const expandAll = () => setCollapsedGroups({});
  const collapseAll = () => {
    const all = {};
    for (const g of grouped) all[g.rule.id] = true;
    setCollapsedGroups(all);
  };

  return (
    <Box>
      <Flex justifyContent="space-between" alignItems="center" wrap="wrap" gap={2}>
        <Box>
          <Typography variant="beta">API Interfaces</Typography>
          <Typography variant="omega" textColor="neutral600">
            {interfaces.length} interface(s) across {grouped.length} categor{grouped.length === 1 ? 'y' : 'ies'}
          </Typography>
        </Box>
        <Flex gap={2}>
          <Button variant="tertiary" onClick={expandAll}>Expand all</Button>
          <Button variant="tertiary" onClick={collapseAll}>Collapse all</Button>
          <Button variant="secondary" onClick={load}>Refresh</Button>
        </Flex>
      </Flex>

      {message && <Box paddingTop={2}><Typography textColor="danger700">{message}</Typography></Box>}

      <Flex gap={3} paddingTop={4} wrap="wrap" alignItems="flex-end">
        <Box style={{ flex: '1 1 220px' }}>
          <TextInput label="Search" placeholder="key, name, or uid"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </Box>
        <Box style={{ flex: '0 0 200px' }}>
          <SingleSelect label="Category" placeholder="All"
            value={categoryFilter}
            onChange={(v) => setCategoryFilter(v || '')}
            onClear={() => setCategoryFilter('')}>
            {categoryOptions.map((c) => (
              <SingleSelectOption key={c.id} value={c.id}>{c.label}</SingleSelectOption>
            ))}
          </SingleSelect>
        </Box>
        <Box style={{ flex: '0 0 180px' }}>
          <SingleSelect label="Status" placeholder="All"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v || '')}
            onClear={() => setStatusFilter('')}>
            <SingleSelectOption value="generated">Generated</SingleSelectOption>
            <SingleSelectOption value="modified">Modified</SingleSelectOption>
            <SingleSelectOption value="manual">Manual</SingleSelectOption>
          </SingleSelect>
        </Box>
        <Typography variant="pi" textColor="neutral500">
          {filtered.length} of {interfaces.length}
        </Typography>
      </Flex>

      {grouped.length === 0 && (
        <Box paddingTop={4}>
          <Typography variant="pi" textColor="neutral500">
            {interfaces.length === 0
              ? 'No interfaces yet — run "Re-seed from api-provider" on Domains & Roles to import from @rutba/api-provider.'
              : 'No interfaces match the current filters.'}
          </Typography>
        </Box>
      )}

      {grouped.map((group) => {
        const isCollapsed = collapsedGroups[group.rule.id];
        return (
          <Box key={group.rule.id} paddingTop={4}>
            <Flex justifyContent="space-between" alignItems="center"
              style={{ cursor: 'pointer', padding: '6px 10px',
                background: '#f4f4f8', borderRadius: 6 }}
              onClick={() => toggleGroup(group.rule.id)}>
              <Flex gap={2} alignItems="center">
                <Typography variant="delta">{group.rule.label}</Typography>
                <span style={{ background: '#4945ff', color: '#fff', padding: '1px 8px',
                  borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                  {group.items.length}
                </span>
              </Flex>
              <Typography variant="pi" textColor="neutral500">
                {isCollapsed ? '▶' : '▼'}
              </Typography>
            </Flex>
            {!isCollapsed && (
              <Flex gap={2} wrap="wrap" paddingTop={2}>
                {group.items.map((i) =>
                  <InterfaceCard key={i.id} iface={i} onScaffold={setScaffolding} />)}
              </Flex>
            )}
          </Box>
        );
      })}

      <AlignmentPlayground />

      <ScaffoldModal iface={scaffolding} onClose={() => setScaffolding(null)} />
    </Box>
  );
};

export default Interfaces;
