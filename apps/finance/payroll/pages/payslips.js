import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import PayslipPrint from "@rutba/pos-shared/components/PayslipPrint";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { PayPayslipsEndpoints } from "@rutba/api-provider/endpoints";

const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Payslips() {
    const { jwt } = useAuth();
    const [payslips, setPayslips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [printSlip, setPrintSlip] = useState(null);

    const load = useCallback(() => {
        if (!jwt) return;
        setLoading(true);
        PayPayslipsEndpoints.list()
            .then((res) => setPayslips(res.data || []))
            .catch((err) => setError(err?.message || "Failed to load payslips"))
            .finally(() => setLoading(false));
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    async function markPaid(p) {
        setBusy(p.documentId); setError(null);
        try {
            await PayPayslipsEndpoints.setPaid(p.documentId, { method: "Bank" });
            load();
        } catch (err) { setError(err?.message || "Failed to mark paid"); }
        finally { setBusy(null); }
    }

    async function openPrint(p) {
        setBusy(p.documentId); setError(null);
        try {
            const res = await PayPayslipsEndpoints.byId(p.documentId);
            setPrintSlip(res?.data || res || p);
        } catch (err) {
            setError(err?.message || "Failed to load payslip");
        } finally { setBusy(null); }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h2 className="mb-0">Payslips</h2>
                </div>

                {error && <div className="alert alert-danger">{error}</div>}
                {loading && <p>Loading payslips…</p>}
                {!loading && payslips.length === 0 && <div className="alert alert-info">No payslips found.</div>}

                {!loading && payslips.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr><th>Employee</th><th>Period</th><th className="text-end">Gross</th><th className="text-end">Deductions</th><th className="text-end">Net</th><th>Status</th><th>Action</th></tr>
                            </thead>
                            <tbody>
                                {payslips.map((p) => (
                                    <tr key={p.id}>
                                        <td>{p.employee?.name || "—"}</td>
                                        <td>{p.period || "—"}</td>
                                        <td className="text-end">{money(p.gross)}</td>
                                        <td className="text-end">{money(p.deductions)}</td>
                                        <td className="text-end">{money(p.net_pay)}</td>
                                        <td><span className={`badge bg-${p.status === "Paid" ? "success" : "warning"}`}>{p.status || "Pending"}</span></td>
                                        <td className="text-nowrap">
                                            <button className="btn btn-sm btn-outline-primary me-1" disabled={busy === p.documentId} onClick={() => openPrint(p)}>Print</button>
                                            {p.status !== "Paid" && (
                                                <button className="btn btn-sm btn-outline-success" disabled={busy === p.documentId} onClick={() => markPaid(p)}>
                                                    {busy === p.documentId ? "…" : "Mark paid"}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {printSlip && <PayslipPrint payslip={printSlip} onClose={() => setPrintSlip(null)} />}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
