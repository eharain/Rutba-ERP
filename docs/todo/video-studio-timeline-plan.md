# Video Studio v3 — everything is a layer, on a timeline

**Status:** BUILT — T1–T5 complete, all gates green · 2026-08-11
**Checkpoint:** started from ERP `90e15fa` / poster `bd696e6` (v2 M0–M6).
T1 `1249f12` · T2 `ca421f1` · T3 `5c9b713` (ERP); T4 `bb3aa06` (poster).
**Builds on:** `docs/todo/video-studio-editor-plan.md` (v2 — layers, templates,
editor, transitions, commerce, audio start points).

**How the gates were proven** (all repeatable):
- **A/B rig** `packages/video-maker/harness/` — `serve.cjs` materializes the
  `90e15fa` baseline from git and serves it beside the working tree;
  `ab.html` paints five legacy looks × 12 stamps through both and
  byte-compares (a GPU-flake repaint rule: a mismatch only counts if a fresh
  repaint of both sides still differs). Poster `tools/ab-check.js` runs the
  same page in a hidden Electron window. 60/60 identical in BOTH hosts, and
  the sound probe (two overlapping clips, Goertzel on the decoded file) 6/6.
- **T2 rig** `rutba-social/pages/dev/timeline-fixture.js` (no auth, no
  network) driven by poster `tools/t2-check.js` with real input events in a
  visible Electron window (a hidden page never hydrates Next — rAF freeze):
  retime probe 14/14, move/trim/scrub/duplicate/delete/zoom 8/8.
- **T3 rig** poster `tools/t3-check.js`: no horizontal page scroll at
  1366×768, fit and 4× zoom.
- **T4 rig** poster `tools/t4-check.js`: synthetic recipe (BMP/WAV bytes)
  with two sound layers + a duplicated logo through the real rutba-vm://
  hidden-window pipeline — clips land at their instants, missing tracks
  degrade. 11/11.

**Still owed a human eye:** one pass over the real studio
(`/posts/video-studio?post=…`, needs a session) to confirm the T3 layout
feels right with real posts — the automated layout gate ran on the fixture.

## The one idea

**Everything that appears or is heard in the video is a layer.** A photo is a
layer. The caption is a layer. The logo is a layer. A price chip, a QR code,
the title card, the outro, the progress bar — layers. **Music is a layer.**

Every layer has the same five things, and the editor is nothing more than a
view onto them:

| | |
|---|---|
| **order** | z-index — what paints over what |
| **timing** | when it starts and when it stops, on the video's own clock |
| **entry / exit** | how it arrives and how it leaves (fade, slide, zoom, cut) |
| **geometry** | where it sits and how big it is (fractional, so any aspect works) |
| **state** | visible or hidden, and a name you can read |

Today the studio has *some* of this, scattered: photos are welded inside one
slideshow layer, music is a single bed bolted onto the recorder, timing is a
pair of number boxes buried in a right-hand rail, and there is no z-order,
no duplication, and no way to see when anything happens. This plan makes the
model uniform and then puts a **timeline under the video** where every layer
is one lane, its bar sized by duration and placed by start time.

## The layer contract

One record, every type. Extra keys are type-specific; the envelope never
varies.

```js
{
  id: 'photo-3',
  type: 'photo'|'caption'|'text'|'image'|'qr'|'sound'|'gradient'|'title'|'outro'|'progress'|'edges',
  name: 'Photo 3',                       // editable, shown on the lane
  visible: true,
  z: 30,                                 // paint order (sounds ignore it)
  timing: { start: 2.4, end: 6.8 },      // null = the whole video
  enter:  { kind: 'fade', seconds: 0.4 },
  exit:   { kind: 'fade', seconds: 0.4 },
  fx, fy, fw, sizeFrac,                  // fractional geometry, where it applies
  ...typeSpecific                        // text/color/src/trackId/offset/volume…
}
```

- **Fractional geometry stays the rule** — one recipe renders at any aspect.
- **`enter`/`exit` are painter-agnostic.** Fades scale `globalAlpha`, slides
  translate, zoom scales — applied around the painter, so every layer type
  gets them without its painter knowing. (The existing text-layer `anim` key
  becomes the compiled form of `enter`; one mechanism, not two.)
- **Unknown types keep round-tripping.** A recipe from a newer renderer
  degrades to "that layer doesn't draw", never to a broken video. Unchanged
  from v2.

### What becomes a layer

