import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import {
    HrLetterTemplatesEndpoints,
    HrGeneratedDocumentsEndpoints,
    HrEmployeesEndpoints,
} from "@rutba/api-provider/endpoints";

function fmt(d) {
    return d ? new Date(d).toLocaleDateString() : "—";
}

export default function Letters() {
    const { jwt } = useAuth();
    const [templates, setTemplates] = useState([]);
    const [issued, setIssued] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({ template: "", employee: "" });
    const [preview, setPreview] = useState(null);

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        const [t, d, e] = await Promise.allSettled([
            HrLetterTemplatesEndpoints.list({ pageSize: 100 }),
            HrGeneratedDocumentsEndpoints.list({ pageSize: 200 }),
            HrEmployeesEndpoints.list({ pageSize: 500, sort: ["name:asc"] }),
        ]);
        if (t.status === "fulfilled") setTemplates(t.value?.data || []);
        if (d.status === "fulfilled") setIssued(d.value?.data || []);
        if (e.status === "fulfilled") setEmployees(e.value?.data || []);
        setLoading(false);
    }

    async function generate(e) {
        e.preventDefault();
        if (!form.template || !form.employee) return;
        setBusy(true);
        try {
            const res = await HrGeneratedDocumentsEndpoints.generate({ ...form });
            setPreview(res?.data || null);
            setForm({ template: "", employee: "" });
            await load();
        } catch (err) {
            console.error("Generate failed", err);
            alert("Could not generate the letter.");
        } finally {
            setBusy(false);
        }
    }

    const activeTemplates = templates.filter((t) => t.is_active !== false);

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-1">Letters &amp; Documents</h2>
                <p className="text-muted small mb-3">
                    Generate a letter from a template. Content is frozen at generation time, so editing a
                    template never rewrites a letter that has already been issued.
                </p>

                <form className="card card-body mb-4" onSubmit={generate}>
                    <div className="row g-2 align-items-end">
                        <div className="col-md-5">
                            <label className="form-label small">Template</label>
                            <select className="form-select" value={form.template}
                                onChange={(ev) => setForm((p) => ({ ...p, template: ev.target.value }))} required>
                                <option value="">Choose…</option>
                                {activeTemplates.map((t) => (
                                    <option key={t.id} value={t.documentId}>{t.name} ({t.type})</option>
                                ))}
                            </select>
                        </div>
                        <div className="col-md-5">
                            <label className="form-label small">Employee</label>
                            <select className="form-select" value={form.employee}
                                onChange={(ev) => setForm((p) => ({ ...p, employee: ev.target.value }))} required>
                                <option value="">Choose…</option>
                                {employees.map((e) => (
                                    <option key={e.id} value={e.documentId}>{e.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="col-md-2">
                            <button className="btn btn-primary w-100" disabled={busy || !activeTemplates.length}>
                                {busy ? "Generating…" : "Generate"}
                            </button>
                        </div>
                    </div>
                    {activeTemplates.length === 0 && !loading && (
                        <div className="alert alert-warning mt-3 mb-0 py-2 small">
                            No active letter templates exist yet. Create one in the Strapi admin under HR Letter Template.
                        </div>
                    )}
                </form>

                {preview && (
                    <div className="card mb-4 border-success">
                        <div className="card-body">
                            <h6 className="mb-1">{preview.subject || preview.type}</h6>
                            <div className="small text-muted mb-2">Ref: {preview.reference_no}</div>
                            <pre className="small mb-0" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{preview.content}</pre>
                        </div>
                    </div>
                )}

                <h5 className="mb-2">Issued</h5>
                {loading && <p>Loading…</p>}
                {!loading && issued.length === 0 && <div className="alert alert-info">No letters issued yet.</div>}
                {!loading && issued.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped align-middle">
                            <thead className="table-dark"><tr><th>Employee</th><th>Document</th><th>Reference</th><th>Issued</th></tr></thead>
                            <tbody>
                                {issued.map((d) => (
                                    <tr key={d.id}>
                                        <td>{d.employee?.name || "—"}</td>
                                        <td>{d.subject || d.type}</td>
                                        <td className="small text-muted">{d.reference_no || "—"}</td>
                                        <td>{fmt(d.generated_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
