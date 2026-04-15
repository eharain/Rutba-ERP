#!/usr/bin/env node
'use strict';

/**
 * scripts/next-config-base.js — Shared Next.js configuration factory
 *
 * Centralises the common config that every Next.js app in the monorepo needs:
 *   • NEXT_BUILD_OUTPUT  →  output   (conditional — omitted when env var is absent)
 *   • Default image remotePatterns derived from NEXT_PUBLIC_API_URL
 *   • transpilePackages: ['@rutba/pos-shared']
 *
 * BUILD_DEST_DIR is NOT mapped to distDir because Next.js/Turbopack forbids
 * distDir outside the project directory.  Instead, run-app.js copies the
 * build output to BUILD_DEST_DIR/<app> after each successful build.
 *
 * Usage (from any app's next.config.js):
 *
 *   const { createNextConfig } = require('../scripts/js/next-config-base');
 *   module.exports = createNextConfig({ experimental: { ... } });
 */

// ── helpers ────────────────────────────────────────────────

/**
 * Deduplicate a list of URLs into Next.js `images.remotePatterns` entries.
 *
 * @param {string[]} urls
 * @returns {import('next').NextConfig['images']['remotePatterns']}
 */
function generateRemotePatterns(urls) {
  const seen = new Set();

  return urls
    .map((u) => {
      try {
        const { hostname, protocol, port } = new URL(u);
        const key = `${protocol}//${hostname}:${port || ''}`;
        if (seen.has(key)) return null;
        seen.add(key);

        return {
          protocol: protocol.replace(':', ''),
          hostname,
          port: port || undefined,
          pathname: '/**',
        };
      } catch {
        return null;
      }
    })
    .filter((f) => f?.hostname);
}

// ── default remote-pattern URLs ────────────────────────────

const DEFAULT_IMAGE_URLS = [
  'http://localhost:4010/uploads/abc.jpg',
  'http://127.0.0.1:4010/uploads/xyz.png',
  process.env.NEXT_PUBLIC_API_URL,
];

// ── config factory ─────────────────────────────────────────

/**
 * Build a Next.js config by merging workspace-wide defaults with per-app
 * overrides.  Supports a single level of deep-merge for `images` and
 * `experimental` so callers can extend rather than replace those objects.
 *
 * @param {import('next').NextConfig} [overrides]
 * @returns {import('next').NextConfig}
 */
function createNextConfig(overrides = {}) {
  const base = {
    reactStrictMode: true,
    ...(process.env.NEXT_BUILD_OUTPUT ? { output: process.env.NEXT_BUILD_OUTPUT } : {}),
    transpilePackages: ['@rutba/pos-shared'],
    images: {
      remotePatterns: generateRemotePatterns(DEFAULT_IMAGE_URLS),
    },
  };

  // Shallow-merge top-level, deep-merge known nested objects
  const { images, experimental, transpilePackages, ...rest } = overrides;

  const merged = { ...base, ...rest };

  // images — deep-merge (override replaces individual keys)
  if (images !== undefined) {
    // Allow images: false to remove the section entirely (e.g. pos-auth)
    if (images === false) {
      delete merged.images;
    } else {
      merged.images = { ...base.images, ...images };
    }
  }

  // experimental — deep-merge
  if (experimental) {
    merged.experimental = { ...(base.experimental || {}), ...experimental };
  }

  // transpilePackages — override replaces the array
  if (transpilePackages) {
    merged.transpilePackages = transpilePackages;
  }

  return merged;
}

module.exports = { createNextConfig, generateRemotePatterns };