| Today | After |
|---|---|
| `slideshow` — one layer holding all images, cross-fade inside the painter | one **`photo`** layer per image; the crossfade is photo N's `exit` overlapping photo N+1's `enter` |
| `options.transition` (global fade/cut/slide/push/zoom) | the **default** `enter`/`exit` the compiler writes onto each photo — still settable globally, now overridable per photo |
| `options.perImageSeconds` + `imageArrangement` | each photo's `timing` and lane order; "excluded" is just `visible: false` |
| the music bed (`renderVideo({audio})`, one track, whole video) | a **`sound`** layer with `timing`, `offset` into the track, `volume`, and fades as `enter`/`exit` — and there can be **more than one** |
| logo, footer, caption, title, outro, progress, edges | unchanged in kind, but now carry `z`, `name`, `enter`/`exit` and appear as lanes |

The compiler (`compileLayers`) remains the bridge: legacy options compile into
this stack, so **existing posts, templates and the poster keep working
untouched**. Options are sugar; layers are truth.

## The timeline

Layout — the canvas stops being flanked, and the rail's contents move under it:

```
┌──────────────────────────────┬──────────────────┐
│                              │                  │
│        video canvas          │    inspector     │   ← rail = properties of
│        (centred, ~52vh)      │    (340px)       │     the SELECTED layer;
│                              │                  │     nothing selected =
├──────────────────────────────┴──────────────────┤     properties of the VIDEO
│  ▶  0:04.2 / 0:18.0        [fit] [2×] [4×]      │     (look, render, attach)
├────────────┬────────────────────────────────────┤
│ 0:00       │    0:05      0:10      0:15   0:18 │   ← ruler: the whole video,
├────────────┼────────────────────────────────────┤     start + finish markers
│ 👁 Caption │      ▐███████████████████▌         │
│ 👁 Price   │              ▐████▌                │   ← one lane per layer,
│ 👁 Photo 3 │              ▐███████▌             │     bar = when it is on
│ 👁 Photo 2 │       ▐███████▌                    │     screen; handles at both
│ 👁 Photo 1 │  ▐███████▌                         │     ends; ramps drawn at
│ 🔊 Music   │  ▐██████████████████████████████▌  │     the bar's ends
└────────────┴────────────────────────────────────┘
```

- **The ruler is the whole video**, 0 → duration, with the start and finish
  markers. Every lane is measured against it, so "when does this appear" is
  read by eye, not computed.
- **A lane is a range slider.** Drag the bar to move the layer in time; drag
  either end to trim. Both write `timing` — the same structure `video_settings`
  and templates already persist.
- **Entry/exit ramps draw as wedges** at the bar's ends, sized by their
  seconds, so an overlap between two photos is visible as overlapping wedges.
- **Lane header**: eye (show/hide), name, type icon, duplicate, delete, and a
  drag handle that reorders — **reordering the lanes IS the z-order**. Top lane
  paints last (on top), matching how the layer list already reads.
- **Sort buttons**: by z, by entry time, by exit time. Sorting by time is a
  *view*, not a rewrite — it never silently changes what paints over what.
- **Zoom**: fit / 2× / 4× with horizontal scroll, for long videos.
- **The playhead** is shared with the preview scrubber: click the ruler to
  scrub, and the canvas repaints at that instant (it already paints purely
  from `t`).

### Entry and exit methods

Offered per layer, defaulting to what the layer's type does today:

| kind | what it does |
|---|---|
| `none` / cut | appears and disappears hard |
| `fade` | alpha ramp (the default for photos, chips, captions) |
| `slide-up` / `slide-down` / `slide-left` / `slide-right` | translate in/out |
| `zoom` | scale in from oversized / out |
| `push` | translate in while pushing the layer below out (photos) |
| `type-on` | per-character reveal (text and caption only) |

Each carries its own seconds. **Overlap is expressed by timing, not by a
special mode**: two photos overlap because their windows overlap, and the
result is a crossfade if both use `fade`, a push if the incoming uses `push`.
This is exactly how the current slideshow painter already behaves — the
refactor makes it explicit instead of implicit.

### Duplication

Every lane has a duplicate button. It copies the layer's full record under a
new id, nudges `timing` forward, and selects the copy. That covers both things
you asked for:

- **the same thing reappearing later** — duplicate, then drag the copy down
  the timeline;
- **the same thing behaving differently** — duplicate, then change the copy's
  entry/exit, size or position.

Mechanically a duplicate is an **append patch**, which means the persistence
format must learn to append the types that today can only be patched: `image`
(a second logo/watermark), `photo` (the same picture twice), `sound`, and
`caption`. That is the one real extension to the stored format, and it is
additive — old recipes stay valid.

## Sound as layers

A `sound` layer is `{ trackId, url, timing, offset, volume, enter, exit }`:
`timing.start` places it in the video, `offset` is where inside the track it
starts (the `start_offset` from the Audio Library is the default), and the
fades are its entry/exit. It does not paint; the recorder collects it.

