import React from 'react';
import { Box, Flex, Typography } from '@strapi/design-system';
import { tokens } from './tokens';

// KeyValueEditor — flat editor for bodyTemplate / queryTemplate.
//
// Renders rows of (key, value) pairs. Serializes to a plain object:
//   { owner: '$user.id', published: true, count: 5 }
//
// Values are typed as strings in the input but auto-coerced on serialize:
//   "$..."  → string (token, passes through to server-side resolver)
//   "true"/"false" → boolean
//   "42" / "3.14" → number
//   anything else → string
//
// `forbiddenKeys` are pre-defined keys that bypass coercion (e.g. fields/sort
// on a queryTemplate — those need dedicated editors). Defaults to none.

function coerceValue(raw) {
  if (typeof raw !== 'string') return raw;
  if (raw.startsWith('$')) return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (raw === '') return '';
  if (/^-?\d+$/.test(raw)) return Number(raw);
  if (/^-?\d*\.\d+$/.test(raw)) return Number(raw);
  return raw;
}

function uncoerce(value) {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function pairsToObject(pairs) {
  const out = {};
  for (const [k, v] of pairs) {
    const key = String(k || '').trim();
    if (!key) continue;
    out[key] = coerceValue(v);
  }
  return out;
}

export function objectToPairs(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).map(([k, v]) => [k, uncoerce(v)]);
}

export default function KeyValueEditor({
  value,
  onChange,
  keyPlaceholder = 'key',
  valuePlaceholder = 'value or $user.id',
  emptyHint = 'No fields. Add one below.',
}) {
  const [pairs, setPairs] = React.useState(() => objectToPairs(value));
  const lastValueRef = React.useRef(value);

  React.useEffect(() => {
    if (lastValueRef.current !== value) {
      lastValueRef.current = value;
      setPairs(objectToPairs(value));
    }
  }, [value]);

  const emit = (next) => {
    setPairs(next);
    const obj = pairsToObject(next);
    lastValueRef.current = obj;
    onChange?.(obj);
  };

  const setAt = (idx, kv) => {
    const next = pairs.slice();
    next[idx] = kv;
    emit(next);
  };
  const removeAt = (idx) => {
    const next = pairs.slice();
    next.splice(idx, 1);
    emit(next);
  };
  const addRow = () => emit([...pairs, ['', '']]);

  return (
    <Box>
      <Box style={{
        padding: 8, background: tokens.neutral100,
        borderRadius: tokens.radiusLarge, border: `1px solid ${tokens.neutral200}`,
      }}>
        {pairs.length === 0 && (
          <Typography variant="pi" textColor="neutral500">{emptyHint}</Typography>
        )}
        {pairs.map(([k, v], idx) => (
          <Flex key={idx} gap={1} alignItems="center" style={{ marginBottom: 4 }}>
            <input
              type="text" value={k} placeholder={keyPlaceholder}
              onChange={(e) => setAt(idx, [e.target.value, v])}
              style={{
                flex: '1 1 140px', padding: '4px 6px',
                border: `1px solid ${tokens.neutral300}`, borderRadius: tokens.radius,
                fontFamily: tokens.monoFont, fontSize: 12,
              }}
            />
            <span style={{ color: tokens.neutral500 }}>:</span>
            <input
              type="text" value={v} placeholder={valuePlaceholder}
              onChange={(e) => setAt(idx, [k, e.target.value])}
              style={{
                flex: '2 1 200px', padding: '4px 6px',
                border: `1px solid ${tokens.neutral300}`, borderRadius: tokens.radius,
                fontFamily: tokens.monoFont, fontSize: 12,
              }}
            />
            <button type="button" onClick={() => removeAt(idx)} title="Remove" style={{
              border: 'none', background: 'transparent', color: tokens.danger,
              cursor: 'pointer', fontSize: 14, padding: '0 4px',
            }}>×</button>
          </Flex>
        ))}
      </Box>
      <Box paddingTop={1}>
        <button type="button" onClick={addRow} style={{
          padding: '4px 10px',
          border: `1px solid ${tokens.primary}`, color: tokens.primary, background: '#fff',
          borderRadius: tokens.radius, cursor: 'pointer', fontSize: 12, fontWeight: 600,
        }}>+ add field</button>
      </Box>
    </Box>
  );
}
