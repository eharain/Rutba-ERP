# Video Studio v4 — geometry in hand, motion on the clock

**Status:** M1+M2 BUILT · 2026-08-11 — geometry (ERP 265964c) and keyframes (ERP ea6aed3), all gates green: fixture suite 11/11 (retime 14, geometry 5, keyframes 4, interactions), A/B rig 60/60 byte-identical + 6/6 sound in both hosts. M5 (video clips as layers) BUILT ahead of schedule — ERP eb82c63 / poster 620531b: one clip = two lanes (video + sound on the same url), library picker with upload, poster parity; t4-check 18/18 incl. the tone-change-on-schedule proof of real-time playback in the hidden window. M3/M-AI remain planned.
**Builds on:** v3 (`docs/todo/video-studio-timeline-plan.md`, BUILT — everything
is a layer with one envelope, on a timeline of lanes).
**This plan carries two things:** a competitive review of where the studio
stands and what is worth building next, and the full design for the two
capabilities the review ranks highest — **sizing/moving layers by hand on the
canvas**, and **sizes and positions that vary along the timeline** (the
keyframes v3 deliberately excluded).

---

## 1 · Where the studio stands

What exists after v3, for calibration against the field:

- stills → 1080p H.264/WebM in the browser, real-time, zero dependencies,
  one renderer in two hosts (studio page + poster's hidden window)
- every visual and audible thing is a layer with one envelope (z, timing,
  enter/exit, fractional geometry, state); timeline lanes edit it
- commerce truth no one else has: `{price}`/`{discount}`/`{url}` tokens
  resolved fresh from the ERP at render time, QR + `/s/` short links,
  captions written from product data
- templates, themes, transitions, Ken Burns, typewriter captions with
  RTL/Urdu, music library with per-track start points, multi-clip sound
  layers, unattended batch rendering in the poster
- drag-to-MOVE on canvas for text/logo/QR (writes fractions); SIZE only via
  inspector sliders; no rotation; photos always fill the stage; nothing
  animates between its enter and its exit

## 2 · The field

Four families of competitor matter, each for a different reason.

### 2a · Pro-sumer social editors — CapCut, VN, InShot
The benchmark for "editor feel". CapCut's core kit: **keyframes on position /
scale / rotation / opacity**, speed ramps, chroma key, motion tracking,
auto-captions (Pro-gated since 2026), TTS, background removal, templates, and
an AI auto-edit suite. TikTok integrates it deeply; a merchant who has used
CapCut expects to grab a corner handle and to see diamonds on a track.

**Takeaway:** corner handles + rotation + keyframes are table stakes — and
they are exactly §4/§5 of this plan. Speed ramps, motion tracking and chroma
key are skipped: high engine cost, low commerce value for product slideshows.

### 2b · AI commerce-video generators — Creatify, HeyGen, PixVerse, Zeely
Creatify turns a product-page URL into a finished ad (script, voice-over, AI
presenter); HeyGen leads on avatars + 175-language localization; PixVerse on
image→video generation; Zeely bundles creative + paid-launch. Their pitch is
"no editor at all".

**Takeaway:** we cannot and should not chase generation models — but our moat
is theirs inverted: they scrape a URL, we ARE the system of record. The
studio's answer is an **auto-storyboard** (§6, M-AI): one click on a product
picks its best photos, writes the caption from the product-content KB, chooses
a template by category, drops price/QR layers — a recipe the operator then
edits on the timeline. Rides rails that already exist (`from-product`,
templates, tokens). Avatars: skip.

### 2c · Browser editors — Kapwing, VEED, Clipchamp
Prove the browser timeline is a real product category. Their differentiators:
caption/subtitle tracks with styling, transcript-driven editing,
collaboration (Kapwing is "Figma-like"), translation.

**Takeaway:** v3's timeline already matches the structural bar. Their caption
emphasis points at a cheap, high-visibility win for us: **karaoke-style
word-highlight captions** (§6) — our typewriter already knows per-character
timing, highlighting the current word is a paint variant, not a feature.
Collaboration: skip — the studio is a single-operator ERP surface.

### 2d · Native platform editors — TikTok's built-in, Instagram/Meta "Edits"
Meta's Edits now does frame-accurate timelines, **position/scale/rotation
fine-tuning of text and stickers**, saved fonts/styles, templates that copy
clip timings, product tags. This is what "good enough without leaving the
app" looks like — and it is what our videos are judged against in-feed.

**Takeaway:** geometry parity (§4) again; plus one platform-specific cheap
win: **safe-zone guides** — overlay the UI-chrome margins (TikTok right rail,
Reels bottom caption band) on the canvas so operators stop putting price
chips under the like button.

### 2e · The one structural gap
Every family above edits **video clips**; we compose stills. The `/videos`
library and posts with real footage exist today and the studio can do nothing
with them. §7 sketches video-clips-as-layers inside the engine invariants —
exploratory, but it is the difference between "slideshow maker" and "video
studio" long-term.

## 3 · Backlog, scored

| Candidate | Commerce value | Engine fit | Verdict |
|---|---|---|---|
| Corner-handle resize + rotation (§4) | high — editor credibility | clean (fractions already the model) | **M1** |
| Photo layers with geometry → picture-in-picture / collage (§4d) | high — close-ups, split screens | clean (photo is already a layer) | **M1** |
| Keyframes on fx/fy/fw/size/opacity/rot (§5) | high — motion sells | clean (paint is pure in `t`) | **M2** |
| Custom per-photo camera moves (two-key zoom/pan replacing Ken Burns) | med-high | falls out of §5 | **M2** |
| Polish pack: more enter/exit kinds (wipe, blur-through), per-photo filters (`ctx.filter` presets), karaoke captions, safe-zone guides | medium, cheap each | trivial | **M3** |
| Beat-synced slot suggestions (WebAudio energy peaks → snap slot edges) — v2 stretch item | medium | client-side, no engine change | **M3** |
| Auto-storyboard from product (photos + caption + template + commerce layers) | high — the moat | rides existing rails; needs product-KB heuristics | **M-AI** |
| TTS voice-over → audio library → sound layer (server TTS; sound-layer seam built in v3 for exactly this) | medium-high | external service + existing seam | **M-AI** |
| Auto-captions from voice-over (speech-to-text) | medium | external service; captions = text layers with timing | after TTS |
| Video clips as layers (§7) | high, long-term | hard but plausible | **M5, exploratory** |
| Per-platform multi-aspect render on attach (9:16 + 1:1 + 16:9 from ONE recipe — fractional geometry makes this nearly free) | medium | poster batch change; revisits "one video per post" | optional, after M2 |
| Speed ramps, motion tracking, chroma key, avatars, collaboration, server rendering | — | breaks invariants or off-mission | **stay out** |

---

## 4 · Design: sizing and moving layers by hand (M1)

Today a selected layer shows an outline and drags by its body. M1 makes the
outline an instrument:

```
        ⟳  ← rotation stalk
   ┌─────────┐
   │  SALE   │   corners: proportional resize (opposite corner anchored)
   └─────────┘   body: move (exists today)
```

### 4a · Interaction
- **Four corner handles**, hit-tested before the body. Dragging one resizes
  about the OPPOSITE corner (the anchor stays put — the box grows toward the
  pointer), writing `sizeFrac` (text) or `fw` (image/qr/photo) **and** the
  fx/fy needed to keep the anchor fixed. Aspect is intrinsic (text by font,
  images by bitmap, QR square) so corners never distort — no shift-modifier
  semantics to learn.
- **A rotation stalk** above the top edge writes `rot` (degrees, 0 default,
  snap to 0/±90 within 3°). Escape/double-click resets to 0.
- Minimum sizes (text `sizeFrac ≥ 0.015`, images `fw ≥ 0.03`); cursor
  feedback per handle; all writes go through the existing patch path, so
  undo/persistence/poster need nothing new.

### 4b · Geometry stays fractional
Handles compute in canvas pixels but WRITE fractions — the same
`fx/fy/fw/sizeFrac` fields recipes already store. One recipe still renders at
any aspect; nothing about persistence changes shape.

### 4c · Rotation in the renderer
`rot` joins the envelope application, not the painters: the paint wrapper
already translates/scales for enter/exit, so it gains one
`rotate(rot)` about the layer's center. Every layer type gets rotation
without its painter knowing (the same trick as fades). `layerBounds` and the
hit-test learn to test against the rotated rect (inverse-transform the
pointer — cheaper than rotating the rect).

### 4d · Photos get optional geometry — picture-in-picture
A photo layer with NO geometry paints the full stage (legacy, byte-identical).
A photo layer WITH `{fx, fy, fw, fh}` paints cover-fitted inside that
fractional rect, rounded corners, honoring its focal point. That single
addition turns duplication into composition: duplicate a photo, shrink it,
place it — a close-up inset over the wide shot; two photos side by side; a
before/after. The inspector gains a "make this an inset" toggle that seeds
geometry at 40% width, centre.

### 4e · Gate
Fixture checks driven like T2: corner drag grows `fw` while the anchor
corner's canvas position holds within 2px; rotation writes `rot` and the
pixel probe sees the layer rotated at the same instants in both hosts; a
PiP photo paints inside its rect and the legacy full-stage path stays
byte-identical in the A/B rig.

---

## 5 · Design: sizes and times that vary with the timeline (M2)

v3 said "no keyframes" and meant it — for that milestone. The envelope
answers *how a layer arrives and leaves*; it cannot answer *what it does in
between* ("the price chip drifts up while growing", "the inset slides from
left to right across its window"). That is a keyframe problem, and the model
below adds it without betraying any v3 invariant.

### 5a · The data
One optional key per layer record — `keys` — a map of property → key list:

```js
{
  id: 'price-1', type: 'text', text: '{price}', pill: 'accent',
  fx: 0.5, fy: 0.08, sizeFrac: 0.055,          // static base, as today
  timing: { start: 2, end: 9 },
  enter: { kind: 'fade', seconds: 0.4 },        // edges: envelope, unchanged
  keys: {                                       // interior: keyframes
    fy:       [ { t: 0, v: 0.08 }, { t: 5, v: 0.72, ease: 'in-out' } ],
    sizeFrac: [ { t: 0, v: 0.055 }, { t: 5, v: 0.09 } ],
    opacity:  [ { t: 6, v: 1 }, { t: 7, v: 0.4 } ],
    rot:      [ { t: 0, v: -8 }, { t: 5, v: 8 } ],
  },
}
```

Keyable properties: `fx, fy, fw, sizeFrac, opacity, rot` — position, scale,
transparency, rotation. Exactly CapCut's keyframe set, and nothing else: no
color ramps, no text morphing, no property that would drag painters into the
mechanism.

### 5b · The rules (each one is a decision)
- **Key times are LOCAL to the layer's window** — `t: 0` is `timing.start`.
  Moving the bar moves the whole motion; trimming the end simply cuts unseen
  keys' effect; duplicating a layer carries its motion. Absolute times would
  break all three, silently, on the first retime.
- **Between keys: linear.** A key may carry `ease: 'in' | 'out' | 'in-out'`
  (cubic smoothstep on the segment ENDING at that key). Before the first key
  and after the last: hold. No bezier editors, no graph view — two eases
  cover product videos.
- **Keys and the envelope compose.** The envelope owns the window's EDGES
  (its ramps are pinned to start/end and adapt when the bar is trimmed); keys
  own the INTERIOR. Alpha multiplies (`envelopeAlpha × keyOpacity`);
  transforms nest in fixed order translate → rotate → scale. One mechanism
  per job, and they never fight.
- **A property with no keys is the static field** — the v3 code path,
  untouched, which is what keeps the A/B rig meaningful.
- **Unknown-future degradation:** a v3 renderer given a v4 recipe ignores
  `keys` and paints the layer static at its base fields — a worse video,
  never a broken one. Same contract unknown types already have.

### 5c · Resolution in the renderer
`envelopeAt` grows into `layerStateAt(plan, layer, time)`:

1. local `t = time - timing.start`
2. for each keyed property, binary-search the segment, lerp/ease → value
3. fractional results resolve to pixels against `plan.W/H` — per frame now,
   not per compile, but only for keyed layers (static layers keep their
   compile-time pixels, so the hot path pays nothing)
4. returns the composed `{ alpha, tx, ty, scale, rot, overrides }`; the paint
   wrapper applies transforms and lends the painter the overridden
   `x/y/sizePx/font` for the duration of the call (font strings cached per
   size — `measureText` churn is the one real cost, and pills already cache)

Purity holds: same `t`, same state, same pixels — the preview scrubber, the
recorder and the poster stay one code path.

### 5d · Ken Burns becomes a special case, not a mechanism
A photo's drift-and-zoom is secretly two keys on its crop. With photo
geometry (§4d) + keys, "custom camera move" per photo = start rect → end
rect, exposed in the photo inspector as two focal/zoom pickers. `kenBurns:
true` stays the compiled default (byte-identical); a photo with its own move
overrides it. The alternating-direction heuristic survives untouched for
photos nobody customized.

### 5e · Timeline and canvas UI
- The SELECTED lane grows 6px: a key strip inside the bar showing one
  diamond per key time (union of all properties; the inspector splits by
  property). Diamonds drag horizontally to retime; double-click deletes.
- Inspector gains a key row per geometric property: ◆ add/update at
  playhead · ease picker · clear-all.
- **Record-by-doing:** with a layer selected and the playhead parked, any
  canvas drag/resize/rotate writes the key `{ t: playhead-local, v }` for the
  changed properties instead of the base field — IF the layer already has
  keys or the inspector's record toggle is on. No keys and no toggle = the
  v3 behavior (drag moves the base), so nobody animates by accident.
- Scrubbing previews the motion live — that part is free, paint is pure.

### 5f · Gates
1. A/B rig: keyless plans stay 60/60 byte-identical against the v4 renderer.
2. Fixture probes (t2-check style): a two-key `fy` sticker measured at
   t0 / mid / t1 sits at lerped positions (pixel-probe the pill); opacity
   ramp measured via alpha at instants; `rot` visible in pixel diff.
3. Retime invariance: shift the bar +2s, every probe shifts +2s exactly.
4. Both hosts, as always (ab-check / t4-check extended with one keyed layer).

---

## 6 · Milestones

| | scope | gate |
|---|---|---|
| **M1** | corner handles, rotation stalk, `rot` in the paint wrapper, rotated hit-testing, photo geometry / PiP, inset toggle | §4e checks + A/B identity |
| **M2** | `keys` model, `layerStateAt`, key strip + diamonds, record-by-doing, per-photo camera moves | §5f checks |
| **M3** | polish pack: wipe/blur-through enter-exit kinds, per-photo `ctx.filter` presets (B&W, warm, punch), karaoke caption style, safe-zone guides, beat-synced slot suggestions | A/B identity + fixture spot-checks |
| **M-AI** | auto-storyboard from product (photos+caption+template+commerce layers, one click, operator edits after); TTS voice-over → audio library → sound layer | storyboard produces a valid v4 recipe; TTS clip lands at its instants via the t4 rig |
| **M5** | *exploratory:* video clips as layers (§7) — spike first, gate hard | §7 spike criteria |

**Landed since (2026-08-12), user-driven — audio-in-hand + per-layer look:**

- **Audible preview.** The studio's Play now plays what a render records:
  `startAudioPreview(audio, plan, from)` in the renderer mirrors
  `renderVideo`'s clip scheduling (same normalization, same envelope) into
  the speakers, joining mid-timeline at the playhead's gain. Stops on pause,
  scrub, post-switch, unmount, render.
- **Sound overlap modes.** A sound layer carries `mix: mix|duck|solo` — duck
  dips every OTHER clip to a 0.2 gain floor while it plays (0.35s ramps
  outside its window), solo dips them to 0. One shared `duckEnvelopes`
  drives render and preview; the extra gain stage is inserted ONLY when a
  duck/solo clip exists, so legacy graphs stay byte-identical. Gated in t4
  phase 1b: the bed's 440 energy falls to ~4% inside the voice-over's window.
- **Track search + tags.** `TrackBrowser` (search box + library-tag chips,
  AND-narrowing, audition, pick) replaces the Music-card list and the sound
  inspector's `<select>`. /audio itself got full filters in the concurrent
  media-gallery session (e087afb) — not re-done here.
- **Per-layer look.** Static `opacity` moved from paintImage into the paint
  wrapper (every type, multiply — byte-identical for the logo), plus
  `layer.filter` {brightness, contrast, saturate, blur px, grayscale, sepia,
  hue} → `ctx.filter`, assigned only when non-default. Inspector Look card
  for photo/video/image (+ opacity for text). This delivers M3's
  `ctx.filter` slice ahead of the pack.
- **Full-stage resize.** A selected cover photo/clip now shows corner
  handles (no rotate stalk); the first drag carves it into an inset —
  `layerBounds` reports the stage, `resizePatch` writes fx/fy/fw/fh about
  the opposite corner. `hitTestLayers` still ignores the body, so stage
  clicks don't steal selection.
- **Honest offsets.** The sound offset slider is bounded by the real source
  length (track `duration_seconds`, or the loaded clip for a video's audio
  lane) minus the lane window; label names the source length.
- **Add→Image.** Any library image (or an upload — it lands in the library
  first) as its own layer: timeline Image button → StrapiMediaLibrary
  accept=image → `{type:'image', url}` patch; an `imageAssets` url-map
  mirrors `videoLib` into `buildPlan({assets})`. This also makes image
  layers arriving from templates/recipes draw in the studio — their urls
  were never resolved there before. Poster side needed nothing (t4's
  logo-2 gate already covers image-patch bytes).

Gates re-run green: A/B 60/60 + 6/6 (Electron host), t2 full suite,
t4 21/21 incl. the new duck proof.

Optional after M2: per-platform multi-aspect render on attach (one recipe,
three files) — a poster/attach change, not a renderer one; revisits the
"one video per post" rule deliberately and separately.

## 7 · The video-clip question (M5 spike, not a promise)

The engine records a canvas in real time — which means a `<video>` element
CAN be a layer source: seek it to `timing.start - t0` at render start, play
it, `drawImage(videoEl)` each frame; tap its audio into the existing clip
mixer via `MediaElementSource`. The invariants that must survive: timer-paced
loop (a stalled video must drop frames, not stall the clock), hidden-window
playback in the poster (autoplay policies, `backgroundThrottling: false`),
and purity-in-`t` for the PREVIEW (scrubbing seeks the element — acceptable
if preview tolerates seek latency with a "loading" frame; the RECORDING path
plays linearly so purity holds where it matters).

Spike criteria before any UI: a 10s clip layer renders frame-accurate audio
and video in BOTH hosts three times in a row; scrub-seek under 200ms on a
1080p H.264 source; memory stable across a 3-video batch. Fail any → shelve
and revisit; the stills studio loses nothing.

## 8 · What stays out, still

Server-side rendering / ffmpeg; nested compositions; motion tracking; chroma
key; speed ramps; AI avatars; collaboration/multiplayer; publishing changes.
The browser recorder remains the engine, recipes stay additive, fractional
geometry stays the law, and the poster renders what the studio previews.
