import { useEffect } from "react";

// Client-side printable payslip overlay (no server-side PDF — same approach as
// the other print views). Renders an on-screen sheet; the Print button calls
// window.print() and the @media print rules isolate the sheet so only it prints.
// Pass a payslip with `employee` and `lines` populated.

const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .payslip-print-area, .payslip-print-area * { visibility: visible !important; }
  .payslip-print-overlay { position: absolute !important; inset: auto !important; background: #fff !important; padding: 0 !important; }
  .payslip-print-area { position: absolute; left: 0; top: 0; width: 100%; max-width: none !important; box-shadow: none !important; border-radius: 0 !important; }
  .payslip-print-noprint { display: none !important; }
}
`;

export default function PayslipPrint({ payslip, company, onClose }) {
    useEffect(() => {
        function onKey(e) { if (e.key === "Escape") onClose?.(); }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    if (!payslip) return null;
    const lines = payslip.lines || [];
    const earnings = lines.filter((l) => l.kind === "earning");
    const deductions = lines.filter((l) => l.kind === "deduction");
    const employer = lines.filter((l) => l.kind === "employer_contribution");

    return (
        <div className="payslip-print-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 2000, overflowY: "auto", padding: "2rem" }}>
            <style>{PRINT_CSS}</style>
            <div className="payslip-print-area" style={{ background: "#fff", maxWidth: 720, margin: "0 auto", padding: "2rem", borderRadius: 6 }}>
                <div className="d-flex justify-content-between align-items-start mb-3 border-bottom pb-2">
                    <div>
                        <h4 className="mb-0">{company?.name || "Payslip"}</h4>
                        {company?.name ? <div className="text-muted small">Payslip</div> : null}
                    </div>
                    <div className="text-end small">
                        <div><strong>Period:</strong> {payslip.period || "—"}</div>
                        <div><strong>Status:</strong> {payslip.status || "Pending"}</div>
                        {payslip.paid_at ? <div><strong>Paid:</strong> {new Date(payslip.paid_at).toLocaleDateString()}</div> : null}
                    </div>
                </div>

                <div className="mb-3">
                    <strong>Employee:</strong> {payslip.employee?.name || "—"}
                    {payslip.payment_method ? <span className="ms-3"><strong>Method:</strong> {payslip.payment_method}</span> : null}
                </div>

                <table className="table table-sm">
                    <thead><tr><th>Earnings</th><th className="text-end">Amount</th></tr></thead>
                    <tbody>
                        {earnings.length ? earnings.map((l, i) => <tr key={i}><td>{l.label}</td><td className="text-end">{money(l.amount)}</td></tr>) : <tr><td colSpan={2} className="text-muted">—</td></tr>}
                        <tr className="fw-semibold"><td>Gross</td><td className="text-end">{money(payslip.gross)}</td></tr>
                    </tbody>
                </table>

                <table className="table table-sm">
                    <thead><tr><th>Deductions</th><th className="text-end">Amount</th></tr></thead>
                    <tbody>
                        {deductions.length ? deductions.map((l, i) => <tr key={i}><td>{l.label}</td><td className="text-end">{money(l.amount)}</td></tr>) : <tr><td colSpan={2} className="text-muted">—</td></tr>}
                        <tr className="fw-semibold"><td>Total deductions</td><td className="text-end">{money(payslip.deductions)}</td></tr>
                    </tbody>
                </table>

                <table className="table mb-3">
                    <tbody><tr className="fw-bold fs-5"><td>Net Pay</td><td className="text-end">{money(payslip.net_pay)}</td></tr></tbody>
                </table>

                {employer.length > 0 && (
                    <table className="table table-sm">
                        <thead><tr><th className="text-muted">Employer contributions (not deducted from you)</th><th className="text-end">Amount</th></tr></thead>
                        <tbody>{employer.map((l, i) => <tr key={i}><td>{l.label}</td><td className="text-end">{money(l.amount)}</td></tr>)}</tbody>
                    </table>
                )}

                <div className="payslip-print-noprint d-flex gap-2 justify-content-end mt-3">
                    <button className="btn btn-outline-secondary" onClick={onClose}>Close</button>
                    <button className="btn btn-primary" onClick={() => window.print()}><i className="fas fa-print me-1" />Print</button>
                </div>
            </div>
        </div>
    );
}
