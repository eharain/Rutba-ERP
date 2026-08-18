/**
 * DEV HARNESS — the capture and edit dialogs, driven end to end.
 *
 * These four features (record audio, record video, edit a track, trim a clip)
 * are all browser-pipeline code: getUserMedia, MediaRecorder, captureStream,
 * decodeAudioData. None of it can be proved by reading, none of it runs under
 * node, and all of it fails in ways that only show up on real media — a file
 * that plays but is silent, a trim that comes out the wrong length, an export
 * that writes an empty stream.
 *
 * So this page builds its own fixtures (a tone, and a canvas recorded with a
 * sound on it), mounts each dialog against them, DRIVES THE REAL UI — the same
 * clicks a person makes — and then decodes whatever File comes back out to
 * check it is what was asked for. No auth, no network, no ERP.
 *
 * Run it in a browser at /dev/media-lab and press the button, or headlessly:
 *
 *   chrome --headless=new --use-fake-device-for-media-capture \
 *          --use-fake-ui-for-media-stream --autoplay-policy=no-user-gesture-required \
 *          "http://localhost:4011/dev/media-lab?auto=1&report=http://127.0.0.1:4899/report"
 *
 * with ?auto=1 to start on load and ?report= to POST the results somewhere.
 * Results also land on the page and in window.__LAB.
 *
 * The one thing it cannot cover is system-audio capture: getDisplayMedia opens
 * a picker no flag can drive honestly.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import RecorderDialog from "@rutba/shared/components/RecorderDialog";
import AudioEditorDialog from "@rutba/shared/components/AudioEditorDialog";
import VideoEditorDialog from "@rutba/shared/components/VideoEditorDialog";
import { decodeBlob, editContext, encodeWav } from "@rutba/shared/lib/audio-edit";
import { pickRecordMime } from "@rutba/shared/lib/media-encode";

// ── driving a React UI from inside the page ─────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, label, ms = 20000) {
    const t0 = Date.now();
    for (;;) {
        let v = null;
        try { v = fn(); } catch { v = null; }
        if (v) return v;
        if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${label}`);
        await sleep(60);
    }
}

const buttons = () => Array.from(document.querySelectorAll(".modal button"));
const btn = (text) => {
    const want = text.toLowerCase();
    const all = buttons().filter((b) => !b.disabled);
    return all.find((b) => b.textContent.trim().toLowerCase() === want)
        || all.find((b) => b.textContent.trim().toLowerCase().includes(want))
        || null;
};
const clickBtn = async (text) => {
    const b = await waitFor(() => btn(text), `the “${text}” button`);
    b.click();
    await sleep(80);
};

const fieldNear = (labelText, tag) => {
    const l = Array.from(document.querySelectorAll(".modal label"))
        .find((x) => x.textContent.trim().toLowerCase().startsWith(labelText.toLowerCase()));
    return l?.parentElement?.querySelector(tag) || null;
};

// React tracks input values on the node, so assigning `.value` and firing an
// event is ignored — the native setter has to be called for React to notice.
const setNative = (el, value, Proto, evt) => {
    Object.getOwnPropertyDescriptor(Proto.prototype, "value").set.call(el, String(value));
    el.dispatchEvent(new Event(evt, { bubbles: true }));
};
const setNumber = async (labelText, value) => {
    const el = await waitFor(() => fieldNear(labelText, "input"), `the “${labelText}” field`);
    setNative(el, value, window.HTMLInputElement, "input");
    await sleep(60);
};
const setSelect = async (labelText, value) => {
    const el = await waitFor(() => fieldNear(labelText, "select"), `the “${labelText}” picker`);
    setNative(el, value, window.HTMLSelectElement, "change");
    await sleep(60);
};
// Some pickers sit beside their label rather than under it (the save-mode one
// shares a row with the name field), so they are found by what they offer.
const chooseOption = async (value) => {
    const el = await waitFor(
        () => Array.from(document.querySelectorAll(".modal select"))
            .find((s) => Array.from(s.options).some((o) => o.value === value)),
        `a picker offering “${value}”`,
    );
    setNative(el, value, window.HTMLSelectElement, "change");
    await sleep(60);
};
const toggle = async (id) => {
    const el = await waitFor(() => document.getElementById(id), `the #${id} switch`);
    el.click();
    await sleep(60);
};

const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

/** What the export dialog is doing right now — for when a wait gives up. */
const exportStatus = () => {
    const bar = document.querySelector(".modal .progress-bar");
    const v = document.querySelector(".modal video");
    const err = document.querySelector(".modal .alert-danger");
    return `progress=${bar?.style.width || "n/a"} t=${v ? v.currentTime.toFixed(2) : "n/a"} `
        + `paused=${v ? v.paused : "n/a"} ready=${v ? v.readyState : "n/a"} `
        + `err=${err ? err.textContent.trim().slice(0, 140) : "none"}`;
};

