# Video Studio v2 — layers, editing, customization

**Status:** planned · 2026-08-11
**Builds on:** `packages/video-maker` (shared renderer), rutba-social Video Studio +
Audio Library, Social Poster unattended generation — all shipped 2026-08-10.

## Where this starts from

The image-to-video pipeline works end to end: an image-only post becomes a
1080p H.264 video with the post text typed over a slideshow, the site logo,
and a music bed from the shared audio library — rendered by the same
dependency-free module (`packages/video-maker`) in the Video Studio and in the
Social Poster's hidden window, attached to the post so it renders once.

What it is NOT yet is *editable*. The look is one hardcoded pipeline —
backdrop → images → caption box → title card → logo → footer → progress bar —
with knobs (`DEFAULTS` in the renderer) but no ability to add, remove, move,
restyle or retime anything. Settings are per-browser (`localStorage`), so a
render is not reproducible from the post, and the poster can't honour choices
made in the studio. This plan turns the fixed pipeline into a layered,
templated, per-post-customizable editor without changing the engine (canvas +
MediaRecorder, real-time, no ffmpeg).

## Do FIRST, while Strapi can still create tables

Core serves the routes but has no DDL of its own; every table still comes from
booting Strapi against a changed `schema.json` — and Strapi is being retired.
Everything below that needs storage must have its schema landed and booted
**now**, even though the features come later:

1. **`social-video-template`** (new collection): `name`, `description`,
   `layers` (json), `options` (json), `aspect`, `is_default` (bool),
   `preview_image` (media), `tags` (json). CRUD-only, same seeding path as
   `social-audio-track` (descriptor → `npm run seed -- --only=api-provider,up-permissions`).
2. **`social-post.video_settings`** (json, nullable): the template documentId
   plus per-post overrides — the exact recipe that produced the attached
   video, so a re-render is reproducible and the poster renders what the
   studio chose.
3. While in there: **`social-audio-track.start_offset`** (decimal, nullable) —
   a chosen start point in the track (M6 uses it; the column is cheap now and
   impossible after retirement).

One Strapi boot + one seed run covers all three. Everything else in this plan
is JS in the renderer and the two apps, deployable at any time.

## Architecture: options → layer stack

### M1 — scene graph inside the renderer (no visible change)

`buildPlan` today returns a fixed structure and `paintFrame` hardcodes the
draw order. Restructure to:

```js
plan.layers = [
  { type: 'backdrop',  ... },                       // blurred fill / solid
  { type: 'slideshow', images, slots, fit, motion } // the image reel
  { type: 'gradient',  ... },                       // caption legibility
  { type: 'caption',   text, box, anim: 'typewriter', ... },
  { type: 'title',     ... },
  { type: 'image',     src: logo, anchor, scale, opacity },  // logo = image layer
  { type: 'text',      ... },                       // footer = plain text layer
  { type: 'progress',  ... },
]
```

- One painter per layer type, dispatched in stack order; `paintFrame` becomes
  a loop. Every painter is pure in `t`, exactly as today.
- Each layer carries: `id`, `type`, `visible`, `timing` {start, end | full},
  `anchor` + fractional position/size (resolution-independent, so a template
  renders correctly at any aspect), `opacity`, `anim` (none | fade | slide |
  typewriter | kenBurns) with in/out durations.
- **Legacy options compile into this default stack** — `buildPlan({options})`
  keeps working unchanged, so the poster and existing studio code never
  notice the refactor. This is the compatibility line: options are sugar,
  layers are truth.
- Verification: the standalone harness renders the same fixture post before
  and after; frame probes (corner pixels, caption band, logo corner) match.

### M2 — templates + per-post settings

- **Template = layer stack + options, stored server-side**, shared by both
  hosts. Ship 3 built-ins that reproduce today's looks (seeded rows): *Classic*
  (bottom caption), *Card* (centered), *Minimal* (no box, drop-shadow text).
- Studio: template picker (with `preview_image` thumbs); "Save as template"
  from the current state (admin only).
- Chosen template + overrides persist to `social-post.video_settings` on
  render/attach. Re-opening a post restores its recipe; settings stop living
  in `localStorage` (kept only as the "last used" default for new posts).
- **Poster:** unattended renders use `video_settings` when the post has one,
  else the `is_default` template. This is the parity contract — the studio
  preview IS what the poster produces.

### M3 — the editor v1 (layer panel + direct manipulation)

- **Layer panel**: list in stack order; reorder (drag), toggle visibility,
  delete, duplicate; add-layer menu (text, image/watermark, shape, sticker).
