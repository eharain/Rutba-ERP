# @rutba/video-maker

<!-- verify-docs: external desktop/lib/video-maker-path.js -->
<!-- In the Rutba-Social-Poster desktop app repo. -->

Turns a social post's still images into a short video with the post text typed
over the top, optionally with a brand logo and a music bed. One file, zero
dependencies, no ffmpeg — it drives the video encoder every browser engine
already ships.

Built to run unchanged in **two** hosts:

| Host | Where it runs | How it fetches media |
| --- | --- | --- |
| `rutba-social` (Video Studio) | a Next.js page | through the app's own `/api/media-proxy` |
| Rutba Social Poster | an Electron window | main process fetches, bytes arrive over IPC |

Nothing in here knows about either. That is the whole point, and it is why
there is no framework import, no app config, and no hardcoded fetch.

## Wiring a host

The only thing a host **must** supply is a media transport:

```js
import { configureMediaFetch } from '@rutba/video-maker';

// (url, { signal }) => Promise<Blob>
configureMediaFetch(async (url, { signal } = {}) => {
    const res = await fetch(`/api/media-proxy?url=${encodeURIComponent(url)}`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
});
```

You can also pass `{ fetchMedia }` per call instead of configuring a default.

**Images must come through it.** Drawing a cross-origin image taints the canvas,
and `captureStream()` then throws `SecurityError` — there is no way to recover
mid-render, so a host that skips the transport gets no video at all.

## Rendering

```js
import { loadImages, loadImage, loadAudioTrack, buildPlan, renderVideo } from '@rutba/video-maker';

const { images } = await loadImages(imageUrls);
const logo = await loadImage(logoUrl);           // optional
const music = await loadAudioTrack(trackUrl);    // optional

const plan = buildPlan({ canvas, images, logo, title: post.title, body: post.body, options });
const { blob, extension, mimeType } = await renderVideo({
    canvas, plan,
    audio: music ? { buffer: music, volume: 0.7, fadeIn: 1.2, fadeOut: 1.6, offset: 0 } : null,
    onProgress: (p) => console.log(Math.round(p * 100) + '%'),
});
```

`buildPlan` is pure and cheap — rebuild it on every settings change and call
`paintFrame(ctx, plan, t)` to scrub a preview. The recorder and the preview
share that one painter, so what you scrub is what you get.

## Things that will bite you

- **Rendering is real time.** A 30-second video takes 30 seconds. Budget for it
  in batches, and tell the user.
- **The document must be live.** Where it is not being composited,
  `requestAnimationFrame` never fires and `HTMLImageElement.decode()` can hang
  forever. This module already avoids both (timer-driven loop,
  `createImageBitmap`), but a host that adds its own drawing must do the same.
- **Duration is derived, not given.** It is the longer of "enough time for the
  images" and "enough time to type the whole caption", capped by
  `options.maxSeconds`; past that the typing speeds up to fit and
  `plan.spedUp` is set. Read `plan.duration` rather than assuming.
- **Music ends with the picture.** An audio track keeps emitting real-time
  samples until it is ended, so leaving it running past the last frame appends
  silence to the file. `renderVideo` handles this; don't hold a reference and
  keep it alive.
- **Release what you load.** `releaseImages()` revokes object URLs and closes
  ImageBitmaps, which hold decoded pixels off-heap.

## Consuming it from the Social Poster repo

The poster is a separate repository and these packages are never published to
npm, so it resolves this one by path — see `desktop/lib/video-maker-path.js`
there. Set `RUTBA_VIDEO_MAKER` to override where it looks.
