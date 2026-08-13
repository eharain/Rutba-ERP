# Video Studio — named deliverables, in order

Everything known to be outstanding as of 2026-08-12, after the v5 rail work
(`video-studio-v5-rail-plan.md`) landed. Ordered by one rule: **gaps in what
was actually asked for come before enhancements, and enhancements before new
programs.** Each deliverable names its gate, because a deliverable without one
is a guess.

The v4 backlog (`video-studio-v4-plan.md` §3) is the source for D3–D5; D1 and
D2 are gaps this session opened or left.

---

## D1 · Captions carry their own look — **DONE (aefb177, poster 10810b7)**

Landed as designed: optional `color`, `sizeScale`, `position`, `style` on a
caption layer, each falling back to the video option it used to be. The size
re-derives its own wrap and line count but NOT the caption band — the band is
what the photos were fitted around, so one line's size must not move the stage
under every photo. Gated by A/B 60/60 plus a 6-check t2 probe that holds both
directions: the fields reach the pixels, and a caption stating nothing paints
the same frame as one stating the video's own values. Typing speed stays
shared — split lines take turns on one clock.

**The gap.** "The caption layer is the same as a text layer" was answered for
the *panel* — words, reveal, speed, size and split all live on the caption
lane now — but not for the *styling model*. Colour, text size, position
(bottom/middle) and panel-vs-bare are still video-wide `options`, so two
caption lines cannot differ. A text layer has carried its own colour, weight
and size since v2.

**Scope.** Optional per-layer fields on a caption — `color`, `sizeScale`,
`position`, `style` — read by `paintCaption` in preference to the plan
globals, which stay as the defaults. The video's Caption options keep their
meaning: they are what a caption uses when it says nothing.

**Risks.** `paintCaption` reads `bodySize`, `lineHeight`, `maxVisibleLines`
and `textWidth` off the plan, all computed at compile time from the global
font scale — a per-caption size has to re-derive the wrap, not just the font,
and the layout cache key must include it. Absent fields must resolve to the
exact current values or every existing recipe shifts.

**Gate.** A/B 60/60 identical (no caption in any legacy look carries the new
fields), plus a fixture probe: two caption layers with different colours paint
different pixels, and a caption with no fields set is byte-identical to one
compiled before the change.

## D2 · Crop where you can see it — **DONE (f0ab73a + 7d6cae6)**

Reframing is a MODE, not another handle: turn it on and the picture itself is
the control — drag to move the region, wheel to zoom about its centre.
Dragging right shows more of the left, because the hand is on the picture and
not on the window. A region back at the whole frame is written as no crop
rather than as 0,0,1,1. Video layers get a thumbnail by grabbing a decoded
frame off the element (blob-backed, so the canvas is not tainted), and the
blurred backdrop now carries the crop in its cache key — held in a small map,
so two layers cropping one photo bake twice instead of re-baking a 46px blur
every frame. Gated by A/B 60/60 (the blur fit is a legacy look, so this had to
be invisible without a crop) plus two corner-reading checks in the t2 crop
probe.

**The gap.** Crop landed with a real editor, but on a thumbnail in the rail
rather than on the stage, and three things were left behind it.

**Scope.**
- Crop handles on the main preview, as a mode — the corner handles already
  mean "resize the box", so cropping needs its own gesture rather than a
  fourth meaning for the same handle.
- A frame grab for video layers, so a clip's crop has a still to sit on
  (draw the current `<video>` frame to a canvas; today it is numbers only).
- The blurred backdrop follows the crop. `backdropFor` bakes from the whole
  picture and caches per entry, so a cropped photo shows an uncropped blur
  behind it; the cache key needs the crop in it.

**Gate.** t2 crop probe extended: a stage-drag writes the same `crop` the
thumbnail does, and the backdrop's pixels change with the crop.

## D3 · Polish pack (v4 M3)

Wipe and blur-through enter/exit kinds, karaoke caption style, safe-zone
guides, beat-synced slot suggestions (WebAudio energy peaks snapping slot
edges). Per-photo filters — the other half of M3 — already landed as the Look
card. Cheap individually; no engine change.

**Gate.** A/B identity + fixture spot-checks per item.

## D4 · One recipe, every aspect

Per-platform multi-aspect render on attach: 9:16 + 1:1 + 16:9 from a single
recipe. Fractional geometry already makes this nearly free — the work is in
the poster's batch path and in what "one video per post" means once a post has
three. Revisit that question before building.

**Gate.** The same recipe renders at three aspects with every layer inside
frame; t4 carries a multi-aspect job.

## D5 · Storyboard and voice-over (v4 M-AI)

The highest-scoring item in the v4 backlog, and the one that needs the most
outside the renderer:

- auto-storyboard from a product (photos + caption + template + commerce
  layers, one click, operator edits after);
- TTS voice-over into the audio library, then onto a sound layer — the seam
  v3 built for exactly this;
- auto-captions from that voice-over (speech-to-text), after TTS.

**Gate.** The storyboard produces a valid v5 recipe; a TTS clip lands at its
instants through the t4 rig.

---

## Standing checks (not deliverables)

- **A human pass over the real studio.** Nothing automated reaches the page —
  it needs a session. Owed since v3 and still owed.
- **The boolean-filter fix's downstream symptoms.** 3c2b9f6 fixed the cause
  and it is proven for the audio library; marketplace's active-accounts sweep
  and the storefront's `show_review` gate were affected by the same hole and
  have not been individually re-tested.