/** Wait for the recorder to open its devices, surfacing its error if it cannot. */
const awaitArmed = async (label) => {
    const r = await waitFor(() => {
        const err = document.querySelector(".modal .alert-danger");
        if (err) return { error: err.textContent.trim() };
        return btn("record") ? { ok: true } : null;
    }, label, 20000);
    if (r.error) throw new Error(`the recorder reported: ${r.error}`);
};

/** Wait for the export to produce a result, surfacing a dialog error as one. */
const awaitExport = async () => {
    try {
        const done = await waitFor(() => {
            const err = document.querySelector(".modal .alert-danger");
            if (err) return { error: err.textContent.trim() };
            return btn("upload as a new video") ? { ok: true } : null;
        }, "the export to finish", 60000);
        if (done.error) throw new Error(`the export reported: ${done.error}`);
    } catch (err) {
        if (/timed out/.test(err.message)) throw new Error(`${err.message} — ${exportStatus()}`);
        throw err;
    }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ── fixtures ────────────────────────────────────────────────
/** A 4-second stereo tone, louder on the left so a mono fold is measurable. */
function toneWav({ seconds = 4, rate = 48000, hz = 440, amp = 0.5 } = {}) {
    const ctx = editContext();
    const buf = ctx.createBuffer(2, rate * seconds, rate);
    for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        const a = amp * (c === 1 ? 0.5 : 1);
        for (let i = 0; i < d.length; i++) d[i] = a * Math.sin((2 * Math.PI * hz * i) / rate);
    }
    return encodeWav(buf);
}

/** A real recorded video: an animated canvas with a tone muxed alongside it. */
async function testVideo({ seconds = 4, w = 640, h = 360 } = {}) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const cx = canvas.getContext("2d");
    const vstream = canvas.captureStream(30);
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ac = new Ctx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const dest = ac.createMediaStreamDestination();
    osc.frequency.value = 330;
    gain.gain.value = 0.3;
    osc.connect(gain);
    gain.connect(dest);
    osc.start();

    const mime = pickRecordMime("video");
    const rec = new MediaRecorder(
        new MediaStream([...vstream.getVideoTracks(), ...dest.stream.getAudioTracks()]),
        mime ? { mimeType: mime } : undefined,
    );
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.start(400);

    const t0 = Date.now();
    await new Promise((done) => {
        const timer = setInterval(() => {
            const t = (Date.now() - t0) / 1000;
            cx.fillStyle = `hsl(${Math.round(t * 90) % 360},70%,45%)`;
            cx.fillRect(0, 0, w, h);
            cx.fillStyle = "#fff";
            cx.font = "48px sans-serif";
            cx.fillText(`${t.toFixed(2)}s`, 40, h / 2);
            if (t >= seconds) { clearInterval(timer); done(); }
        }, 33);
    });
    rec.stop();
    await stopped;
    try { osc.stop(); await ac.close(); } catch { /* already closed */ }
    return new Blob(chunks, { type: (rec.mimeType || "video/webm").split(";")[0] });
}

/**
 * Length and size of an encoded clip. MediaRecorder's webm carries no duration
 * in its header, so `el.duration` is Infinity — seeking past the end and
 * reading back where it landed is the only way to measure one.
 */