`renderVideo` grows a multi-clip audio path: each sound layer gets its own
`BufferSource` + `GainNode` into the single `MediaStreamDestination`, scheduled
with `source.start(when, offset, duration)` and its own gain envelope. The
existing single-bed call form keeps working unchanged (it becomes a one-clip
array internally), which is what protects the poster and every stored recipe.

This is what makes a voice-over track over a music bed possible later, without
another engine change.

## Persistence and poster parity

Nothing new server-side. The recipe in `social-post.video_settings` and in
`social-video-template.layers` is the same shape it is today —
patch-by-id plus appends — with the envelope keys (`z`, `name`, `enter`,
`exit`) and the new appendable types riding along inside it.

The parity contract holds: **what the studio previews is what the poster
renders**. The poster resolves sound layers the way it already resolves the
bed — look up the track in the library, fetch bytes in the main process, hand
them to the hidden window — and falls back to random/no-music when a
referenced track has left the library, rather than dropping the render.

## Milestones

Each one ends deployable, and each keeps the two-host contract: **anything the
renderer learns must work in a page and in the hidden Electron window.**

### T1 — the renderer speaks one model

1. Universal envelope on every compiled layer: `name`, `z`, `timing`,
   `enter`, `exit`. Paint order = `z` ascending, with compile order as the
   default `z` so nothing moves.
2. `applyLayerEnvelope` around each painter — fade/slide/zoom in and out,
   painter-agnostic.
3. **Photos become layers.** `compileLayers` emits one `photo` per image with
   `timing` = the slot it holds today and `enter`/`exit` = the transition;
   the first photo gets `enter: none` and the last `exit: none` (exactly the
   `i > 0` / `i < n-1` guards inside the current painter). `paintPhoto` is
   the body of today's loop, unchanged — including the index it needs for the
   alternating Ken Burns direction.
4. **Sounds become layers** + multi-clip mixing in `renderVideo`; the
   single-bed form still accepted.
5. Appendable types extended to `image` / `photo` / `sound` / `caption` for
   duplication.

*Gate:* the A/B harness — three legacy looks × ten timestamps, byte-identical
before and after, in both hosts. Plus a new probe: two overlapping sound clips
land in the file at the right instants.

### T2 — the timeline panel

Ruler, playhead, lanes, bars with move/trim, entry/exit wedges, show/hide,
duplicate, delete, reorder-as-z, sort views, zoom. Writes only `timing`, `z`,
`visible` — i.e. only layer patches.

*Gate:* fixture post per layer type; a retimed layer's video matches its
preview at the same instants.

### T3 — the layout move

Canvas top-centre with the inspector beside it; the timeline full-width
underneath. The current right-rail cards dissolve:

- **Layers list** → the lanes.
- **Image strip** (order / exclude / seconds / focal) → photo lanes + inspector.
- **Music card** → "add a sound layer" picker + sound lanes; the library itself
  stays on `/audio`.
- **Timing card** (seconds per image, crossfade, edge fades) → still global,
  in the video inspector, but now every one of them is also directly
  draggable on a lane.
- **Look / Logo / Caption / Render / Attach** → the video inspector (shown
  when no layer is selected).

*Gate:* the whole editor is usable at 1366×768 without a horizontal scrollbar.

### T4 — poster parity

Sound layers and the new appendable types resolved in unattended renders;
missing tracks degrade rather than fail.

*Gate:* a post whose recipe has two sound layers and a duplicated logo renders
in the poster's hidden window with both, matching the studio.

### T5 — verify, document, commit

swc parse + page compile + poster `node --check` + an end-to-end Electron
render; update this doc, `docs/todo/video-studio-editor-plan.md` and memory;
commit both repos.

## Invariants — none of these may break

- The engine rules that were paid for in bugs: timer-paced loop,
  `captureStream(0)` + explicit `requestFrame()`, `createImageBitmap`, the
  primer recording **its own** canvas, stopping audio at the last frame,
  destroying the Electron window on a later tick.
- `paintFrame(ctx, plan, t)` stays **pure in `t`** — the preview scrubber and
  the recorder must remain the same code path.
- Legacy options compile to pixel-identical output.
- Recipes are additive; a v2 recipe renders correctly on a v3 renderer.
- Fractional geometry — no stored pixels.

## What stays out

- **No keyframes.** Layers get timing and an entry/exit treatment, not
  animation curves.
- **No ffmpeg / server-side rendering.** The browser recorder remains the
  engine.
- **No nested groups / compositions.** One flat stack of lanes.
- **No per-platform re-renders.** One video per post.

## Standing items — CLEARED 2026-08-11

- ~~`video-studio.js` uncommitted~~ — landed as `97249ae` (social work) and
  `f5f5a81` (short links) before T1 began.
- ~~Core :4020 restart for `/api/social-video-templates`~~ — probed mounted
  (401 with the auth gate, vs 404 for a nonexistent route); already restarted.
