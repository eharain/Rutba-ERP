import React from 'react';

// Inline SVG instead of `import { Shield } from '@strapi/icons'`.
//
// Why inline: this plugin is consumed via a `file:` symlink from the monorepo's
// packages/ directory. Vite (used by Strapi's admin) resolves imports from the
// SYMLINK TARGET, so `@strapi/icons` (listed only as a peerDependency on the
// plugin) is looked up in packages/api-pro/node_modules â€” which doesn't
// have it â€” even though the consuming app's node_modules does. Inlining sidesteps
// the cross-tree resolution entirely.
//
// The path is a stylised "API shield" â€” visually similar to @strapi/icons Shield
// but drawn directly so we don't depend on the external module.

const PluginIcon = ({ width = 16, height = 16, ...rest }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={width}
    height={height}
    viewBox="0 0 32 32"
    fill="currentColor"
    aria-hidden="true"
    {...rest}
  >
    <path d="M16 2 4 6v9.2c0 6.7 4.7 12.6 12 14.8 7.3-2.2 12-8.1 12-14.8V6L16 2Z" />
    <path
      fill="#fff"
      d="M10.3 18.5 13 13.4l1.7 3.2-1.4 2.6-3-.7Zm5 .9-1.4-2.6 2.4-4.5 2.4 4.5-1.4 2.6-2 .8-.0-.8Zm6.7-.9-3 .7-1.4-2.6 1.7-3.2 2.7 5.1Z"
    />
  </svg>
);

export default PluginIcon;
