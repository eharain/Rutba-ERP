import React from 'react';
import { tokens, TYPE_COLORS } from './tokens';

// Tiny coloured pill for field-type labels (used by FieldsPicker / PopulateBuilder
// once they land). Kept separate from tokens.js so the constants file stays JSX-free.

export default function TypeBadge({ type }) {
  const color = TYPE_COLORS[type] || tokens.neutral500;
  return (
    <span style={{
      background: `${color}1a`, color, padding: '1px 5px', borderRadius: 8,
      fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
      fontFamily: tokens.monoFont,
    }}>
      {type || '?'}
    </span>
  );
}
