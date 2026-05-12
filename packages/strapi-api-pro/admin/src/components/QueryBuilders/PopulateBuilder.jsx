import React from 'react';
import { Box, Flex, Typography } from '@strapi/design-system';
import { tokens } from './tokens';

// PopulateBuilder — list-of-paths editor that serializes to Strapi's populate
// object. The user enters dot-paths (e.g. "author", "comments.author",
// "comments.replies") and we render them as a tree so it's clear which
// relations get nested populate.
//
// Strapi populate accepted shapes:
//   - '*'                                       → populate everything (1 level)
//   - ['author', 'comments']                    → list of relation names
//   - { author: true, comments: { populate: { author: true } } }   → nested
//
// We use the FULL object shape internally for clarity. `'*'` is preserved as
// a special "*" path. Empty paths produce `{}` (no populate).

const PATH_RE = /^[a-zA-Z_*][\w*]*(\.[a-zA-Z_][\w]*)*$/;

// ─── serialize paths[] → populate object ──────────────────────────────────
export function pathsToPopulate(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return {};
  if (paths.includes('*')) return '*';

  const out = {};
  for (const raw of paths) {
    const parts = String(raw || '').split('.').filter(Boolean);
    if (parts.length === 0) continue;
    let cursor = out;
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      const isLeaf = i === parts.length - 1;
      if (isLeaf) {
        if (cursor[part] === undefined) cursor[part] = true;
      } else {
        if (cursor[part] === undefined || cursor[part] === true) {
          cursor[part] = { populate: {} };
        } else if (!cursor[part].populate) {
          cursor[part].populate = {};
        }
        cursor = cursor[part].populate;
      }
    }
  }
  return out;
}

// ─── parse populate object → paths[] ──────────────────────────────────────
export function populateToPaths(value) {
  if (value === '*' || value === true) return ['*'];
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string');

  const out = [];
  const walk = (node, prefix) => {
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v === true || v == null) {
        out.push(path);
      } else if (typeof v === 'object' && v.populate) {
        walk(v.populate, path);
      } else {
        out.push(path);
      }
    }
  };
  walk(value, '');
  return out;
}

// ─── tree shape for visual rendering ──────────────────────────────────────
function pathsToTree(paths) {
  const root = {};
  for (const path of paths) {
    if (path === '*') {
      root['*'] = root['*'] || { children: {}, full: '*' };
      continue;
    }
    const parts = String(path || '').split('.').filter(Boolean);
    let cursor = root;
    let acc = [];
    for (const part of parts) {
      acc.push(part);
      cursor[part] = cursor[part] || { children: {}, full: acc.join('.') };
      cursor = cursor[part].children;
    }
  }
  return root;
}

function TreeNode({ name, node, depth, onRemove }) {
  const childKeys = Object.keys(node.children || {});
  return (
    <Box style={{
      marginLeft: depth === 0 ? 0 : 12,
      paddingLeft: depth === 0 ? 0 : 8,
      borderLeft: depth === 0 ? 'none' : `2px solid ${tokens.neutral200}`,
    }}>
      <Flex justifyContent="space-between" alignItems="center" style={{ padding: '2px 0' }}>
        <span style={{ fontFamily: tokens.monoFont, fontSize: 12 }}>
          {name === '*' ? <em style={{ color: tokens.warning }}>* (populate all)</em> : name}
        </span>
        <button type="button" onClick={() => onRemove(node.full)} title="Remove this path"
          style={{ border: 'none', background: 'transparent', color: tokens.danger,
            cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>×</button>
      </Flex>
      {childKeys.map((ck) => (
        <TreeNode key={ck} name={ck} node={node.children[ck]} depth={depth + 1} onRemove={onRemove} />
      ))}
    </Box>
  );
}

export default function PopulateBuilder({ value, onChange }) {
  const [paths, setPaths] = React.useState(() => populateToPaths(value));
  const [draft, setDraft] = React.useState('');
  const [error, setError] = React.useState('');
  const lastValueRef = React.useRef(value);

  React.useEffect(() => {
    if (lastValueRef.current !== value) {
      lastValueRef.current = value;
      setPaths(populateToPaths(value));
    }
  }, [value]);

  const emit = (nextPaths) => {
    setPaths(nextPaths);
    const obj = pathsToPopulate(nextPaths);
    lastValueRef.current = obj;
    onChange?.(obj);
  };

  const addPath = () => {
    const p = draft.trim();
    if (!p) return;
    if (p !== '*' && !PATH_RE.test(p)) {
      setError('Path must be dot-separated identifiers, e.g. "comments.author"');
      return;
    }
    if (paths.includes(p)) {
      setDraft('');
      return;
    }
    setError('');
    setDraft('');
    emit([...paths, p]);
  };

  const removePath = (target) => {
    emit(paths.filter((p) => p !== target));
  };

  const tree = pathsToTree(paths);
  const topKeys = Object.keys(tree);

  return (
    <Box>
      <Flex gap={1} alignItems="center">
        <input
          type="text"
          value={draft}
          placeholder="path (e.g. comments.author, or *)"
          onChange={(e) => { setDraft(e.target.value); if (error) setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPath(); } }}
          style={{
            flex: 1, padding: '4px 8px',
            border: `1px solid ${tokens.neutral300}`, borderRadius: tokens.radius,
            fontFamily: tokens.monoFont, fontSize: 12,
          }}
        />
        <button type="button" onClick={addPath} style={{
          padding: '4px 10px',
          background: tokens.primary, color: '#fff', border: 'none',
          borderRadius: tokens.radius, cursor: 'pointer', fontSize: 12, fontWeight: 600,
        }}>+ add</button>
      </Flex>
      {error && (
        <Typography variant="pi" textColor="danger700" paddingTop={1}>{error}</Typography>
      )}
      <Box paddingTop={2} style={{
        minHeight: 80, padding: 8,
        background: tokens.neutral100, borderRadius: tokens.radiusLarge,
        border: `1px solid ${tokens.neutral200}`,
      }}>
        {topKeys.length === 0 ? (
          <Typography variant="pi" textColor="neutral500">
            No populate paths. Add one above (e.g. <code>author</code>, <code>comments.author</code>, or <code>*</code> for all).
          </Typography>
        ) : (
          topKeys.map((k) => (
            <TreeNode key={k} name={k} node={tree[k]} depth={0} onRemove={removePath} />
          ))
        )}
      </Box>
    </Box>
  );
}
