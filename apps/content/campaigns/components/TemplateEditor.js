import { useEffect, useRef, useState, useCallback } from "react";
import grapesjs from "grapesjs";
import presetNewsletter from "grapesjs-preset-newsletter";
import MergeFieldBar from "./MergeFieldBar";

// GrapesJS studio. Client-only — the caller must load this via next/dynamic
// with { ssr: false }, because GrapesJS touches `document` at init.
//
// Two things are saved, and they are not redundant:
//   • design_json — the editor's project state, so the design stays re-editable.
//   • body_html   — the CSS-inlined export (the preset's `gjs-get-inlined-html`
//                   command). This is what ships to the MTA, because email
//                   clients discard <style> blocks.
//
// Version note: grapesjs is pinned to ^0.21.13 because grapesjs-preset-newsletter
// declares a `^0.21.2` peer. Bumping GrapesJS past 0.21.x means checking the
// preset still loads, or replacing it with our own block set.

// Mirrors MERGE_TOKEN in pos-strapi cmp-template service — kept in sync by hand;
// this copy only drives the live badge, the server recomputes on save.
const MERGE_TOKEN = /\{\{\s*([a-zA-Z_][\w.]*)\s*\}\}/g;
const RESERVED = new Set(["accept_url", "decline_url", "confirm_url", "cta_url", "unsubscribe_url", "list_unsubscribe"]);

function parseMergeKeys(...sources) {
    const found = new Set();
    for (const s of sources) {
        if (typeof s !== "string" || !s) continue;
        for (const m of s.matchAll(MERGE_TOKEN)) if (!RESERVED.has(m[1])) found.add(m[1]);
    }
    return [...found].sort();
}

export default function TemplateEditor({ template, onDirtyChange, editorRef }) {
    const holderRef = useRef(null);
    const instanceRef = useRef(null);
    const [ready, setReady] = useState(false);
    const [usedKeys, setUsedKeys] = useState(template?.merge_keys || []);

    const refreshKeys = useCallback((ed) => {
        try {
            setUsedKeys(parseMergeKeys(ed.getHtml()));
        } catch {
            /* mid-render reads can throw; the badge is advisory */
        }
    }, []);

    useEffect(() => {
        if (!holderRef.current || instanceRef.current) return;

        const editor = grapesjs.init({
            container: holderRef.current,
            height: "100%",
            width: "auto",
            // We own persistence — saving goes through the campaigns API, not
            // GrapesJS's storage manager.
            storageManager: false,
            plugins: [presetNewsletter],
            pluginsOpts: {
                [presetNewsletter]: {
                    modalTitleImport: "Import template HTML",
                    modalTitleExport: "Export template HTML",
                },
            },
            assetManager: {
                // Uploads route through the ERP's media pipeline later; for now
                // authors paste URLs, which keeps this phase free of upload wiring.
                upload: false,
                uploadText: "Paste an image URL in the field above.",
            },
        });

        // Restore the design. Prefer the project state; fall back to raw HTML for
        // templates that were imported or created before a design was saved.
        if (template?.design_json && Object.keys(template.design_json).length) {
            try {
                editor.loadProjectData(template.design_json);
            } catch (e) {
                console.warn("Could not load saved design, falling back to HTML", e);
                if (template?.body_html) editor.setComponents(template.body_html);
            }
        } else if (template?.body_html) {
            editor.setComponents(template.body_html);
        }

        const markDirty = () => onDirtyChange?.(true);
        editor.on("component:update", markDirty);
        editor.on("component:add", markDirty);
        editor.on("component:remove", markDirty);
        editor.on("style:update", markDirty);
        editor.on("component:update", () => refreshKeys(editor));
        editor.on("component:add", () => refreshKeys(editor));

        instanceRef.current = editor;
        if (editorRef) editorRef.current = editor;
        setReady(true);
        refreshKeys(editor);

        return () => {
            try { editor.destroy(); } catch { /* already torn down */ }
            instanceRef.current = null;
            if (editorRef) editorRef.current = null;
        };
        // Mount-once: re-initialising on every template prop change would discard
        // unsaved work. The page remounts this component when the id changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="d-flex flex-column h-100">
            <MergeFieldBar used={usedKeys} />
            <div className="border rounded flex-grow-1" style={{ minHeight: "60vh" }}>
                <div ref={holderRef} style={{ height: "100%" }} />
            </div>
            {!ready && <p className="text-muted small mt-2">Loading the editor…</p>}
        </div>
    );
}

/**
 * Pull the two saveable artefacts out of a live editor.
 * `gjs-get-inlined-html` is registered by grapesjs-preset-newsletter; if the
 * preset ever fails to load we fall back to un-inlined HTML rather than saving
 * nothing — a template that renders badly beats a template that vanishes.
 */
export function extractFromEditor(editor) {
    if (!editor) return null;
    let html;
    try {
        html = editor.runCommand("gjs-get-inlined-html");
    } catch (e) {
        console.warn("CSS inlining failed; saving raw HTML", e);
    }
    if (!html) html = `${editor.getHtml()}<style>${editor.getCss()}</style>`;
    return { body_html: html, design_json: editor.getProjectData() };
}