async function probeVideo(blob) {
    const what = `${blob.type || "no type"}, ${(blob.size / 1024).toFixed(0)} KB`;
    const url = URL.createObjectURL(blob);
    const el = document.createElement("video");
    el.preload = "auto";
    // Silent but NOT muted: the audio probe below counts decoded bytes, and a
    // muted element is not guaranteed to decode any.
    el.volume = 0;
    el.src = url;
    try {
        await waitFor(() => el.readyState >= 1 || el.error, `the probe video's metadata (${what})`);
        if (el.error) throw new Error(`the file will not decode: ${el.error.message || el.error.code} (${what})`);

        let duration = el.duration;
        if (!Number.isFinite(duration) || duration <= 0) {
            // A MediaRecorder webm carries no duration in its header. Seeking
            // past the end makes the browser go and find it — but the answer
            // only means anything once the seek has actually LANDED, since
            // currentTime reads back the requested time until then.
            await new Promise((resolve) => {
                const done = () => { el.removeEventListener("seeked", done); clearTimeout(t); resolve(); };
                const t = setTimeout(done, 5000);
                el.addEventListener("seeked", done);
                el.currentTime = 1e6;
            });
            duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : el.currentTime;
            if (duration > 1e5) throw new Error(`the file reports no usable duration (${what})`);
        }

        // Decoded audio bytes prove sound survived the mux; an element cannot be
        // asked about its tracks directly. Rewind first — the duration probe
        // above leaves the playhead at the very end, where nothing decodes.
        let audioBytes = 0;
        try {
            el.currentTime = 0;
            await el.play();
            await sleep(500);
            el.pause();
            audioBytes = el.webkitAudioDecodedByteCount || 0;
        } catch { /* playback is only needed for the audio probe */ }
        return { duration, width: el.videoWidth, height: el.videoHeight, audioBytes };
    } finally {
        el.removeAttribute("src");
        el.load();
        URL.revokeObjectURL(url);
    }
}

async function decodedPeak(blob) {
    const buf = await decodeBlob(blob);
    let peak = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i += 7) { const v = Math.abs(d[i]); if (v > peak) peak = v; }
    }
    return { buf, peak };
}

