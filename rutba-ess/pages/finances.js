import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { PayLoansEndpoints, PayAdvancesEndpoints, PayBonusesEndpoints } from "@rutba/api-provider/endpoints";

const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Finances() {
    const { jwt } = useAuth();
    const [loans, setLoans] = useState([]);
    const [advances, setAdvances] = useState([]);
    const [bonuses, setBonuses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loanForm, setLoanForm] = useState({ principal_amount: "", installments_count: 1, reason: "" });
    const [advanceForm, setAdvanceForm] = useState({ amount: "", reason: "" });
    const [saving, setSaving] = useState(false);

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        try {
            const [loanRes, advRes, bonusRes] = await Promise.all([
                PayLoansEndpoints.listMine(),
                PayAdvancesEndpoints.listMine(),
                PayBonusesEndpoints.listMine(),
            ]);
            setLoans(loanRes?.data || []);
            setAdvances(advRes?.data || []);
            setBonuses(bonusRes?.data || []);
        } catch (err) {
            console.error("Failed to load finances", err);
        } finally {
            setLoading(false);
        }
    }

    async function submitLoan(e) {
        e.preventDefault();
        if (!loanForm.principal_amount) return;
        setSaving(true);
        try {
            await PayLoansEndpoints.request({
                principal_amount: Number(loanForm.principal_amount),
                installments_count: Number(loanForm.installments_count) || 1,
                reason: loanForm.reason || null,
            });
            setLoanForm({ principal_amount: "", installments_count: 1, reason: "" });
            await load();
        } catch (err) {
            console.error("Failed to request loan", err);
            alert("Failed to submit loan request.");
        } finally {
            setSaving(false);
        }
    }

    async function submitAdvance(e) {
        e.preventDefault();
        if (!advanceForm.amount) return;
        setSaving(true);
        try {
            await PayAdvancesEndpoints.request({
                amount: Number(advanceForm.amount),
                reason: advanceForm.reason || null,
            });
            setAdvanceForm({ amount: "", reason: "" });
            await load();
        } catch (err) {
            console.error("Failed to request advance", err);
            alert("Failed to submit advance request.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">My Finances</h2>

                <div className="row">
                    <div className="col-md-6">
                        <div className="card mb-4">
                            <div className="card-header bg-light fw-semibold">Request a Loan</div>
                            <div className="card-body">
                                <form onSubmit={submitLoan} className="row g-2 align-items-end mb-3">
                                    <div className="col-6">
                                        <label className="form-label small">Amount</label>
                                        <input type="number" className="form-control form-control-sm" value={loanForm.principal_amount} onChange={(e) => setLoanForm((p) => ({ ...p, principal_amount: e.target.value }))} required />
                                    </div>
                                    <div className="col-3">
                                        <label className="form-label small">Installments</label>
                                        <input type="number" min="1" className="form-control form-control-sm" value={loanForm.installments_count} onChange={(e) => setLoanForm((p) => ({ ...p, installments_count: e.target.value }))} />
                                    </div>
                                    <div className="col-3 d-grid">
                                        <button className="btn btn-sm btn-primary" type="submit" disabled={saving}>Request</button>
                                    </div>
                                    <div className="col-12">
                                        <input className="form-control form-control-sm" placeholder="Reason" value={loanForm.reason} onChange={(e) => setLoanForm((p) => ({ ...p, reason: e.target.value }))} />
                                    </div>
                                </form>

                                {!loading && loans.length === 0 && <p className="small text-muted mb-0">No loans yet.</p>}
                                {!loading && loans.length > 0 && (
                                    <table className="table table-sm mb-0">
                                        <thead><tr><th>Amount</th><th>Status</th><th>Installment</th><th>Repaid</th></tr></thead>
                                        <tbody>
                                            {loans.map((l) => (
                                                <tr key={l.id}>
                                                    <td>{money(l.principal_amount)}</td>
                                                    <td><span className={`badge bg-${statusColor(l.status)}`}>{l.status}</span></td>
                                                    <td>{money(l.installment_amount)}</td>
                                                    <td>{money(l.amount_repaid)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="col-md-6">
                        <div className="card mb-4">
                            <div className="card-header bg-light fw-semibold">Request a Salary Advance</div>
                            <div className="card-body">
                                <form onSubmit={submitAdvance} className="row g-2 align-items-end mb-3">
                                    <div className="col-6">
                                        <label className="form-label small">Amount</label>
                                        <input type="number" className="form-control form-control-sm" value={advanceForm.amount} onChange={(e) => setAdvanceForm((p) => ({ ...p, amount: e.target.value }))} required />
                                    </div>
                                    <div className="col-6 d-grid">
                                        <button className="btn btn-sm btn-primary" type="submit" disabled={saving}>Request</button>
                                    </div>
                                    <div className="col-12">
                                        <input className="form-control form-control-sm" placeholder="Reason" value={advanceForm.reason} onChange={(e) => setAdvanceForm((p) => ({ ...p, reason: e.target.value }))} />
                                    </div>
                                </form>

                                {!loading && advances.length === 0 && <p className="small text-muted mb-0">No advances yet.</p>}
                                {!loading && advances.length > 0 && (
                                    <table className="table table-sm mb-0">
                                        <thead><tr><th>Amount</th><th>Status</th><th>Requested</th></tr></thead>
                                        <tbody>
                                            {advances.map((a) => (
                                                <tr key={a.id}>
                                                    <td>{money(a.amount)}</td>
                                                    <td><span className={`badge bg-${statusColor(a.status)}`}>{a.status}</span></td>
                                                    <td>{a.requested_date ? new Date(a.requested_date).toLocaleDateString() : "—"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="card mb-4">
                    <div className="card-header bg-light fw-semibold">Bonuses</div>
                    <div className="card-body p-0">
                        {!loading && bonuses.length === 0 && <p className="small text-muted mb-0 p-3">No bonuses yet.</p>}
                        {!loading && bonuses.length > 0 && (
                            <table className="table table-sm mb-0">
                                <thead><tr><th>Type</th><th>Amount</th><th>Status</th><th>Payment Date</th></tr></thead>
                                <tbody>
                                    {bonuses.map((b) => (
                                        <tr key={b.id}>
                                            <td>{b.type}</td>
                                            <td>{money(b.amount)}</td>
                                            <td><span className={`badge bg-${statusColor(b.status)}`}>{b.status}</span></td>
                                            <td>{b.payment_date ? new Date(b.payment_date).toLocaleDateString() : "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

function statusColor(status) {
    switch (status) {
        case "Approved": case "Active": case "Paid": return "success";
        case "Rejected": return "danger";
        case "Requested": case "Pending": return "warning";
        case "Closed": case "Recovered": return "secondary";
        default: return "secondary";
    }
}
