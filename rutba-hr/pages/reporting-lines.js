import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { HrEmployeesEndpoints, HrReportingLinesEndpoints } from "@rutba/api-provider/endpoints";

/**
 * Matrix (dotted-line) reporting.
 *
 * The PRIMARY line — who someone reports to — is edited on the org chart by
 * dragging. This page is for the additional lines a single manager field cannot
 * express: a project lead, a functional head, a temporary cover.
 *
 * The one control that matters here is "can approve": a line is documentation
 * unless it is ticked, and ticking it hands over real approval rights. The form
 * says so next to the box rather than in a tooltip.
 */

const today = () => new Date().toISOString().slice(0, 10);

function isActive(row) {
    const d = today();
    if (row.valid_from && row.valid_from > d) return false;
    if (row.valid_to && row.valid_to < d) return false;
    return true;
}

function windowLabel(row) {
    if (!row.valid_from && !row.valid_to) return "Always";
    if (row.valid_from && row.valid_to) return `${row.valid_from} → ${row.valid_to}`;
    if (row.valid_from) return `From ${row.valid_from}`;
    return `Until ${row.valid_to}`;
}

const EMPTY = {
    employee: "",
    manager: "",
    kind: "Dotted",
    grants_authority: false,
    valid_from: "",
    valid_to: "",
    note: "",
};

