import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { CmpTemplatesEndpoints } from "@rutba/api-provider/endpoints";
import { extractFromEditor } from "../../components/TemplateEditor";

// GrapesJS touches `document` at init, so the studio can only load in the
// browser. next/dynamic with ssr:false is the whole reason this page splits the
// editor into its own component.
const TemplateEditor = dynamic(() => import("../../components/TemplateEditor"), {
    ssr: false,
    loading: () => <p className="text-muted">Loading the editor…</p>,
});

export default function TemplateStudioPage() {
    const router = useRouter();
    const { jwt } = useAuth();
    // router.query is empty on the first render — reading documentId before
    // isReady yields undefined and fires a findOne for "undefined".
    const documentId = router.isReady ? router.query.documentId : null;

    const editorRef = useRef(null);
    const [template, setTemplate] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState(null);

    const [meta, setMeta] = useState({ name: "", folder: "", subject: "", status: "Draft", append_utm: true, tracking_enabled: true });
    const [bodyText, setBodyText] = useState("");
    const [showText, setShowText] = useState(false);

    const [preview, setPreview] = useState(null);
    const [testTo, setTestTo] = useState("");
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        if (!jwt || !documentId) return;
        setLoading(true);
        CmpTemplatesEndpoints.byId(documentId)
            .then((res) => {
                const t = res?.data;
                if (!t) throw new Error("Template not found.");
                setTemplate(t);
                setMeta({
                    name: t.name || "",
                    folder: t.folder || "",
                    subject: t.subject || "",
                    status: t.status || "Draft",
                    append_utm: t.append_utm !== false,
                    tracking_enabled: t.tracking_enabled !== false,
                });
                setBodyText(t.body_text || "");
            })
            .catch((err) => setNotice({ type: "danger", text: err.message }))
            .finally(() => setLoading(false));
    }, [jwt, documentId]);

    // Warn before losing unsaved editor state on a full navigation away.
    useEffect(() => {
        if (!dirty) return undefined;
        const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);

    const save = useCallback(async () => {
        if (!documentId) return null;
        setSaving(true);
        try {
            const fromEditor = extractFromEditor(editorRef.current) || {};
            const res = await CmpTemplatesEndpoints.update(documentId, {
                ...meta,
                body_text: bodyText,
                ...fromEditor,
            });
            setTemplate(res?.data || template);
            setDirty(false);
            setNotice({ type: "success", text: "Saved." });
            return res?.data || null;
        } catch (err) {
            setNotice({ type: "danger", text: `Save failed: ${err.message}` });
            return null;
        } finally {
            setSaving(false);
        }
    }, [documentId, meta, bodyText, template]);

    // Preview and test both render server-side, through the SAME code path a
    // real send uses. Saving first is not a convenience — an unsaved editor
    // would otherwise be previewed from stale stored HTML.
    const runPreview = async () => {
        const saved = await save();
        if (!saved && dirty) return;
        try {
            setPreview(await CmpTemplatesEndpoints.getPreview(documentId, { data: {} }));
        } catch (err) {
            setNotice({ type: "danger", text: `Preview failed: ${err.message}` });
        }
    };

    const runTestSend = async (e) => {
        e.preventDefault();
        const saved = await save();
        if (!saved && dirty) return;
        setTesting(true);
        try {
            const res = await CmpTemplatesEndpoints.sendTest(documentId, { to: testTo, data: {} });
            setNotice(res?.ok
                ? {
                    type: "success",
                    text: `Test sent to ${res.to}.`
                        + (res.missingKeys?.length ? ` Empty merge fields: ${res.missingKeys.join(", ")}.` : ""),
                }
                : { type: "warning", text: res?.message || "Test send did not complete." });
        } catch (err) {
            setNotice({ type: "danger", text: `Test send failed: ${err.message}` });
        } finally {
            setTesting(false);
        }
    };

    return (
        <ProtectedRoute>
            <Layout fullWidth>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <div>
                        <Link href="/templates" className="text-decoration-none small">
                            <i className="fas fa-arrow-left me-1"></i>Templates
                        </Link>
                        <h4 className="mb-0">{meta.name || "Template"}</h4>
                    </div>
                    <div>
                        {dirty && <span className="text-muted small me-3">Unsaved changes</span>}
                        <button className="btn btn-outline-secondary me-2" onClick={runPreview} disabled={saving}>
                            Preview
                        </button>
                        <button className="btn btn-primary" onClick={save} disabled={saving}>
                            {saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                </div>

                {notice && (
                    <div className={`alert alert-${notice.type} alert-dismissible`}>
                        {notice.text}
                        <button type="button" className="btn-close" onClick={() => setNotice(null)}></button>
                    </div>
                )}

                {loading ? (
                    <p className="text-muted">Loading…</p>
                ) : !template ? (
                    <div className="alert alert-warning">Template not found.</div>
                ) : (
                    <>
                        <div className="row g-2 mb-3">
                            <div className="col-md-3">
                                <label className="form-label small">Name</label>
                                <input className="form-control" value={meta.name}
                                    onChange={(e) => { setMeta({ ...meta, name: e.target.value }); setDirty(true); }} />
                            </div>
                            <div className="col-md-2">
                                <label className="form-label small">Folder</label>
                                <input className="form-control" value={meta.folder}
                                    onChange={(e) => { setMeta({ ...meta, folder: e.target.value }); setDirty(true); }} />
                            </div>
                            <div className="col-md-4">
                                <label className="form-label small">Subject</label>
                                <input className="form-control" value={meta.subject}
                                    placeholder="Merge fields work here too, e.g. {{first_name}}"
                                    onChange={(e) => { setMeta({ ...meta, subject: e.target.value }); setDirty(true); }} />
                            </div>
                            <div className="col-md-3">
                                <label className="form-label small">Status</label>
                                <select className="form-select" value={meta.status}
                                    onChange={(e) => { setMeta({ ...meta, status: e.target.value }); setDirty(true); }}>
                                    <option value="Draft">Draft</option>
                                    <option value="Active">Active</option>
                                    <option value="Archived">Archived</option>
                                </select>
                            </div>
                            <div className="col-12 d-flex gap-4 mt-1">
                                <div className="form-check">
                                    <input className="form-check-input" type="checkbox" id="append-utm"
                                        checked={meta.append_utm}
                                        onChange={(e) => { setMeta({ ...meta, append_utm: e.target.checked }); setDirty(true); }} />
                                    <label className="form-check-label small" htmlFor="append-utm">
                                        Append the campaign&apos;s UTM parameters to links
                                    </label>
                                </div>
                                <div className="form-check">
                                    <input className="form-check-input" type="checkbox" id="tracking"
                                        checked={meta.tracking_enabled}
                                        onChange={(e) => { setMeta({ ...meta, tracking_enabled: e.target.checked }); setDirty(true); }} />
                                    <label className="form-check-label small" htmlFor="tracking">
                                        Tracking <span className="text-muted">(no effect yet — open/click tracking is Phase 4)</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <TemplateEditor
                            template={template}
                            editorRef={editorRef}
                            onDirtyChange={setDirty}
                        />

                        <div className="mt-3">
                            <button className="btn btn-link p-0 small" onClick={() => setShowText((v) => !v)}>
                                {showText ? "Hide" : "Show"} plain-text version
                            </button>
                            {showText && (
                                <>
                                    <p className="small text-muted mb-1 mt-2">
                                        Sent as the text alternative. Worth writing — a missing text part
                                        hurts deliverability and some clients show nothing else.
                                    </p>
                                    <textarea className="form-control" rows={6} value={bodyText}
                                        onChange={(e) => { setBodyText(e.target.value); setDirty(true); }} />
                                </>
                            )}
                        </div>

                        <div className="card mt-4">
                            <div className="card-body">
                                <h6 className="card-title">Test send</h6>
                                <p className="small text-muted">
                                    Saves, then sends one rendered copy as a transactional message — so it
                                    skips marketing pacing and stays out of the marketing reputation stats.
                                    Merge fields render empty here; real values come from the audience.
                                </p>
                                <form className="row g-2" onSubmit={runTestSend}>
                                    <div className="col-md-5">
                                        <input className="form-control" type="email" required
                                            placeholder="you@example.com"
                                            value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                                    </div>
                                    <div className="col-md-3">
                                        <button className="btn btn-outline-primary w-100" disabled={testing || saving}>
                                            {testing ? "Sending…" : "Send test"}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        {preview && (
                            <div className="card mt-4">
                                <div className="card-body">
                                    <div className="d-flex justify-content-between">
                                        <h6 className="card-title">Preview</h6>
                                        <button className="btn-close" onClick={() => setPreview(null)}></button>
                                    </div>
                                    <p className="small mb-2">
                                        <strong>Subject:</strong> {preview.subject || <em>none</em>}
                                    </p>
                                    {preview.missingKeys?.length > 0 && (
                                        <div className="alert alert-warning py-2 small">
                                            Rendered empty (no sample data supplied):{" "}
                                            {preview.missingKeys.map((k) => <code key={k} className="me-1">{`{{${k}}}`}</code>)}
                                        </div>
                                    )}
                                    <iframe
                                        title="Template preview"
                                        srcDoc={preview.html}
                                        sandbox=""
                                        style={{ width: "100%", height: "60vh", border: "1px solid #dee2e6" }}
                                    />
                                </div>
                            </div>
                        )}
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
