# Rutba media server — masters-only, resize-on-request, LRU cache

A Node.js media origin for `images.rutba.pk` (reusable for `images.trustlist.uk`),
built for **Hostinger Node.js hosting** (Business Web Hosting, `77.37.37.27`).

**Why:** Strapi pre-generates `thumbnail_/small_/medium_/large_` variants for every
image — e.g. 5,428 originals → ~30k files / 4.9 GB. This server keeps **only the master
files** and **resizes on request**, caching hot variants with **LRU rotation**, so disk
stays small.

## How it works
- **`MASTER_DIR`** — originals only (source of truth).
- **`CACHE_DIR`** — generated variants; size-capped (`CACHE_MAX_BYTES`), least-recently-used
  files evicted to ~80% when full. Every cache hit "touches" the file → true LRU.
- Resize via **`sharp`**; never upscales; preserves aspect ratio. Videos / SVG / non-raster
  files stream straight from `MASTER_DIR` with **HTTP Range** (seeking), never resized.
- CORS `*`, `Cache-Control: immutable`, path-traversal protected, HEAD/OPTIONS/`/_health`.

## Request styles (both supported)
- **Query params** (modern):
  `/<path>?w=300&h=300&fit=cover&q=80&fm=webp`
  - `w`,`h` px (one or both); `fit` = `inside|cover|contain|outside|fill` (default `inside`)
  - `q` 1–100 (default 80); `fm` = `jpeg|png|webp|avif|auto` (`auto` honors `Accept`)
- **Strapi-compatible prefixes** (drop-in for existing URLs):
  `/uploads/small_<name>.jpg` → resizes master `/uploads/<name>.jpg` to the `small` width.
  Prefix→width map (default): `thumbnail=245, small=500, medium=750, large=1000`
  (override via `VARIANTS` env, JSON).
- **No params** → master served as-is.

## Files
```
deploy/image-server/
├── server.js      # the server
├── package.json   # deps: sharp; start: node server.js; node>=18
├── README.md
└── public/        # MASTER_DIR by default — put ORIGINAL files here
```

## Deploy on Hostinger (hPanel → Node.js app)
1. **hPanel → `images.rutba.pk` → Node.js** (Setup Node.js App).
2. **Node 18+**, **startup file `server.js`**, **app root** = your upload folder, URL `images.rutba.pk`.
3. Upload `server.js` + `package.json`; click **Run NPM Install** (installs `sharp`).
4. Put **original** files in `public/` (or set `MASTER_DIR`). Create nothing for the cache — it's auto-made.
5. **Start/Restart**. Hostinger sets `PORT` and proxies the domain.

Verify:
```
curl -I  https://images.rutba.pk/_health
curl -sI 'https://images.rutba.pk/<name>.jpg?w=300&fm=webp'   # 200 image/webp
curl -r 0-1023 -sD - -o /dev/null https://images.rutba.pk/<name>.mp4  # 206
```

## Env config
| Var | Default | Purpose |
|---|---|---|
| `PORT` | (Hostinger) | listen port |
| `MASTER_DIR` | `./public` | originals dir (`MEDIA_DIR` also accepted) |
| `CACHE_DIR` | `./.cache` | variant cache dir |
| `CACHE_MAX_BYTES` | `1073741824` (1 GiB) | cache cap before LRU eviction |
| `IMAGE_QUALITY` | `80` | default output quality |
| `MAX_DIM` | `4000` | max requested width/height |
| `VARIANTS` | `{"thumbnail":245,"small":500,"medium":750,"large":1000}` | Strapi prefix→width |
| `CORS_ORIGIN` | `*` | restrict if desired |

## Migration / integration (next steps)
- Copy **only masters** from the VPS Strapi uploads to `MASTER_DIR` — i.e. exclude
  `thumbnail_* small_* medium_* large_*`. That alone drops the file count from ~30k to ~5.4k.
- Point the apps' image origin at this host (`NEXT_PUBLIC_IMAGE_URL=https://images.rutba.pk`,
  Strapi upload `PUBLIC_URL`/provider) so `…/uploads/small_x.jpg` and `?w=` both resolve here.
- Optionally disable Strapi's responsive-breakpoint generation so new uploads store the master only.
