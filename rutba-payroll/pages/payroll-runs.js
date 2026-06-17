import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { PayPayrollRunsEndpoints } from "@rutba/api-provider/endpoints";

const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (d) => (d ? new Date(d).toLocaleDateString() : "—");
const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };

function statusColor(s) {
    switch (s) {
        case "Processed": return "info";
        case "Paid": return "success";
        case "Approved": return "primary";
        case "Cancelled": return "danger";
        case "Draft": return "secondary";
        default: return "warning";
    }
}

export default function PayrollRuns() {
    const { jwt } = useAuth();
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [preview, setPreview] = useState(null);
    const [form, setForm] = useState({ period_start: monthStart(), period_end: todayStr() });

    const load = useCallback(() => {
        if (!jwt) return;
        setLoading(true);
        PayPayrollRunsEndpoints.list()
            .then((res) => setRuns(res.data || []))
            .catch((err) => setError(err?.message || "Failed to load runs"))
            .finally(() => setLoading(false));
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    async function createRun(e) {
        e.preventDefault();
        setBusy("create"); setError(null);
        try {
            await PayPayrollRunsEndpoints.create({ period_start: form.period_start, period_end: form.period_end, status: "Draft" });
            load();
        } catch (err) { setError(err?.message || "Failed to create run"); }
        finally { setBusy(null); }
    }

    async function act(run, action) {
        setBusy(run.documentId + action); setError(null); setPreview(null);
        try {
            if (action === "preview") {
                const res = await PayPayrollRunsEndpoints.runPreview(run.documentId);
                setPreview({ run, ...(res.data || {}) });
            } else if (action === "process") {
                await PayPayrollRunsEndpoints.process(run.documentId);
                load();
            } else if (action === "cancel") {
                await PayPayrollRunsEndpoints.cancel(run.documentId);
                load();
            }
        } catch (err) { setError(err?.message || `Failed to ${action}`); }
        finally { setBusy(null); }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Payroll Runs</h2>

                <form className="row g-2 align-items-end mb-3" onSubmit={createRun}>
                    <div className="col-auto">
                        <label className="form-label small mb-0">Period start</label>
                        <input type="date" className="form-control form-control-sm" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} required />
                    </div>
                    <div className="col-auto">
                        <label className="form-label small mb-0">Period end</label>
                        <input type="date" className="form-control form-control-sm" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} required />
                    </div>
                    <div className="col-auto">
                        <button className="btn btn-sm btn-success" disabled={busy === "create"}>{busy === "create" ? "Creating…" : "New run"}</button>
                    </div>
                </form>

                {error && <div className="alert alert-danger">{error}</div>}
                {loading && <p>Loading payroll runs…</p>}

                {!loading && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr><th>Period</th><th>Status</th><th className="text-end">Gross</th><th className="text-end">Deductions</th><th className="text-end">Net</th><th>Actions</th></tr>
                            </thead>
                            <tbody>
                                {runs.length === 0 && <tr><td colSpan={6} className="text-muted">No payroll runs yet.</td></tr>}
                                {runs.map((r) => (
                                    <tr key={r.id}>
                                        <td>{fmt(r.period_start)} — {fmt(r.period_end)}</td>
                                        <td><span className={`badge bg-${statusColor(r.status)}`}>{r.status || "Draft"}</span></td>
                                        <td className="text-end">{money(r.total_gross)}</td>
                                        <td className="text-end">{money(r.total_deductions)}</td>
                                        <td className="text-end">{money(r.total_net)}</td>
                                        <td>
                                            <div className="btn-group btn-group-sm">
                                                {["Draft", "Approved"].includes(r.status) && (
                                                    <>
                                                        <button className="btn btn-outline-secondary" disabled={!!busy} onClick={() => act(r, "preview")}>Preview</button>
                                                        <button className="btn btn-outline-success" disabled={!!busy} onClick={() => act(r, "process")}>Process</button>
                                                    </>
                                                )}
                                                {["Draft", "Approved", "Processed"].includes(r.status) && (
                                                    <button className="btn btn-outline-danger" disabled={!!busy} onClick={() => act(r, "cancel")}>Cancel</button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {preview && (
                    <div className="card mt-3">
                        <div className="card-header d-flex justify-content-between align-items-center">
                            <span>Preview — {fmt(preview.run.period_start)} → {fmt(preview.run.period_end)}</span>
                            <button className="btn-close" onClick={() => setPreview(null)} aria-label="Close" />
                        </div>
                        <div className="card-body">
                            <p className="mb-2">
                                <strong>{(preview.payslips || []).length}</strong> payslips ·
                                Gross <strong>{money(preview.totals?.gross)}</strong> ·
                                Deductions <strong>{money(preview.totals?.deductions)}</strong> ·
                                Net <strong>{money(preview.totals?.net)}</strong>
                            </p>
                            <div className="table-responsive">
                                <table className="table table-sm">
                                    <thead><tr><th>Employee</th><th className="text-end">Gross</th><th className="text-end">Deductions</th><th className="text-end">Net</th></tr></thead>
                                    <tbody>
                                        {(preview.payslips || []).map((p, i) => (
                                            <tr key={i}><td>{p.employee?.name || "—"}</td><td className="text-end">{money(p.gross)}</td><td className="text-end">{money(p.deductions)}</td><td className="text-end">{money(p.net)}</td></tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-muted small mb-0">Preview is a dry run — nothing is posted until you Process.</p>
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
