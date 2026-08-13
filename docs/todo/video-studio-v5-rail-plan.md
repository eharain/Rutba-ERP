# Video Studio v5 — the rail follows the selection

<!-- verify-docs: external bd696e6 -->
<!-- Poster commit, in the Rutba-Social-Poster repo. -->

User brief, 2026-08-12. Ten items, from "the sound library is invisible" to
"give me room to work". They are really three jobs: a backend bug, a rail
that reorganises itself around the selection, and a layout that can get out
of the way.

---

## 0. Item 1 — the sound library was invisible (FIXED, landed 3c2b9f6)

Not a studio bug. The dev stack points at **rutba-core :4020**
(`NEXT_PUBLIC_API_URL`), and core never read a filter operand in the
column's type. Every REST filter arrives from the query string as a string,
so `filters[is_active][$eq]=true` reached knex as the **string** `'true'`;
MySQL reads `'true'` against a TINYINT as `0`, so "the active tracks"
selected the inactive ones — nothing. Proven on the dev DB:

| query | rows |
|---|---|
| `is_active = 1` (114 tracks, all active) | 114 |
| `is_active = 'true'` (what core sent) | **0** |

`applyAttributeFilter` now coerces by the attribute's declared type for the
value operators only (LIKE patterns stay strings), and `$null`/`$notNull`
coerce their flag (`$null: 'false'` was landing on `whereNull`). In-process
callers that pass real booleans are unaffected — coercion is the identity.

**This was never an audio bug.** The same hole silently emptied
marketplace's "active accounts" sweep (so unattended syncs found nothing to
do), storage-location pickers, and the storefront's `show_review` gate.
Worth a sweep for other symptoms once the studio work settles.

Still to do under item 1: **rename the Music card to Sound** — which item 2
deletes anyway, so it lands there.

---

## 1. The principle

Today the rail is two mutually exclusive trees — `railTab === 'layer'` vs
`'video'` — and cards are duplicated across them (Logo twice, Caption
twice) or stranded in one (Music). The user's items 2–8 all say the same
thing: **one set of cards, each showing the selected layer's version or the
video's version.**

| Card | Layer selected | Nothing selected (the video) |
|---|---|---|
| **Content** | type-specific: text/caption body, image source, photo order+focal, clip trim, QR data, track | — |
| **Sound** | the track, offset, volume, fades, overlap mode | — (the bed is a lane; see §2) |
| **Look** | opacity, filters, geometry | template, shape, theme, fit, transition, quality, switches, outro |
| **Pace** | this layer's start/end, fade in/out, seconds | default seconds per image, crossfade, max length, fps |
| **Motion** | keyframes at the playhead | — |

Same names, same order in both contexts, so the eye learns one map. The
`[layer | Video]` tab switch stays — it is what makes video-level options
reachable without dropping the selection.

**The rule that must not be broken** (learned from the regression fixed in
88f0994): every video-level option needs a home reachable with nothing
selected, or an Add button that recreates its layer. Items 3 and 4 delete
the video-level Logo and Caption cards, so before each deletion, check the
option can still be reached: `showLogo` → the Logo add button; caption
`textPosition`/`captionStyle` → the caption layer's inspector; `audioMode`
→ §2's bed lane.

---

## 2. Item 2 — the Sound panel appears with a sound lane

Delete the video-level Music card. A sound panel only exists when a sound
lane is selected.

The catch: the **music bed** is not a layer today — it is
`options.audioMode/audioTrackId/audioVolume/audioFadeIn/audioFadeOut`,
passed to `renderVideo` as the `audio` argument, and the poster's recipe
precedence (bd696e6) depends on that shape. `audioMode: 'random'` is what
makes an unattended batch varied; it must survive.

**Decision: give the bed a lane, not a new format.** When `audioMode !==
'none'`, the studio shows a synthetic `music-bed` lane on the timeline;
selecting it opens the Sound panel, which writes the same `options.*` keys
as today. Nothing about the persisted recipe changes.

- `VideoTimeline` gains an `extraLanes` prop. The synthetic lane is
  **display only** and must never reach `renderVideo` — it is not pushed
  into `plan.layers`.
- The Sound button's picker gains a two-way choice while no bed exists:
  *Use as the music bed* (loops under the whole video) vs *Add as a sound
  layer* (placed and trimmed). With a bed already set, only the layer
  choice shows.
- The bed lane's inspector = mode (Chosen/Random) + track + volume + fades
  + "start at a random point"; a sound layer's inspector keeps what it has
  (track, offset, volume, fades, overlap mode).

---

## 3. Items 3 + 5 — the logo is an image layer like any other

Delete the video-level Logo card. `showLogo` off means no lane, and the Add
row's **Logo** button puts it back — the dead end the old card guarded
against no longer exists.

The logo's inspector becomes the **image** inspector (size, rotation,
opacity, filters, timing) plus two logo-only controls:

- **Change image…** → `StrapiMediaLibrary accept="image"` → writes
  `{ id: 'logo', type: 'image', url }`.
- **Reset to the site logo** → writes `{ id: 'logo', url: null }`.

