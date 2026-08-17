import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import EnumSelect from "@rutba/pos-shared/components/EnumSelect";
import { CmpAudiencesEndpoints } from "@rutba/api-provider/endpoints";

// Audience editor: static list (one email per line, optionally
// "email, key=value, key=value") OR a saved Strapi filter over the chosen
// entity, plus the merge mapping (merge key → source field). Resolve shows
// the real recipient count + a sample before anything sends.

export default function AudienceEditorPage() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();

    const [audience, setAudience] = useState(null);
    const [staticText, setStaticText] = useState("");
    const [filterText, setFilterText] = useState("{}");
    const [mappingText, setMappingText] = useState("{}");
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(null);
    const [notice, setNotice] = useState(null);

    useEffect(() => {
        if (!jwt || !router.isReady || !documentId) return;
        CmpAudiencesEndpoints.byId(documentId)
            .then((res) => {
                const a = res?.data;
                setAudience(a);
                setStaticText((Array.isArray(a?.static_members) ? a.static_members : [])
                    .map((m) => {
                        const extras = Object.entries(m.mergeData || {}).map(([k, v]) => `${k}=${v}`).join(", ");
                        return extras ? `${m.email}, ${extras}` : m.email;
                    }).join("\n"));
                setFilterText(JSON.stringify(a?.filter_json || {}, null, 2));
                setMappingText(JSON.stringify(a?.merge_mapping || {}, null, 2));
            })
            .catch((err) => setNotice({ type: "danger", text: err.message }));
    }, [jwt, router.isReady, documentId]);

    const parseStatic = () => staticText.split(/\r?\n/).map((line) => {
        const parts = line.split(",").map((s) => s.trim()).filter(Boolean);
        if (!parts.length) return null;
        const mergeData = {};
        for (const kv of parts.slice(1)) {
            const i = kv.indexOf("=");
            if (i > 0) mergeData[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
        }
        return { email: parts[0], mergeData };
    }).filter(Boolean);

    const save = useCallback(async () => {
        setBusy("save");
        setNotice(null);
        try {
            let filter_json; let merge_mapping;
            try { filter_json = JSON.parse(filterText || "{}"); } catch { throw new Error("Filter is not valid JSON."); }
            try { merge_mapping = JSON.parse(mappingText || "{}"); } catch { throw new Error("Merge mapping is not valid JSON."); }
            await CmpAudiencesEndpoints.update(documentId, {
                name: audience.name,
                description: audience.description,
                source: audience.source,
                entity: audience.entity,
                filter_json,
                merge_mapping,
                static_members: parseStatic(),
            });
            setNotice({ type: "success", text: "Saved." });
        } catch (err) {
            setNotice({ type: "danger", text: err.message });
        } finally {
            setBusy(null);
        }
    }, [audience, filterText, mappingText, staticText, documentId]);

    const resolve = async () => {
        setBusy("resolve");
        setPreview(null);
        try {
            await save();
            const res = await CmpAudiencesEndpoints.resolveMembers(documentId);
            setPreview(res);
        } catch (err) {
            setNotice({ type: "danger", text: `Resolve failed: ${err.message}` });
        } finally {
            setBusy(null);
        }
    };

    if (!audience) {
        return (
            <ProtectedRoute><Layout><p className="text-muted">Loading…</p></Layout></ProtectedRoute>
        );
    }

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h2 className="mb-0">
                        <Link href="/audiences" className="text-decoration-none"><i className="fa-solid fa-arrow-left me-2"></i></Link>
                        {audience.name}
                    </h2>
                    <div>
                        <button className="btn btn-outline-primary me-2" disabled={busy !== null} onClick={resolve}>
                            {busy === "resolve" ? "Resolving…" : "Save + Resolve"}
                        </button>
                        <button className="btn btn-primary" disabled={busy !== null} onClick={save}>
                            {busy === "save" ? "Saving…" : "Save"}
                        </button>
                    </div>
                </div>

                {notice && (
                    <div className={`alert alert-${notice.type} alert-dismissible`}>
                        {notice.text}
                        <button type="button" className="btn-close" onClick={() => setNotice(null)}></button>
                    </div>
                )}

                <div className="row g-2 mb-3">
                    <div className="col-md-4">
                        <label className="form-label">Name</label>
                        <input className="form-control" value={audience.name || ""}
                            onChange={(e) => setAudience({ ...audience, name: e.target.value })} />
                    </div>
                    <div className="col-md-2">
                        <label className="form-label">Source</label>
                        <EnumSelect name="cmp-audience" field="source" value={audience.source}
                            onChange={(e) => setAudience({ ...audience, source: e.target.value })} />
                    </div>
                    {audience.source === "filter" && (
                        <div className="col-md-2">
                            <label className="form-label">Entity</label>
                            <EnumSelect name="cmp-audience" field="entity" value={audience.entity}
                                onChange={(e) => setAudience({ ...audience, entity: e.target.value })} />
                        </div>
                    )}
                    <div className="col-md-4">
                        <label className="form-label">Description</label>
                        <input className="form-control" value={audience.description || ""}
                            onChange={(e) => setAudience({ ...audience, description: e.target.value })} />
                    </div>
                </div>

                <div className="row g-3">
                    {audience.source === "static" ? (
                        <div className="col-md-7">
                            <label className="form-label">Members <span className="text-muted">(one per line: email, key=value, …)</span></label>
                            <textarea className="form-control font-monospace" rows={12} value={staticText}
                                onChange={(e) => setStaticText(e.target.value)}
                                placeholder={"ali@example.com, first_name=Ali\nsara@example.com, first_name=Sara"} />
                        </div>
                    ) : (
                        <div className="col-md-7">
                            <label className="form-label">Filter <span className="text-muted">(Strapi filters JSON over {audience.entity})</span></label>
                            <textarea className="form-control font-monospace" rows={8} value={filterText}
                                onChange={(e) => setFilterText(e.target.value)} />
                            <label className="form-label mt-2">Merge mapping <span className="text-muted">(merge key → {audience.entity} field)</span></label>
                            <textarea className="form-control font-monospace" rows={4} value={mappingText}
                                onChange={(e) => setMappingText(e.target.value)}
                                placeholder='{ "first_name": "name", "company": "company" }' />
                        </div>
                    )}
                    <div className="col-md-5">
                        <div className="card">
                            <div className="card-header py-2"><strong>Resolve preview</strong></div>
                            <div className="card-body">
                                {!preview ? (
                                    <p className="text-muted small mb-0">
                                        Save + Resolve to see the real recipient count and a sample.
                                        Cached count: <strong>{audience.member_count ?? "—"}</strong>.
                                    </p>
                                ) : (
                                    <>
                                        <p className="mb-1"><strong>{preview.total}</strong> valid recipient{preview.total === 1 ? "" : "s"}</p>
                                        {preview.mergeKeys?.length > 0 && (
                                            <p className="small text-muted">Merge keys: {preview.mergeKeys.join(", ")}</p>
                                        )}
                                        <ul className="list-unstyled small mb-0">
                                            {(preview.sample || []).map((m) => (
                                                <li key={m.email} className="text-truncate">
                                                    {m.email}
                                                    <span className="text-muted"> {JSON.stringify(m.mergeData)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}