- **Select-and-drag on the preview canvas**: hit-test layers at the click
  point, drag to move, corner handles to scale. The preview canvas already
  repaints per interaction; hit-testing is rectangle math on the layer boxes.
- **Text layers, plural**: content, font (curated system-safe list first —
  Segoe/Roboto/serif/mono; bundled webfonts later via `document.fonts`),
  size, weight, color, background pill on/off, alignment, per-layer animation
  (type-on / fade / slide), timing (e.g. only over images 2–3).
- **Caption layer options**: everything text layers get, plus the existing
  typewriter controls; optional per-paragraph reveal instead of per-character.
- **Per-image control** on the slideshow layer: reorder, exclude, per-image
  duration, per-image focal point (drag the image inside its frame — drives
  both `cover` crops and Ken Burns center).
- **Urdu/RTL**: `ctx.direction`/alignment flip per text layer + wrap test with
  Urdu fixtures. The catalogue is Pakistani fashion; captions will not stay
  Latin-only. (Canvas shaping itself comes from the OS — verify on Windows.)

### M4 — transitions + outro

- Transition per image boundary (or one global): crossfade (today), cut,
  slide, push, zoom-through. Implemented in the slideshow painter.
- **Outro card layer**: logo + line + site URL (from site-settings), default
  1.5s, on the built-in templates. Ends every video on brand instead of a
  hard stop.
- Intro/outro fade controls (the current fixed 0.45s edge dips become layer
  timing).

### M5 — commerce layers (the ERP payoff)

Posts already link `products` (m2m). Layers that read them:

- **Price badge**: price / sale price pulled from the linked product at render
  time; positions like any sticker. Discount % variant.
- **QR layer**: QR to the product's storefront URL (`site_url` +
  slug — the storefront-sellable gate already guarantees the page renders).
  Ties into `docs/todo/barcode-qr-deep-link.md`.
- **Sticker set**: NEW / SALE / "Free delivery over Rs 5,000" text chips as
  styled presets, no image assets needed.

These make unattended TikTok videos *sell*, not just exist — and none of them
require new server surface beyond what M2 stored.

### M6 — audio polish

- Per-post track choice in `video_settings` (today: pick applies studio-wide;
  random is the unattended default).
- **Start-point picker**: a simple waveform strip (decode → peaks → canvas),
  click to set `start_offset`; poster honours it, `audioRandomStart` remains
  the fallback.
- Stretch, not committed: image cuts snapped to beats (energy peaks from the
  decoded buffer). Only if M1–M5 land clean.

## What stays out

- **No ffmpeg / server-side rendering.** The browser-engine recorder is the
  engine; anything it can't do (frame-accurate export, >60fps, alpha video)
  is out of scope for this program.
- **No freeform timeline editor** (CapCut-style multi-track scrubbing).
  Layers have simple in/out timing, not keyframes.
- **No per-platform re-renders** (one video per post; aspect stays a
  per-template/per-post choice).

## Sequencing & verification

| Milestone | Surface | Risk | Verify with |
|---|---|---|---|
| M0 schema now | Strapi + seed | low | table/columns exist; routes 200 after core restart |
| M1 scene graph | `packages/video-maker` only | medium (regression) | harness A/B frame probes, both hosts |
| M2 templates | CT + studio + poster | low | poster renders a post's `video_settings` byte-consistent with studio |
| M3 editor v1 | studio UI | medium (UX scope) | fixture posts per layer type; Urdu fixture |
| M4 transitions/outro | renderer + studio | low | harness probes at boundary times |
| M5 commerce | studio + renderer | low | badge/QR pixels probed; QR decodes |
| M6 audio | audio lib + studio + poster | low | decode-back offset check (existing harness pattern) |

Each milestone keeps the two-host contract: **anything the renderer learns
must work in a page and in the hidden Electron window** — timer-paced loop,
explicit `requestFrame`, `createImageBitmap`, media via injected transport.
The standalone HTML/Electron harnesses from the v1 work are the regression
rig; keep them in `scratchpad` form until M1, then check a trimmed pair into
`packages/video-maker/test/`.

## Open questions (decide at M2, none block M0/M1)

- Template scope: global only, or per-app rows like site-settings?
- "Save as template" role gate: `social_admin` only, or manager too?
- Bundled webfonts: ship 2–3 licensed fonts in the package, or media-library
  fonts with `FontFace` loading? (Affects offline poster renders.)
