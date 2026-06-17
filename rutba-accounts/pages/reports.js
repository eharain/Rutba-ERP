import { useState } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { AccJournalEntriesEndpoints } from "@rutba/api-provider/endpoints";

const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;

const REPORTS = [
    { key: "trial-balance", label: "Trial Balance", range: "period" },
    { key: "income-statement", label: "Income Statement", range: "period" },
    { key: "balance-sheet", label: "Balance Sheet", range: "asof" },
    { key: "cash-flow", label: "Cash Flow", range: "period" },
    { key: "ar-aging", label: "AR Aging", range: "asof" },
    { key: "ap-aging", label: "AP Aging", range: "asof" },
];

export default function Reports() {
    const { jwt } = useAuth();
    const [active, setActive] = useState("trial-balance");
    const [from, setFrom] = useState(yearStart());
    const [to, setTo] = useState(today());
    const [asOf, setAsOf] = useState(today());
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const meta = REPORTS.find((r) => r.key === active);

    async function run() {
        if (!jwt) return;
        setLoading(true); setError(null); setData(null);
        try {
            const E = AccJournalEntriesEndpoints;
            let res;
            if (active === "trial-balance") res = await E.getTrialBalance({ from, to });
            else if (active === "income-statement") res = await E.getIncomeStatement({ from, to });
            else if (active === "balance-sheet") res = await E.getBalanceSheet({ asOf });
            else if (active === "cash-flow") res = await E.getCashFlow({ from, to });
            else if (active === "ar-aging") res = await E.getArAging({ asOf });
            else if (active === "ap-aging") res = await E.getApAging({ asOf });
            setData(res?.data || null);
        } catch (err) {
            setError(err?.message || "Failed to run report");
        } finally {
            setLoading(false);
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Financial Reports</h2>

                <div className="d-flex flex-wrap gap-2 mb-3">
                    {REPORTS.map((r) => (
                        <button key={r.key}
                            className={`btn btn-sm ${active === r.key ? "btn-primary" : "btn-outline-primary"}`}
                            onClick={() => { setActive(r.key); setData(null); setError(null); }}>
                            {r.label}
                        </button>
                    ))}
                </div>

                <div className="row g-2 align-items-end mb-3">
                    {meta?.range === "period" && (
                        <>
                            <div className="col-auto">
                                <label className="form-label small mb-0">From</label>
                                <input type="date" className="form-control form-control-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
                            </div>
                            <div className="col-auto">
                                <label className="form-label small mb-0">To</label>
                                <input type="date" className="form-control form-control-sm" value={to} onChange={(e) => setTo(e.target.value)} />
                            </div>
                        </>
                    )}
                    {meta?.range === "asof" && (
                        <div className="col-auto">
                            <label className="form-label small mb-0">As of</label>
                            <input type="date" className="form-control form-control-sm" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
                        </div>
                    )}
                    <div className="col-auto">
                        <button className="btn btn-sm btn-success" onClick={run} disabled={loading}>
                            {loading ? "Running…" : "Run report"}
                        </button>
                    </div>
                </div>

                {error && <div className="alert alert-danger">{error}</div>}
                {!loading && data && <ReportView reportKey={active} data={data} />}
            </Layout>
        </ProtectedRoute>
    );
}

function ReportView({ reportKey, data }) {
    if (reportKey === "trial-balance") {
        return (
            <div className="table-responsive">
                <table className="table table-sm table-striped">
                    <thead className="table-dark"><tr><th>Code</th><th>Account</th><th className="text-end">Debit</th><th className="text-end">Credit</th></tr></thead>
                    <tbody>
                        {(data.rows || []).map((r, i) => (
                            <tr key={i}><td>{r.code}</td><td>{r.name}</td><td className="text-end">{r.debit ? money(r.debit) : ""}</td><td className="text-end">{r.credit ? money(r.credit) : ""}</td></tr>
                        ))}
                    </tbody>
                    <tfoot><tr className="fw-bold"><td colSpan={2}>Totals {data.balanced ? "✓ balanced" : "⚠ unbalanced"}</td><td className="text-end">{money(data.totals?.debit)}</td><td className="text-end">{money(data.totals?.credit)}</td></tr></tfoot>
                </table>
            </div>
        );
    }
    if (reportKey === "income-statement") {
        return (
            <table className="table table-sm" style={{ maxWidth: 480 }}>
                <tbody>
                    <tr><td>Revenue</td><td className="text-end">{money(data.revenue)}</td></tr>
                    <tr><td>Cost of Goods Sold</td><td className="text-end">({money(data.cogs)})</td></tr>
                    <tr className="fw-bold border-top"><td>Gross Profit</td><td className="text-end">{money(data.gross_profit)}</td></tr>
                    <tr><td>Operating Expenses</td><td className="text-end">({money(data.expenses)})</td></tr>
                    <tr className="fw-bold border-top"><td>Net Profit</td><td className="text-end">{money(data.net_profit)}</td></tr>
                </tbody>
            </table>
        );
    }
    if (reportKey === "balance-sheet") {
        return (
            <table className="table table-sm" style={{ maxWidth: 480 }}>
                <tbody>
                    <tr><td>Assets</td><td className="text-end">{money(data.assets)}</td></tr>
                    <tr><td>Liabilities</td><td className="text-end">{money(data.liabilities)}</td></tr>
                    <tr><td>Equity (incl. period profit)</td><td className="text-end">{money(data.equity)}</td></tr>
                    <tr className="fw-bold border-top"><td>Liabilities + Equity {data.balanced ? "✓" : "⚠"}</td><td className="text-end">{money((data.liabilities || 0) + (data.equity || 0))}</td></tr>
                </tbody>
            </table>
        );
    }
    if (reportKey === "cash-flow") {
        return (
            <table className="table table-sm" style={{ maxWidth: 480 }}>
                <tbody>
                    {Object.entries(data.by_source || {}).map(([k, v]) => (
                        <tr key={k}><td>{k}</td><td className="text-end">{money(v)}</td></tr>
                    ))}
                    <tr className="fw-bold border-top"><td>Net change in cash</td><td className="text-end">{money(data.net_change)}</td></tr>
                </tbody>
            </table>
        );
    }
    const b = data.buckets || {};
    return (
        <div className="table-responsive">
            <table className="table table-sm" style={{ maxWidth: 600 }}>
                <thead className="table-dark"><tr><th>Current</th><th>31–60</th><th>61–90</th><th>90+</th><th>Total</th></tr></thead>
                <tbody><tr>
                    <td>{money(b.current)}</td><td>{money(b.d31_60)}</td><td>{money(b.d61_90)}</td><td>{money(b.d90_plus)}</td><td className="fw-bold">{money(data.total)}</td>
                </tr></tbody>
            </table>
        </div>
    );
}

export async function getServerSideProps() { return { props: {} }; }
