import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { CmpTemplatesEndpoints } from "@rutba/api-provider/endpoints";

// Template library, grouped by folder the way RTMPLT did — a flat string label,
// not a hierarchy. Folders are cheap to change and nobody needed nesting.

const STATUS_BADGE = {
    Draft: "bg-secondary",
    Active: "bg-success",
    Archived: "bg-light text-muted border",
};

export default function TemplatesPage() {
    const { jwt } = useAuth();
    const router = useRouter();
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [notice, setNotice] = useState(null);
    const [creating, setCreating] = useState(false);

    const load = useCallback(() => {
        if (!jwt) return;
        setLoading(true);
        CmpTemplatesEndpoints.list({
            pageSize: 200,
            ...(query ? { search: query } : {}),
            ...(statusFilter ? { status: statusFilter } : {}),
        })
            .then((res) => setTemplates(res?.data || []))
            .catch((err) => setNotice({ type: "danger", text: `Failed to load templates: ${err.message}` }))
            .finally(() => setLoading(false));
    }, [jwt, query, statusFilter]);

    useEffect(() => { load(); }, [load]);

    const createTemplate = async () => {
        setCreating(true);
        try {
            const res = await CmpTemplatesEndpoints.create({
                name: "Untitled template",
                channel: "email",
                status: "Draft",
                subject: "",
                body_html: "",
            });
            const created = res?.data;
            if (created?.documentId) router.push(`/templates/${created.documentId}`);
            else load();
        } catch (err) {
            setNotice({ type: "danger", text: `Create failed: ${err.message}` });
        } finally {
            setCreating(false);
        }
    };

    const duplicate = async (t) => {
        try {
            await CmpTemplatesEndpoints.duplicateTemplate(t.documentId);
            setNotice({ type: "success", text: `Duplicated "${t.name}".` });
            load();
        } catch (err) {
            setNotice({ type: "danger", text: `Duplicate failed: ${err.message}` });
        }
    };

    const remove = async (t) => {
        if (!window.confirm(
            `Delete template "${t.name}"?\n\n`
            + "Campaigns that already sent using it keep their delivery history, "
            + "but any scheduled campaign pointing at it will have no template."
        )) return;
        try {
            await CmpTemplatesEndpoints.del(t.documentId);
            load();
        } catch (err) {
            setNotice({ type: "danger", text: `Delete failed: ${err.message}` });
        }
    };

    // Group by folder, "(no folder)" last.
    const folders = [...new Set(templates.map((t) => t.folder || ""))]
        .sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h2 className="mb-0">Templates</h2>
                    <button className="btn btn-primary" onClick={createTemplate} disabled={creating}>
                        <i className="fas fa-plus me-1"></i>{creating ? "Creating…" : "New Template"}
                    </button>
                </div>

                {notice && (
                    <div className={`alert alert-${notice.type} alert-dismissible`}>
                        {notice.text}
                        <button type="button" className="btn-close" onClick={() => setNotice(null)}></button>
                    </div>
                )}

                <form
                    className="row g-2 mb-3"
                    onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); }}
                >
                    <div className="col-md-5">
                        <input className="form-control" placeholder="Search by name…"
                            value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <div className="col-md-3">
                        <select className="form-select" value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}>
                            <option value="">All statuses</option>
                            <option value="Draft">Draft</option>
                            <option value="Active">Active</option>
                            <option value="Archived">Archived</option>
                        </select>
                    </div>
                    <div className="col-md-2">
                        <button className="btn btn-outline-secondary w-100">Search</button>
                    </div>
                </form>

                {loading ? (
                    <p className="text-muted">Loading…</p>
                ) : templates.length === 0 ? (
                    <div className="alert alert-light border">
                        No templates yet. Create one to open the studio.
                    </div>
                ) : (
                    folders.map((folder) => (
                        <div className="mb-4" key={folder || "__none"}>
                            <h6 className="text-muted text-uppercase small">
                                <i className="fas fa-folder me-1"></i>{folder || "No folder"}
                            </h6>
                            <div className="row g-3">
                                {templates.filter((t) => (t.folder || "") === folder).map((t) => (
                                    <div className="col-md-4" key={t.documentId}>
                                        <div className="card h-100">
                                            <div className="card-body">
                                                <div className="d-flex justify-content-between align-items-start">
                                                    <h6 className="card-title mb-1">{t.name}</h6>
                                                    <span className={`badge ${STATUS_BADGE[t.status] || "bg-secondary"}`}>
                                                        {t.status}
                                                    </span>
                                                </div>
                                                <p className="card-text small text-muted mb-2">
                                                    {t.subject || <em>No subject set</em>}
                                                </p>
                                                {Array.isArray(t.merge_keys) && t.merge_keys.length > 0 && (
                                                    <p className="small text-muted mb-2">
                                                        Needs: {t.merge_keys.map((k) => (
                                                            <code key={k} className="me-1">{`{{${k}}}`}</code>
                                                        ))}
                                                    </p>
                                                )}
                                                <Link className="btn btn-sm btn-outline-primary me-2"
                                                    href={`/templates/${t.documentId}`}>
                                                    Edit
                                                </Link>
                                                <button className="btn btn-sm btn-outline-secondary me-2"
                                                    onClick={() => duplicate(t)}>
                                                    Duplicate
                                                </button>
                                                <button className="btn btn-sm btn-outline-danger"
                                                    onClick={() => remove(t)}>
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </Layout>
        </ProtectedRoute>
    );
}