export default function ReportingLinesPage() {
    const { jwt } = useAuth();
    const [rows, setRows] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [error, setError] = useState(null);
    const [form, setForm] = useState(EMPTY);

    useEffect(() => { if (jwt) loadAll(); /* eslint-disable-next-line */ }, [jwt]);

    async function loadAll() {
        setLoading(true);
        try {
            const [lineRes, empRes] = await Promise.all([
                HrReportingLinesEndpoints.list({ populate: ["employee", "manager"], pageSize: 500 }),
                HrEmployeesEndpoints.list({ sort: ["name:asc"], pageSize: 1000 }),
            ]);
            setRows(lineRes?.data || []);
            setEmployees(empRes?.data || []);
            setError(null);
        } catch (err) {
            console.error("Failed to load reporting lines", err);
            setError("Could not load matrix reporting lines.");
        } finally {
            setLoading(false);
        }
    }

    const setField = (field, value) => setForm((p) => ({ ...p, [field]: value }));

    function resetForm() {
        setEditingId(null);
        setForm(EMPTY);
        setError(null);
    }

    function startEdit(row) {
        setEditingId(row.documentId);
        setForm({
            employee: row.employee?.documentId || "",
            manager: row.manager?.documentId || "",
            kind: row.kind || "Dotted",
            grants_authority: row.grants_authority === true,
            valid_from: row.valid_from || "",
            valid_to: row.valid_to || "",
            note: row.note || "",
        });
        setError(null);
    }

    async function submit(e) {
        e.preventDefault();
        if (!form.employee || !form.manager) return;
        if (form.valid_from && form.valid_to && form.valid_from > form.valid_to) {
            setError("The end date is before the start date.");
            return;
        }

        const data = {
            employee: { documentId: form.employee },
            manager: { documentId: form.manager },
            kind: form.kind,
            grants_authority: form.grants_authority,
            valid_from: form.valid_from || null,
            valid_to: form.valid_to || null,
            note: form.note?.trim() || null,
        };

        setSaving(true);
        setError(null);
        try {
            if (editingId) await HrReportingLinesEndpoints.update(editingId, data);
            else await HrReportingLinesEndpoints.create(data);
            resetForm();
            await loadAll();
        } catch (err) {
            console.error("Failed to save reporting line", err);
            // The server rejects self-loops and duplicates of the primary line
            // with a specific message — show it rather than a generic failure.
            setError(err?.response?.data?.error?.message || "Could not save this reporting line.");
        } finally {
            setSaving(false);
        }
    }

    async function remove(row) {
        const who = `${row.employee?.name || "this employee"} → ${row.manager?.name || "their manager"}`;
        const warning = row.grants_authority
            ? `\n\n${row.manager?.name} will lose the ability to approve for ${row.employee?.name}.`
            : "";
        if (!window.confirm(`Remove the ${(row.kind || "dotted").toLowerCase()} line ${who}?${warning}`)) return;
        try {
            await HrReportingLinesEndpoints.del(row.documentId);
            await loadAll();
        } catch (err) {
            console.error("Failed to remove reporting line", err);
            setError("Could not remove this reporting line.");
        }
    }

    const nameOf = useMemo(() => {
        const m = new Map(employees.map((e) => [e.documentId, e.name]));
        return (docId) => m.get(docId) || docId;
    }, [employees]);

    const grantingCount = rows.filter((r) => r.grants_authority && isActive(r)).length;

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-1">Matrix Reporting</h2>
                <p className="text-muted small mb-3">
                    Dotted-line and secondary managers — the relationships a single
                    &ldquo;reports to&rdquo; field cannot hold. The primary reporting line is
                    edited on the <a href="/org-chart">org chart</a>.
                </p>

                {error && <div className="alert alert-danger">{error}</div>}

                <div className="alert alert-secondary small">
                    A line here is <strong>documentation by default</strong>. Only lines marked
                    <em> can approve</em> change anything: those grant the manager the same rights
                    over the employee as the primary reporting line — approving leave, expense
                    claims, advances and loans, seeing payslips, writing appraisals.
                    {grantingCount > 0 && (
                        <> Currently <strong>{grantingCount}</strong> line{grantingCount === 1 ? " does" : "s do"}.</>
                    )}
                </div>

                <div className="card mb-4">
                    <div className="card-body">
                        <h5 className="card-title">{editingId ? "Edit line" : "Add a line"}</h5>
                        <form onSubmit={submit}>
                            <div className="row g-3">
                                <div className="col-md-4">
                                    <label className="form-label small">Employee</label>
                                    <select
                                        className="form-select"
                                        value={form.employee}
                                        onChange={(e) => setField("employee", e.target.value)}
                                        required
                                    >
                                        <option value="">Select…</option>
                                        {employees.map((e) => (
                                            <option key={e.documentId} value={e.documentId}>{e.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-md-4">
                                    <label className="form-label small">Also reports to</label>
                                    <select
                                        className="form-select"
                                        value={form.manager}
                                        onChange={(e) => setField("manager", e.target.value)}
                                        required
                                    >
                                        <option value="">Select…</option>
                                        {employees
                                            .filter((e) => e.documentId !== form.employee)
                                            .map((e) => (
                                                <option key={e.documentId} value={e.documentId}>{e.name}</option>
                                            ))}
                                    </select>
                                </div>

                                <div className="col-md-4">
                                    <label className="form-label small">Kind</label>
                                    <select
                                        className="form-select"
                                        value={form.kind}
                                        onChange={(e) => setField("kind", e.target.value)}
                                    >
                                        <option value="Dotted">Dotted (matrix / advisory)</option>
                                        <option value="Solid">Solid (co-manager)</option>
                                    </select>
                                </div>

                                <div className="col-md-3">
                                    <label className="form-label small">From</label>
                                    <input
                                        type="date"
                                        className="form-control"
                                        value={form.valid_from}
                                        onChange={(e) => setField("valid_from", e.target.value)}
                                    />
                                </div>

                                <div className="col-md-3">
                                    <label className="form-label small">Until</label>
                                    <input
                                        type="date"
                                        className="form-control"
                                        value={form.valid_to}
                                        onChange={(e) => setField("valid_to", e.target.value)}
                                    />
                                    <div className="form-text">Leave both blank for a permanent line.</div>
                                </div>

                                <div className="col-md-6">
                                    <label className="form-label small">Note</label>
                                    <input
                                        className="form-control"
                                        placeholder="e.g. Project lead for the Q3 migration"
                                        value={form.note}
                                        onChange={(e) => setField("note", e.target.value)}
                                    />
                                </div>

                                <div className="col-12">
                                    <div className={`form-check p-3 rounded border ${form.grants_authority ? "border-warning bg-warning-subtle" : ""}`}>
                                        <input
                                            className="form-check-input ms-0 me-2"
                                            type="checkbox"
                                            id="grants_authority"
                                            checked={form.grants_authority}
                                            onChange={(e) => setField("grants_authority", e.target.checked)}
                                        />
                                        <label className="form-check-label" htmlFor="grants_authority">
                                            <strong>Can approve</strong> — give{" "}
                                            {form.manager ? nameOf(form.manager) : "this manager"} approval
                                            authority over {form.employee ? nameOf(form.employee) : "this employee"}
                                            {" "}and everyone reporting up through them.
                                            <div className="small text-muted">
                                                Leave unticked to record the relationship without changing any
                                                permission.
                                            </div>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-3 d-flex gap-2">
                                <button className="btn btn-primary" disabled={saving || !form.employee || !form.manager}>
                                    {saving ? "Saving…" : editingId ? "Save changes" : "Add line"}
                                </button>
                                {editingId && (
                                    <button type="button" className="btn btn-outline-secondary" onClick={resetForm}>
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>

                {loading && <p>Loading…</p>}

                {!loading && rows.length === 0 && (
                    <div className="alert alert-info">
                        No matrix reporting lines yet. Everyone&apos;s authority comes from the
                        primary reporting line and the team graph.
                    </div>
                )}

                {!loading && rows.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-sm align-middle">
                            <thead>
                                <tr>
                                    <th>Employee</th>
                                    <th>Also reports to</th>
                                    <th>Kind</th>
                                    <th>Can approve</th>
                                    <th>Active</th>
                                    <th>Window</th>
                                    <th>Note</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => {
                                    const active = isActive(r);
                                    return (
                                        <tr key={r.documentId} className={active ? "" : "text-muted"}>
                                            <td>{r.employee?.name || "—"}</td>
                                            <td>{r.manager?.name || "—"}</td>
                                            <td>{r.kind || "Dotted"}</td>
                                            <td>
                                                {r.grants_authority ? (
                                                    <span className="badge bg-warning-subtle text-warning-emphasis border">
                                                        Yes
                                                    </span>
                                                ) : (
                                                    <span className="small text-muted">Advisory</span>
                                                )}
                                            </td>
                                            <td>
                                                {active ? (
                                                    <span className="badge bg-success-subtle text-success-emphasis border">Now</span>
                                                ) : (
                                                    <span className="small">Not now</span>
                                                )}
                                            </td>
                                            <td className="small">{windowLabel(r)}</td>
                                            <td className="small">{r.note || ""}</td>
                                            <td className="text-end">
                                                <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => startEdit(r)}>
                                                    Edit
                                                </button>
                                                <button className="btn btn-sm btn-outline-danger" onClick={() => remove(r)}>
                                                    Remove
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
