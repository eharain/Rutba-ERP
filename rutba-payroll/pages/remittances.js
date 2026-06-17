import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { PayStatutoryRemittancesEndpoints } from "@rutba/api-provider/endpoints";

const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const METHODS = ["Bank", "Cash", "Mobile Wallet"];
const EMPTY = { reference: "", authority: "", gl_account_key: "STATUTORY_PAYABLE", amount: "", period_label: "", method: "Bank", notes: "" };

export default function Remittances() {
    const { jwt } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        try { const res = await PayStatutoryRemittancesEndpoints.list(); setRows(res?.data || []); }
        catch (err) { setError(err?.message || "Failed to load"); }
        finally { setLoading(false); }
    }

    async function submit(e) {
        e.preventDefault();
        if (!(Number(form.amount) > 0)) { alert("Amount must be positive."); return; }
        setSaving(true); setError(null);
        try {
            await PayStatutoryRemittancesEndpoints.create({
                reference: form.reference || null,
                authority: form.authority || null,
                gl_account_key: form.gl_account_key.trim() || "STATUTORY_PAYABLE",
                amount: Number(form.amount),
                period_label: form.period_label || null,
                method: form.method,
                notes: form.notes || null,
                status: "Pending",
            });
            setForm(EMPTY);
            await load();
        } catch (err) { setError(err?.message || "Failed to create"); }
        finally { setSaving(false); }
    }

    async function postRemittance(r) {
        if (!confirm(`Post remittance of ${money(r.amount)} and mark it paid?`)) return;
        setBusy(r.documentId); setError(null);
        try { await PayStatutoryRemittancesEndpoints.process(r.documentId); await load(); }
        catch (err) { setError(err?.message || "Failed to post"); }
        finally { setBusy(null); }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-1">Statutory Remittances</h2>
                <p className="text-muted small">Pay withheld statutory liabilities (tax / social security / pension) to the authority. Posting debits the liability account and credits cash/bank.</p>

                {error && <div className="alert alert-danger">{error}</div>}

                <div className="card mb-4">
                    <div className="card-header bg-light fw-semibold">New Remittance</div>
                    <div className="card-body">
                        <form onSubmit={submit}>
                            <div className="row g-2 align-items-end">
                                <div className="col-md-3"><label className="form-label">Authority</label><input className="form-control" value={form.authority} onChange={(e) => setForm((p) => ({ ...p, authority: e.target.value }))} placeholder="e.g. Tax Office" /></div>
                                <div className="col-md-2"><label className="form-label">GL account key</label><input className="form-control" value={form.gl_account_key} onChange={(e) => setForm((p) => ({ ...p, gl_account_key: e.target.value }))} /></div>
                                <div className="col-md-2"><label className="form-label">Amount</label><input type="number" step="0.01" className="form-control" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} required /></div>
                                <div className="col-md-2"><label className="form-label">Period</label><input className="form-control" value={form.period_label} onChange={(e) => setForm((p) => ({ ...p, period_label: e.target.value }))} placeholder="e.g. 2026-05" /></div>
                                <div className="col-md-2"><label className="form-label">Method</label><select className="form-select" value={form.method} onChange={(e) => setForm((p) => ({ ...p, method: e.target.value }))}>{METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
                                <div className="col-md-1 d-grid"><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "…" : "Add"}</button></div>
                                <div className="col-md-4"><label className="form-label">Reference</label><input className="form-control" value={form.reference} onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))} /></div>
                                <div className="col-md-8"><label className="form-label">Notes</label><input className="form-control" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></div>
                            </div>
                        </form>
                    </div>
                </div>

                {loading && <p>Loading…</p>}
                {!loading && rows.length === 0 && <div className="alert alert-info">No remittances yet.</div>}
                {!loading && rows.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover align-middle">
                            <thead className="table-dark"><tr><th>Authority</th><th>Account</th><th className="text-end">Amount</th><th>Period</th><th>Method</th><th>Status</th><th>Paid</th><th>Action</th></tr></thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.id}>
                                        <td>{r.authority || "—"}{r.reference ? <span className="text-muted small d-block">{r.reference}</span> : null}</td>
                                        <td className="small"><code>{r.gl_account_key || "STATUTORY_PAYABLE"}</code></td>
                                        <td className="text-end">{money(r.amount)}</td>
                                        <td>{r.period_label || "—"}</td>
                                        <td>{r.method || "—"}</td>
                                        <td><span className={`badge bg-${r.status === "Paid" ? "success" : r.status === "Cancelled" ? "secondary" : "warning"}`}>{r.status || "Pending"}</span></td>
                                        <td className="small">{r.paid_at ? new Date(r.paid_at).toLocaleDateString() : "—"}</td>
                                        <td>{r.status === "Pending" && <button className="btn btn-sm btn-outline-success" disabled={busy === r.documentId} onClick={() => postRemittance(r)}>{busy === r.documentId ? "…" : "Post & Pay"}</button>}</td>
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

export async function getServerSideProps() { return { props: {} }; }
