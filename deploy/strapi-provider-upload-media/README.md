# strapi-provider-upload-media

Strapi (v4/v5) upload provider for the **Rutba standalone media service**
(`deploy/image-server`). Stores **only master files** on the service; Strapi's
responsive variants (`thumbnail_/small_/medium_/large_`) are **not uploaded** — the
service resizes the master on request. `formats` metadata still works, so no frontend
changes are needed, but disk only ever holds masters.

## Install

**Monorepo (pos-strapi / ERP):** make it a workspace package and depend on it.
```bash
# move/copy this folder to packages/strapi-provider-upload-media, then in pos-strapi:
#   "dependencies": { "strapi-provider-upload-media": "*" }
npm install
```
**Standalone (trustlist Strapi):** `npm pack` here and install the tarball, or publish to
a private registry / git, then `npm i strapi-provider-upload-media`.

## Configure — `config/plugins.js`
```js
module.exports = ({ env }) => ({
  upload: {
    config: {
      provider: 'strapi-provider-upload-media',
      providerOptions: {
        baseUrl: env('MEDIA_BASE_URL'),          // https://images.rutba.pk (or images.trustlist.uk)
        uploadToken: env('MEDIA_UPLOAD_TOKEN'),  // must equal the service's UPLOAD_TOKEN
        skipVariants: true,                      // recommended: store masters only
      },
      sizeLimit: env.int('UPLOAD_MAX_FILE_SIZE', 250 * 1024 * 1024),
    },
  },
});
```

## Allow the media domain in the admin CSP — `config/middlewares.js`
Strapi's security middleware restricts where images load from. Add the media host so
previews render in the admin:
```js
{
  name: 'strapi::security',
  config: {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'img-src':   ["'self'", 'data:', 'blob:', 'https://images.rutba.pk', 'https://images.trustlist.uk'],
        'media-src': ["'self'", 'data:', 'blob:', 'https://images.rutba.pk', 'https://images.trustlist.uk'],
      },
    },
  },
}
```

## Env
| Var | Purpose |
|---|---|
| `MEDIA_BASE_URL` | Public base URL of the media service |
| `MEDIA_UPLOAD_TOKEN` | Shared secret; equals the service `UPLOAD_TOKEN` |

## How it maps to the service
- `provider.upload(master)` → `PUT {baseUrl}/{hash}{ext}` (bytes stored).
- `provider.upload(variant)` (`small_…`) → no upload; `file.url = {baseUrl}/small_{hash}{ext}`.
  The service sees `small_…`, strips the prefix, finds the master, resizes to the `small`
  width, caches, serves.
- `provider.delete(file)` → `DELETE {baseUrl}/{hash}{ext}` (purges the master's cached variants).

## Keeping `formats` small

With resize-on-request, the master serves any size via `?w=`, so the stored `formats`
blob is mostly dead weight (some rows carry 4 variants × ~10 fields). Options, smallest first:

1. **Drop formats** — set `breakpoints: {}` in the upload config so Strapi stores no
   variant metadata (`formats = null`). Frontend builds `?w=` URLs (e.g. a Next.js
   `images.loader` that appends `?w=<width>`). Smallest DB, no upload-time resize CPU.
2. **Compact formats** — keep only `{ url, width, height }` per size, with
   `url = "<master>?w=<width>&fm=<ext>"`. ~70% smaller than the full blob; frontend keeps
   reading `formats[x].url` unchanged. Reduce the breakpoint count too (e.g. just
   `medium`) for fewer entries.

### Migration (existing rows) — DB-driven, provider-agnostic
Works for both the S3 layout (variants at root, `.webp`) and the local layout
(`/uploads/277/...`, custom `rutba.pk-<size>-` names) because it never parses variant
filenames — each `files` row already has the master `url` + each format's `width`:
```
for each row in files:
  copy/download the MASTER (row.url) → media service at the same key   # variants skipped
  row.url        = <mediaBase>/<key>                                   # absolute or keep relative
  row.formats    = compact: { size: { url: row.url + "?w="+width+"&fm="+ext, width, height } }
                   # or null to drop entirely
```
Only masters are stored; every old variant URL resolves to an on-the-fly resize.
