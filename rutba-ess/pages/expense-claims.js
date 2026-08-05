import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { HrExpenseClaimsEndpoints, UploadEndpoints } from "@rutba/api-provider/endpoints";
import EnumSelect from "@rutba/pos-shared/components/EnumSelect";

const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ExpenseClaims() {
    const { jwt } = useAuth();
    const [claims, setClaims] = useState([]);
    const [team, setTeam] = useState([]);
    const [hasTeam, setHasTeam] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [actionLoading, setActionLoading] = useState({});
    const [form, setForm] = useState({ category: "Other", claim_date: "", amount: "", description: "" });
    const [file, setFile] = useState(null);

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        try {
            const res = await HrExpenseClaimsEndpoints.listMine();
            setClaims(res?.data || []);
        } catch (err) {
            console.error("Failed to load claims", err);
        }
        try {
            const res = await HrExpenseClaimsEndpoints.listTeam();
            setTeam(res?.data || []);
            setHasTeam(true);
        } catch (err) {
            setHasTeam(false);
            setTeam([]);
        } finally {
            setLoading(false);
        }
    }

    async function submit(e) {
        e.preventDefault();
        if (!form.amount || !form.claim_date) return;
        setSaving(true);
        try {
            const created = await HrExpenseClaimsEndpoints.submit({
                category: form.category,
                claim_date: form.claim_date,
                amount: Number(form.amount),
                description: form.description || null,
            });
            const row = created?.data;
            if (row?.id && file) {
                await UploadEndpoints.uploadFiles(file, "hr-expense-claim", "receipt", row.id);
            }
            setForm({ category: "Other", claim_date: "", amount: "", description: "" });
            setFile(null);
            await load();
        } catch (err) {
            console.error("Failed to submit claim", err);
            alert("Failed to submit expense claim.");
        } finally {
            setSaving(false);
        }
    }

    async function decide(documentId, action) {
        const key = `${documentId}:${action}`;
        let reason = null;
        if (action === "reject") {
            reason = window.prompt("Reason for rejection (optional):");
            if (reason === null) return;
        }
        setActionLoading((p) => ({ ...p, [key]: true }));
        try {
            if (action === "approve") await HrExpenseClaimsEndpoints.approve(documentId);
            else await HrExpenseClaimsEndpoints.reject(documentId, { reason: reason || null });
            await load();
        } catch (err) {
            console.error(`Failed to ${action}`, err);
            alert(`Failed to ${action} the claim.`);
        } finally {
            setActionLoading((p) => ({ ...p, [key]: false }));
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Expense Claims</h2>

                <div className="card mb-4">
                    <div className="card-header bg-light fw-semibold">Submit a Claim</div>
                    <div className="card-body">
                        <form onSubmit={submit} className="row g-2 align-items-end">
                            <div className="col-md-2">
                                <label className="form-label">Category</label>
                                <EnumSelect
                                    name="hr-expense-claim"
                                    field="category"
                                    value={form.category}
                                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                                />
                            </div>
                            <div className="col-md-2">
                                <label className="form-label">Date</label>
                                <input type="date" className="form-control" value={form.claim_date} onChange={(e) => setForm((p) => ({ ...p, claim_date: e.target.value }))} required />
                            </div>
                            <div className="col-md-2">
                                <label className="form-label">Amount</label>
                                <input type="number" className="form-control" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} required />
                            </div>
                            <div className="col-md-3">
                                <label className="form-label">Description</label>
                                <input className="form-control" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
                            </div>
                            <div className="col-md-2">
                                <label className="form-label">Receipt</label>
                                <input type="file" className="form-control" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                            </div>
                            <div className="col-md-1 d-grid">
                                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "..." : "Submit"}</button>
                            </div>
                        </form>
                    </div>
                </div>

                {loading && <p>Loading…</p>}
                {!loading && claims.length === 0 && <div className="alert alert-info">No expense claims yet.</div>}
                {!loading && claims.length > 0 && (
                    <div className="table-responsive mb-4">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr><th>Category</th><th>Date</th><th>Amount</th><th>Status</th><th>Description</th></tr>
                            </thead>
                            <tbody>
                                {claims.map((c) => (
                                    <tr key={c.id}>
                                        <td>{c.category}</td>
                                        <td>{c.claim_date ? new Date(c.claim_date).toLocaleDateString() : "—"}</td>
                                        <td>{money(c.amount)}</td>
                                        <td><span className={`badge bg-${statusColor(c.status)}`}>{c.status}</span></td>
                                        <td>{c.description || "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {!loading && hasTeam && (
                    <>
                        <h2 className="mb-3 mt-4">Team Claims</h2>
                        {team.length === 0
                            ? <div className="alert alert-info">No pending claims from your team.</div>
                            : (
                                <div className="table-responsive">
                                    <table className="table table-striped table-hover align-middle">
                                        <thead className="table-dark">
                                            <tr><th>Employee</th><th>Category</th><th>Date</th><th>Amount</th><th>Description</th><th>Actions</th></tr>
                                        </thead>
                                        <tbody>
                                            {team.map((c) => (
                                                <tr key={c.id}>
                                                    <td>{c.employee?.name || "—"}</td>
                                                    <td>{c.category}</td>
                                                    <td>{c.claim_date ? new Date(c.claim_date).toLocaleDateString() : "—"}</td>
                                                    <td>{money(c.amount)}</td>
                                                    <td>{c.description || "—"}</td>
                                                    <td>
                                                        <div className="d-flex gap-1">
                                                            <button className="btn btn-sm btn-success" onClick={() => decide(c.documentId, "approve")} disabled={actionLoading[`${c.documentId}:approve`]}>Approve</button>
                                                            <button className="btn btn-sm btn-danger" onClick={() => decide(c.documentId, "reject")} disabled={actionLoading[`${c.documentId}:reject`]}>Reject</button>
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

function statusColor(status) {
    switch (status) {
        case "Approved": case "Reimbursed": return "success";
        case "Rejected": return "danger";
        case "Submitted": return "warning";
        default: return "secondary";
    }
}