One renderer change is needed: `applyLayerPatches`'s merge branch assigns
`url` onto the existing layer but leaves `src` pointing at the old bitmap,
so the picture never changes. In the `existing.type === 'image'` branch,
re-resolve `src` from `plan.assets[patch.url]` (falling back to `plan.logo`
when cleared) and recompute `w`/`h` from the new aspect.

Writing the patch **with `type: 'image'`** is what makes this free on the
poster: the merge branch discards `type`, while both asset collectors
(`main.js:789`, `video-harness.html:78`) and the studio's own `imageAssets`
effect key off `type === 'image' && url` — so the bytes get fetched and
decoded on every host with no poster commit. Gate it by extending t4's
`logo-2` case with a url-swapped compiled logo.

---

## 4. Items 4 + 6 — a caption is a text layer

One inspector serves both. `text` and `caption` layers get: content
textarea, colour, weight, size, rotation, panel/bare, alignment, timing —
and caption-only extras: reveal method, typing speed, text scale, position,
and *Split into timed lines* / *Back to one caption*.

- The compiled `caption` layer keeps its binding to the post body: its
  textarea writes `bodyOverride`, with the *Edit the post →* link beside
  it. Split lines write their own patch `text`.
- Delete the video-level Caption card.
- **Add a Caption button to the add row.** With an empty post body there is
  no caption lane, and after this change no other way to get one.

---

## 5. Item 7 — Pace is a layer property too

Every layer inspector gets a Timing block: start, end, fade in, fade out —
today only text layers have raw start/end boxes and only photos have
seconds. The video keeps the defaults (seconds per image, crossfade), max
length, fps and quality, and its help text should say plainly that the
per-layer values win.

## 6. Item 8 — Look already splits; make it look like it

The layer's Look (opacity + filters, added 334521e) and the video's Look
(template, shape, theme…) become the same card in the two contexts, with
the same header. Mostly a naming and ordering change on top of §1.

---

## 7. Items 9 + 10 — room to work

- **Full-height rail.** The rail becomes `position: sticky` with its own
  scroll (`height: calc(100vh - <chrome>)`), so it stops riding the page
  scroll. The left column (canvas + timeline) scrolls independently.
- **Collapse the rail.** A `«`/`»` toggle collapses it to a narrow strip,
  handing ~320px to the canvas. Remember the choice in localStorage.
- **Focus mode per area** — canvas, timeline, rail each get a control that
  promotes that area to a fixed, full-window overlay; Escape exits.

  **Constraint:** focus mode must be a **class toggle on the existing
  container**, never a conditional render into a different subtree. The
  canvas holds the 2D context, the preview rAF loop and the live audio
  graph; remounting it blanks the frame and kills playback mid-preview.
  Same for the timeline's scroll position.

---

## 8. Sequence

Each step is a commit that leaves the studio working.

**ALL LANDED, 2026-08-12.** The "rail skeleton" step dissolved into the
four that follow it: moving each card is what made the set contextual, so
there was no skeleton to build first.

1. ~~core filter coercion~~ — **3c2b9f6**
2. ~~Logo as an ordinary image: renderer `src` re-resolve + t4 gate~~ —
   **1388f94** (ERP) + **f4c2123** (poster)
3. ~~Bed-as-lane + `VideoTimeline extraLanes` + the picker's bed/layer
   choice + the Music card gone~~ — **c0181f6** + **3e42da5**
4. ~~Caption edited on its lane; captions join Look~~ — **b53d726**
5. ~~Per-layer Pace~~ — **1fd8891**
6. ~~Layout: sticky full-height rail, hide, focus mode + InspectorRows
   extraction~~ — **b9cbd34** + **6daa94e**

Two plan items turned out not to be needed, and both were worth checking
rather than building:

- **No Caption add button.** `buildPlan` pushes the caption layer
  unconditionally, so the lane always exists — there was never a dead end
  to guard.
- **No renderer work for per-caption opacity/filters.** Those ride in the
  paint WRAPPER, which every painter already goes through, so adding
  `caption` to the Look card was the whole change. Rotation stayed out:
  it needs `layerBounds`, and a caption has none.

**Gates, all green at the end:** A/B 60/60 frames + 6/6 sound, t2 (14
retime + 8 geometry + 4 keyframe + 6 extra-lane + 8 inspector-rows + the
drag/duplicate/zoom checks), t3 at 1366×768, t4 24/24 in the poster
pipeline, and the studio compiling on :4011. Still owed: **a human pass**
— nothing here can judge whether the rail feels simpler.

## 9. Risks, and how they went

- **Stranded options.** Checked per deletion. The logo survives on the
  Logo add button (which already set `showLogo`), the caption lane always
  exists, and the bed comes back through the Sound picker's Bed choice.
- **The synthetic bed lane leaking into a render.** Held by the t2
  extra-lane probe: the lane renders, it is absent from `plan.layers`, it
  offers no trim handles and no buttons, while a real lane offers both.
- **Focus mode remounting the canvas.** Avoided — focus is style on the
  mounted containers, and hiding the rail collapses its width rather than
  unmounting it.
- **A big single-file diff.** `video-studio.js` ended up ~200 lines
  SHORTER than it started, with the rail's rows in
  `components/InspectorRows.js` — where the fixture can mount them.
