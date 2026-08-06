import { useState, useEffect, useMemo } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import EnumSelect from "@rutba/pos-shared/components/EnumSelect";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import {
    HrLetterTemplatesEndpoints,
    HrGeneratedDocumentsEndpoints,
    HrEmployeesEndpoints,
} from "@rutba/api-provider/endpoints";

function fmt(d) {
    return d ? new Date(d).toLocaleDateString() : "—";
}

// Filled from the employee record server-side — never prompted for on the form.
const AUTO_VARS = new Set([
    "employee_name", "designation", "department", "company",
    "cnic", "email", "date_of_joining", "today", "today_iso",
]);

function humanize(v) {
    return String(v).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Letters print client-side, matching the label-printing convention. */
function printLetter(doc) {
    const win = window.open("", "_blank", "width=800,height=900");
    if (!win) return alert("Please allow pop-ups to print this document.");
    const esc = (s) => String(s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
    win.document.write(`<!doctype html><html><head><title>${esc(doc.subject || doc.type)}</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;line-height:1.7;margin:48px;color:#111}
  h1{font-size:18px;margin:0 0 4px}
  .ref{color:#666;font-size:12px;margin-bottom:28px}
  .body{white-space:pre-wrap;font-size:14px}
  @media print{body{margin:24mm}}
</style></head><body>
<h1>${esc(doc.subject || doc.type)}</h1>
<div class="ref">Ref: ${esc(doc.reference_no)} &middot; ${esc(fmt(doc.generated_at))}</div>
<div class="body">${esc(doc.content)}</div>
</body></html>`);
    win.document.close();
    win.focus();
    win.print();
}

const BLANK_TEMPLATE = { name: "", type: "Custom", subject: "", body_template: "", available_variables: "", is_active: true };

export default function Letters() {
    const { jwt } = useAuth();
    const [tab, setTab] = useState("generate");
    const [templates, setTemplates] = useState([]);
    const [issued, setIssued] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [preview, setPreview] = useState(null);

    const [form, setForm] = useState({ template: "", employee: "" });
    const [vars, setVars] = useState({});
    const [editing, setEditing] = useState(null); // template being edited/created

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        const [t, d, e] = await Promise.allSettled([
            HrLetterTemplatesEndpoints.list({ pageSize: 100, sort: ["name:asc"] }),
            HrGeneratedDocumentsEndpoints.list({ pageSize: 200 }),
            HrEmployeesEndpoints.list({ pageSize: 500, sort: ["name:asc"] }),
        ]);
        if (t.status === "fulfilled") setTemplates(t.value?.data || []);
        if (d.status === "fulfilled") setIssued(d.value?.data || []);
        if (e.status === "fulfilled") setEmployees(e.value?.data || []);
        setLoading(false);
    }

    const activeTemplates = templates.filter((t) => t.is_active !== false);
    const selected = templates.find((t) => t.documentId === form.template) || null;

    // Only the variables the server cannot fill itself need prompting.
    const promptFor = useMemo(() => {
        const list = Array.isArray(selected?.available_variables) ? selected.available_variables : [];
        return list.filter((v) => !AUTO_VARS.has(v));
    }, [selected]);

    async function generate(e) {
        e.preventDefault();
        if (!form.template || !form.employee) return;
        setBusy(true);
        try {
            const res = await HrGeneratedDocumentsEndpoints.generate({
                template: form.template,
                employee: form.employee,
                variables: vars,
            });
            setPreview(res?.data || null);
            setVars({});
            await load();
        } catch (err) {
            console.error("Generate failed", err);
            alert("Could not generate the letter.");
        } finally {
            setBusy(false);
        }
    }

    function startEdit(t) {
        setEditing(t
            ? {
                documentId: t.documentId,
                name: t.name,
                type: t.type || "Custom",
                subject: t.subject || "",
                body_template: t.body_template || "",
                available_variables: (Array.isArray(t.available_variables) ? t.available_variables : []).join(", "),
                is_active: t.is_active !== false,
            }
            : { ...BLANK_TEMPLATE });
    }

    async function saveTemplate(e) {
        e.preventDefault();
        if (!editing.name.trim() || !editing.body_template.trim()) return;
        setBusy(true);
        const payload = {
            name: editing.name.trim(),
            type: editing.type,
            subject: editing.subject || null,
            body_template: editing.body_template,
            available_variables: editing.available_variables
                .split(",").map((s) => s.trim()).filter(Boolean),
            is_active: editing.is_active,
        };
        try {
            if (editing.documentId) await HrLetterTemplatesEndpoints.update(editing.documentId, payload);
            else await HrLetterTemplatesEndpoints.create(payload);
            setEditing(null);
            await load();
        } catch (err) {
            console.error("Save template failed", err);
            alert("Could not save the template.");
        } finally {
            setBusy(false);
        }
    }

    async function toggleActive(t) {
        setBusy(true);
        try {
            await HrLetterTemplatesEndpoints.update(t.documentId, { is_active: !(t.is_active !== false) });
            await load();
        } catch (err) {
            console.error("Toggle failed", err);
            alert("Could not change the template.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-1">Letters &amp; Documents</h2>
                <p className="text-muted small mb-3">
                    Issue letters from a template. Content is frozen at generation time, so editing a
                    template never rewrites a letter that has already been issued.
                </p>

                <ul className="nav nav-tabs mb-3">
                    <li className="nav-item">
                        <button type="button" className={`nav-link ${tab === "generate" ? "active" : ""}`} onClick={() => setTab("generate")}>
                            <i className="fa-solid fa-file-signature me-1"></i>Generate
                        </button>
                    </li>
                    <li className="nav-item">
                        <button type="button" className={`nav-link ${tab === "templates" ? "active" : ""}`} onClick={() => setTab("templates")}>
                            <i className="fa-solid fa-file-pen me-1"></i>Templates
                            {templates.length > 0 && <span className="badge bg-secondary ms-2">{templates.length}</span>}
                        </button>
                    </li>
                </ul>

                {loading && <p>Loading…</p>}

                {!loading && tab === "generate" && (
                    <>
                        <form className="card card-body mb-4" onSubmit={generate}>
                            <div className="row g-2">
                                <div className="col-md-6">
                                    <label className="form-label small">Template</label>
                                    <select className="form-select" value={form.template} required
                                        onChange={(ev) => { setForm((p) => ({ ...p, template: ev.target.value })); setVars({}); }}>
                                        <option value="">Choose…</option>
                                        {activeTemplates.map((t) => (
                                            <option key={t.id} value={t.documentId}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-md-6">
                                    <label className="form-label small">Employee</label>
                                    <select className="form-select" value={form.employee} required
                                        onChange={(ev) => setForm((p) => ({ ...p, employee: ev.target.value }))}>
                                        <option value="">Choose…</option>
                                        {employees.map((e) => <option key={e.id} value={e.documentId}>{e.name}</option>)}
                                    </select>
                                </div>

                                {promptFor.length > 0 && (
                                    <div className="col-12">
                                        <div className="border-top pt-2 mt-2">
                                            <div className="small text-muted mb-2">
                                                This letter needs a few details — the rest come from the employee record.
                                            </div>
                                            <div className="row g-2">
                                                {promptFor.map((v) => (
                                                    <div className="col-md-4" key={v}>
                                                        <label className="form-label small">{humanize(v)}</label>
                                                        <input
                                                            className="form-control form-control-sm"
                                                            value={vars[v] || ""}
                                                            onChange={(ev) => setVars((p) => ({ ...p, [v]: ev.target.value }))}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="col-12 text-end">
                                    <button className="btn btn-primary" disabled={busy || !activeTemplates.length}>
                                        {busy ? "Generating…" : "Generate"}
                                    </button>
                                </div>
                            </div>

                            {activeTemplates.length === 0 && (
                                <div className="alert alert-warning mt-3 mb-0 py-2 small">
                                    No active templates. Add one on the Templates tab, or re-run the
                                    <code className="mx-1">hr-letter-templates</code> seed to restore the standard set.
                                </div>
                            )}
                        </form>

                        {preview && (
                            <div className="card mb-4 border-success">
                                <div className="card-body">
                                    <div className="d-flex justify-content-between align-items-start">
                                        <div>
                                            <h6 className="mb-1">{preview.subject || preview.type}</h6>
                                            <div className="small text-muted mb-2">Ref: {preview.reference_no}</div>
                                        </div>
                                        <button className="btn btn-sm btn-outline-primary" onClick={() => printLetter(preview)}>
                                            <i className="fa-solid fa-print me-1"></i>Print
                                        </button>
                                    </div>
                                    <pre className="small mb-0" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{preview.content}</pre>
                                </div>
                            </div>
                        )}

                        <h5 className="mb-2">Issued</h5>
                        {issued.length === 0 ? <div className="alert alert-info">No letters issued yet.</div> : (
                            <div className="table-responsive">
                                <table className="table table-striped align-middle">
                                    <thead className="table-dark"><tr><th>Employee</th><th>Document</th><th>Reference</th><th>Issued</th><th></th></tr></thead>
                                    <tbody>
                                        {issued.map((d) => (
                                            <tr key={d.id}>
                                                <td>{d.employee?.name || "—"}</td>
                                                <td>{d.subject || d.type}</td>
                                                <td className="small text-muted">{d.reference_no || "—"}</td>
                                                <td>{fmt(d.generated_at)}</td>
                                                <td>
                                                    <button className="btn btn-sm btn-outline-secondary" onClick={() => printLetter(d)}>
                                                        <i className="fa-solid fa-print"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}

                {!loading && tab === "templates" && (
                    <>
                        {!editing && (
                            <div className="d-flex justify-content-end mb-2">
                                <button className="btn btn-sm btn-primary" onClick={() => startEdit(null)}>
                                    <i className="fa-solid fa-plus me-1"></i>New template
                                </button>
                            </div>
                        )}

                        {editing && (
                            <form className="card card-body mb-4 border-primary" onSubmit={saveTemplate}>
                                <h6 className="mb-3">{editing.documentId ? "Edit template" : "New template"}</h6>
                                <div className="row g-2">
                                    <div className="col-md-6">
                                        <label className="form-label small">Name</label>
                                        <input className="form-control" value={editing.name} required
                                            onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))} />
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label small">Type</label>
                                        <EnumSelect name="hr-letter-template" field="type" value={editing.type}
                                            onChange={(e) => setEditing((p) => ({ ...p, type: e.target.value }))} />
                                    </div>
                                    <div className="col-md-3 d-flex align-items-end">
                                        <div className="form-check mb-2">
                                            <input className="form-check-input" type="checkbox" id="tpl-active" checked={editing.is_active}
                                                onChange={(e) => setEditing((p) => ({ ...p, is_active: e.target.checked }))} />
                                            <label className="form-check-label small" htmlFor="tpl-active">Active</label>
                                        </div>
                                    </div>
                                    <div className="col-12">
                                        <label className="form-label small">Subject / heading</label>
                                        <input className="form-control" value={editing.subject}
                                            onChange={(e) => setEditing((p) => ({ ...p, subject: e.target.value }))} />
                                    </div>
                                    <div className="col-12">
                                        <label className="form-label small">Body</label>
                                        <textarea className="form-control font-monospace" rows={12} required
                                            style={{ fontSize: "0.85rem" }}
                                            value={editing.body_template}
                                            onChange={(e) => setEditing((p) => ({ ...p, body_template: e.target.value }))} />
                                        <div className="form-text">
                                            Use <code>{"{variable}"}</code> placeholders. Filled automatically:{" "}
                                            {[...AUTO_VARS].map((v) => <code key={v} className="me-1">{v}</code>)}
                                        </div>
                                    </div>
                                    <div className="col-12">
                                        <label className="form-label small">Extra variables (comma separated)</label>
                                        <input className="form-control" placeholder="salary, purpose, last_working_day"
                                            value={editing.available_variables}
                                            onChange={(e) => setEditing((p) => ({ ...p, available_variables: e.target.value }))} />
                                        <div className="form-text">These become input boxes on the Generate form.</div>
                                    </div>
                                    <div className="col-12 d-flex gap-2 justify-content-end">
                                        <button type="button" className="btn btn-outline-secondary" onClick={() => setEditing(null)}>Cancel</button>
                                        <button className="btn btn-primary" disabled={busy}>Save</button>
                                    </div>
                                </div>
                            </form>
                        )}

                        {templates.length === 0 ? (
                            <div className="alert alert-info">
                                No templates yet. Add one above, or run the <code>hr-letter-templates</code> seed
                                for the standard set (offer, confirmation, experience, salary, NOC, warning, relieving).
                            </div>
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-striped align-middle">
                                    <thead className="table-dark"><tr><th>Name</th><th>Type</th><th>Variables</th><th>Status</th><th></th></tr></thead>
                                    <tbody>
                                        {templates.map((t) => (
                                            <tr key={t.id}>
                                                <td>
                                                    <div className="fw-semibold">{t.name}</div>
                                                    {t.subject && <div className="small text-muted">{t.subject}</div>}
                                                </td>
                                                <td>{t.type}</td>
                                                <td className="small text-muted">
                                                    {(Array.isArray(t.available_variables) ? t.available_variables : [])
                                                        .filter((v) => !AUTO_VARS.has(v)).join(", ") || "—"}
                                                </td>
                                                <td>
                                                    {t.is_active !== false
                                                        ? <span className="badge bg-success">Active</span>
                                                        : <span className="badge bg-secondary">Inactive</span>}
                                                </td>
                                                <td>
                                                    <div className="d-flex gap-1">
                                                        <button className="btn btn-sm btn-outline-primary" onClick={() => startEdit(t)} disabled={busy}>Edit</button>
                                                        <button className="btn btn-sm btn-outline-secondary" onClick={() => toggleActive(t)} disabled={busy}>
                                                            {t.is_active !== false ? "Disable" : "Enable"}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