export default function MediaLabPage() {
    const [results, setResults] = useState([]);
    const [running, setRunning] = useState(false);
    const [note, setNote] = useState("");
    const [dialog, setDialog] = useState(null);
    const handOff = useRef(null); // resolves with whatever a dialog hands back

    const take = () => new Promise((resolve) => { handOff.current = resolve; });
    const deliver = (file, meta) => { handOff.current?.({ file, meta }); handOff.current = null; };

    const run = useCallback(async () => {
        setRunning(true);
        setResults([]);
        const out = [];
        const add = (name, ok, detail) => {
            out.push({ name, ok, detail });
            setResults([...out]);
        };
        const step = async (name, fn) => {
            setNote(name);
            try {
                const detail = await fn();
                add(name, true, detail || "");
            } catch (err) {
                console.error(name, err);
                add(name, false, String(err?.message || err));
                setDialog(null);
                handOff.current = null;
                await sleep(200);
            }
        };

        // Anything that opens a camera or microphone touches REAL hardware —
        // this machine's devices, not a simulation — and a device that was in
        // use a moment ago can take its time coming back. One retry, with a
        // gap, is the difference between a suite that means something and one
        // nobody trusts.
        const withDevices = (fn) => async () => {
            let last;
            for (let attempt = 0; attempt < 2; attempt++) {
                await sleep(attempt ? 2500 : 800);
                try { return await fn(); } catch (err) {
                    last = err;
                    setDialog(null);
                    handOff.current = null;
                }
            }
            throw last;
        };

        // ── the audio editor ────────────────────────────────
        const wav = toneWav();
        const wavUrl = URL.createObjectURL(wav);

        await step("audio editor · trim + fade + normalise + mono", async () => {
            const got = take();
            setDialog({ kind: "audio", src: wavUrl, name: "tone fixture" });
            await waitFor(() => btn("play the edit"), "the editor to decode the fixture");
            await setNumber("In (seconds)", 1);
            await setNumber("Out (seconds)", 3);
            await setNumber("Fade in (s)", 0.25);
            await toggle("ae-normalize");
            await toggle("ae-mono");
            await clickBtn("save a copy");
            const { file, meta } = await got;
            setDialog(null);

            expect(file.type === "audio/wav", `expected audio/wav, got ${file.type}`);
            expect(file.name.endsWith(".wav"), `expected a .wav name, got ${file.name}`);
            expect(meta.replace === false, "a copy must not report itself as a replace");
            const { buf, peak } = await decodedPeak(file);
            expect(near(buf.duration, 2, 0.02), `expected a 2s cut, got ${buf.duration.toFixed(3)}s`);
            expect(buf.numberOfChannels === 1, `expected mono, got ${buf.numberOfChannels} channels`);
            expect(near(peak, 0.98, 0.02), `expected a normalised peak of 0.98, got ${peak.toFixed(3)}`);
            expect(buf.getChannelData(0)[0] === 0, "a fade-in must start at silence");
            return `${buf.duration.toFixed(3)}s · ${buf.numberOfChannels}ch · peak ${peak.toFixed(3)} · ${file.name}`;
        });

        await step("audio editor · replace reports itself as a replace", async () => {
            const got = take();
            setDialog({ kind: "audio", src: wavUrl, name: "tone fixture" });
            await waitFor(() => btn("play the edit"), "the editor to decode the fixture");
            await chooseOption("replace");
            await clickBtn("replace");
            const { meta } = await got;
            setDialog(null);
            expect(meta.replace === true, "the replace choice did not reach the host");
            return "meta.replace = true";
        });

        // ── the video editor ────────────────────────────────
        const clip = await testVideo();
        const clipUrl = URL.createObjectURL(clip);
        await step("video fixture is usable", async () => {
            const p = await probeVideo(clip);
            expect(p.width === 640 && p.height === 360, `fixture came out ${p.width}×${p.height}`);
            expect(p.duration > 3, `fixture is only ${p.duration.toFixed(2)}s`);
            return `${p.width}×${p.height} · ${p.duration.toFixed(2)}s · ${(clip.size / 1024).toFixed(0)} KB · ${clip.type}`;
        });

        await step("video editor · trim to 1:1 and keep the sound", async () => {
            const got = take();
            setDialog({ kind: "video", source: { url: clipUrl, name: "fixture.webm" } });
            await waitFor(() => btn("export the clip"), "the editor to load the clip");
            await setNumber("In (seconds)", 1);
            await setNumber("Out (seconds)", 3);
            await setSelect("Framing", "1:1");
            await setSelect("Size", "480");
            await clickBtn("export the clip");
            await awaitExport();
            await clickBtn("upload as a new video");
            const { file, meta } = await got;
            setDialog(null);

            expect(/^video\//.test(file.type), `expected a video file, got ${file.type}`);
            expect(meta.width === 360 && meta.height === 360,
                `a 1:1 crop of 640×360 should be 360×360 (never upscaled), got ${meta.width}×${meta.height}`);
            const p = await probeVideo(file);
            const seen = `${file.type}, ${(file.size / 1024).toFixed(0)} KB`;
            expect(p.width === 360 && p.height === 360, `encoded frame is ${p.width}×${p.height} (${seen})`);
            expect(near(p.duration, 2, 0.5), `expected ~2s, got ${p.duration.toFixed(2)}s (${seen})`);
            expect(p.audioBytes > 0, `the trimmed clip carries no audio (${seen})`);
            return `${file.name} · ${p.width}×${p.height} · ${p.duration.toFixed(2)}s · ${(file.size / 1024).toFixed(0)} KB · audio ok`;
        });

        await step("video editor · muting drops the sound", async () => {
            const got = take();
            setDialog({ kind: "video", source: { url: clipUrl, name: "fixture.webm" } });
            await waitFor(() => btn("export the clip"), "the editor to load the clip");
            await setNumber("In (seconds)", 0.5);
            await setNumber("Out (seconds)", 1.5);
            await toggle("ve-audio");
            await clickBtn("export the clip");
            await awaitExport();
            await clickBtn("upload as a new video");
            const { file } = await got;
            setDialog(null);
            const p = await probeVideo(file);
            const seen = `${file.type}, ${(file.size / 1024).toFixed(0)} KB`;
            expect(p.audioBytes === 0, `expected silence, but ${p.audioBytes} audio bytes decoded (${seen})`);
            expect(near(p.duration, 1, 0.5), `expected ~1s, got ${p.duration.toFixed(2)}s (${seen})`);
            return `${p.duration.toFixed(2)}s · no audio track`;
        });

        // ── the recorder (fake devices) ─────────────────────
        await step("recorder · microphone list is offered", withDevices(async () => {
            setDialog({ kind: "record", mode: "audio" });
            await awaitArmed("the recorder to arm");
            const sel = fieldNear("Microphone", "select");
            expect(sel, "no microphone picker was rendered");
            const labels = Array.from(sel.options).map((o) => o.text);
            expect(sel.options.length >= 2, `only ${sel.options.length} option(s): ${labels.join(", ")}`);
            setDialog(null);
            await sleep(200);
            return labels.join(" | ");
        }));

        await step("recorder · audio take arrives as WAV", withDevices(async () => {
            const got = take();
            setDialog({ kind: "record", mode: "audio" });
            await awaitArmed("the recorder to arm");
            await clickBtn("record");
            await sleep(1600);
            await clickBtn("stop");
            await waitFor(() => btn("use this take"), "the take to be ready");
            await clickBtn("use this take");
            const { file, meta } = await got;
            setDialog(null);
            expect(file.type === "audio/wav", `expected audio/wav, got ${file.type}`);
            const { buf, peak } = await decodedPeak(file);
            expect(buf.duration > 1 && buf.duration < 3, `expected ~1.6s, got ${buf.duration.toFixed(2)}s`);
            expect(near(meta.seconds, buf.duration, 0.4), "the reported length disagrees with the file");
            return `${buf.duration.toFixed(2)}s · ${buf.numberOfChannels}ch · peak ${peak.toFixed(3)} · ${file.name}`;
        }));

        await step("recorder · camera take carries picture and sound", withDevices(async () => {
            const got = take();
            setDialog({ kind: "record", mode: "video" });
            await awaitArmed("the camera to arm");
            const cams = fieldNear("Camera", "select");
            expect(cams && cams.options.length >= 2, "no camera was offered");
            await clickBtn("record");
            await sleep(1600);
            await clickBtn("stop");
            await waitFor(() => btn("use this clip"), "the take to be ready");
            await clickBtn("use this clip");
            const { file } = await got;
            setDialog(null);
            expect(/^video\//.test(file.type), `expected a video file, got ${file.type}`);
            const p = await probeVideo(file);
            expect(p.width > 0 && p.height > 0, "the recording has no picture");
            expect(p.duration > 1 && p.duration < 3, `expected ~1.6s, got ${p.duration.toFixed(2)}s`);
            expect(p.audioBytes > 0, "the recording carries no sound");
            return `${p.width}×${p.height} · ${p.duration.toFixed(2)}s · ${(file.size / 1024).toFixed(0)} KB · ${file.type}`;
        }));

        URL.revokeObjectURL(wavUrl);
        URL.revokeObjectURL(clipUrl);
        setNote("");
        setRunning(false);
        window.__LAB = out;

        const params = new URLSearchParams(window.location.search);
        const report = params.get("report");
        if (report) {
            try {
                await fetch(report, {
                    method: "POST",
                    mode: "cors",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userAgent: navigator.userAgent, results: out }),
                });
            } catch (err) {
                console.error("Could not post the report", err);
            }
        }
    }, []);

    const started = useRef(false);
    useEffect(() => {
        if (started.current) return;
        const params = new URLSearchParams(window.location.search);
        if (params.get("auto") === "1") { started.current = true; run(); }
    }, [run]);

    const passed = results.filter((r) => r.ok).length;

    return (
        <div className="container py-4">
            <h4>Media lab</h4>
            <p className="text-muted small mb-3">
                Builds its own fixtures, drives the capture and edit dialogs through the real UI, and decodes
                what comes out. Needs a browser with a camera and microphone (or Chrome&apos;s fake devices).
            </p>
            <button className="btn btn-primary btn-sm mb-3" onClick={run} disabled={running}>
                {running ? <span className="spinner-border spinner-border-sm me-1" /> : null}
                {running ? `Running — ${note}` : "Run all checks"}
            </button>

            <div id="summary" className="mb-2">
                <strong>{passed}/{results.length} passed</strong>
                {!running && results.length > 0 && (
                    <span className={`badge ms-2 ${passed === results.length ? "bg-success" : "bg-danger"}`}>
                        {passed === results.length ? "ALL PASS" : "FAILURES"}
                    </span>
                )}
            </div>
            <pre id="results" style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
                {results.map((r) => `${r.ok ? "PASS" : "FAIL"}  ${r.name}\n      ${r.detail}\n`).join("")}
            </pre>

            {dialog?.kind === "audio" && (
                <AudioEditorDialog
                    show
                    name={dialog.name}
                    src={dialog.src}
                    allowReplace
                    onClose={() => setDialog(null)}
                    onSave={(file, meta) => deliver(file, meta)}
                />
            )}
            {dialog?.kind === "video" && (
                <VideoEditorDialog
                    show
                    source={dialog.source}
                    onClose={() => setDialog(null)}
                    onSave={(file, meta) => deliver(file, meta)}
                />
            )}
            {dialog?.kind === "record" && (
                <RecorderDialog
                    show
                    mode={dialog.mode}
                    onClose={() => setDialog(null)}
                    onRecorded={(file, meta) => deliver(file, meta)}
                />
            )}
        </div>
    );
}
