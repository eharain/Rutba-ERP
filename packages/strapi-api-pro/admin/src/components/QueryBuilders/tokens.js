// Design tokens for QueryBuilder components.
//
// Plain JS object (no JSX, no Strapi theme dependency) so the components can
// import and render even when the symlinked plugin can't reach
// @strapi/design-system theme providers. Colors picked to match Strapi v2's
// neutral palette.

export const tokens = {
  primary: '#4945ff',
  primaryHover: '#3935e3',
  primaryLight: '#e8eaf6',
  danger: '#d02b20',
  dangerLight: '#fcecea',
  success: '#1f8a45',
  warning: '#b76b00',
  warningLight: '#fff3e0',
  neutral100: '#fafafa',
  neutral200: '#f0f0f4',
  neutral300: '#e0e0e8',
  neutral500: '#888894',
  neutral700: '#454552',
  neutral900: '#1c1c2a',
  radius: 4,
  radiusLarge: 8,
  monoFont: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
};

// Type → color pill mapping for field badges (consumed by TypeBadge.jsx).
export const TYPE_COLORS = {
  string: '#4945ff',
  text: '#4945ff',
  uid: '#4945ff',
  email: '#4945ff',
  password: '#888894',
  integer: '#1f8a45',
  decimal: '#1f8a45',
  float: '#1f8a45',
  biginteger: '#1f8a45',
  boolean: '#b76b00',
  date: '#9b59b6',
  datetime: '#9b59b6',
  time: '#9b59b6',
  timestamp: '#9b59b6',
  json: '#666',
  enumeration: '#d02b20',
  relation: '#0070f3',
  component: '#00a3a3',
  dynamiczone: '#00a3a3',
  media: '#0070f3',
};
