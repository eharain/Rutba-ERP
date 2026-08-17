import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import PayslipPrint from "@rutba/pos-shared/components/PayslipPrint";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { PayPayslipsEndpoints } from "@rutba/api-provider/endpoints";

const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function MyPayslips() {
    const { jwt } = useAuth();
    const [slips, setSlips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState({});
    const [printSlip, setPrintSlip] = useState(null);

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        try {
            const res = await PayPayslipsEndpoints.listMyPayslips();
            setSlips(res?.data || []);
        } catch (err) {
            console.error("Failed to load payslips", err);
        } finally {
            setLoading(false);
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">My Payslips</h2>

                {loading && <p>Loading…</p>}
                {!loading && slips.length === 0 && <div className="alert alert-info">No payslips yet.</div>}
                {!loading && slips.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-hover align-middle">
                            <thead className="table-dark">
                                <tr><th>Period</th><th className="text-end">Gross</th><th className="text-end">Deductions</th><th className="text-end">Net</th><th>Status</th><th></th></tr>
                            </thead>
                            <tbody>
                                {slips.map((p) => (
                                    <Row key={p.id} p={p} open={!!open[p.id]} toggle={() => setOpen((s) => ({ ...s, [p.id]: !s[p.id] }))} onPrint={() => setPrintSlip(p)} />
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

function Row({ p, open, toggle, onPrint }) {
    const lines = p.lines || [];
    return (
        <>
            <tr>
                <td>{p.period || "—"}</td>
                <td className="text-end">{money(p.gross)}</td>
                <td className="text-end">{money(p.deductions)}</td>
                <td className="text-end fw-semibold">{money(p.net_pay)}</td>
                <td><span className={`badge bg-${p.status === "Paid" ? "success" : "warning"}`}>{p.status || "Pending"}</span></td>
                <td className="text-nowrap">
                    {lines.length > 0 && <button className="btn btn-sm btn-outline-secondary me-1" onClick={toggle}>{open ? "Hide" : "Details"}</button>}
                    <button className="btn btn-sm btn-outline-primary" onClick={onPrint}>Print</button>
                </td>
            </tr>
            {open && lines.length > 0 && (
                <tr>
                    <td colSpan={6} className="bg-light">
                        <table className="table table-sm mb-0">
                            <tbody>
                                {lines.map((l, i) => (
                                    <tr key={i}>
                                        <td>{l.label}{l.kind === "employer_contribution" ? " (employer)" : ""}</td>
                                        <td className="text-muted small">{l.category}</td>
                                        <td className={`text-end ${l.kind === "deduction" ? "text-danger" : ""}`}>
                                            {l.kind === "deduction" ? "-" : ""}{money(l.amount)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </td>
                </tr>
            )}
        </>
    );
}
