import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { AppContextEndpoints, CashRegistersEndpoints } from "@rutba/api-provider/endpoints/index.js";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { isAppAdmin } from "@rutba/pos-shared/lib/roles";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";

/**
 * Cash Register Report
 * ────────────────────
 * A read-only audit view over register history that flags discrepancies a
 * manager should look at — negative/implausible expected cash, large shorts/
 * overs, registers closed without counting, expired-and-never-closed, and
 * opening-float mismatches. It computes everything from register-level fields
 * (no per-transaction fetches) so it stays fast and "simple".
 */

// A discrepancy each register may trip. `sev` drives the row colour + sort.
const SEVERITY_RANK = { high: 0, med: 1, low: 2 };

function analyzeRegister(reg, threshold, fmt) {
    const flags = [];
    const status = reg.status;
    const exp = reg.expected_cash != null ? Number(reg.expected_cash) : null;
    const counted = reg.counted_cash != null ? Number(reg.counted_cash) : null;
    const diff = reg.difference != null ? Number(reg.difference) : null;
    const closed = status === "Closed";

    // Impossible: a cash drawer can't be expected to hold negative cash.
    if (exp != null && exp < 0) {
        flags.push({ key: "NEG_EXPECTED", sev: "high", label: "Negative expected cash" });
    }
    // An expired register that was never reconciled/closed.
    if (status === "Expired" && !reg.closed_at) {
        flags.push({ key: "NOT_CLOSED", sev: "high", label: "Expired — never closed" });
    }
    // Closed but the counted cash is missing/zero while money was expected.
    if (closed && (counted == null || counted === 0) && exp != null && exp !== 0) {
        flags.push({ key: "UNCOUNTED", sev: "med", label: "Closed without counting" });
    }
    // Material shortage / overage at close.
    if (closed && diff != null && threshold > 0) {
        if (diff <= -threshold) flags.push({ key: "SHORT", sev: "high", label: `Short ${fmt(Math.abs(diff))}` });
        else if (diff >= threshold) flags.push({ key: "OVER", sev: "med", label: `Over ${fmt(diff)}` });
    }
    // Opening float didn't match the previous session's leftover.
    if (reg.opening_note) {
        flags.push({ key: "FLOAT", sev: "med", label: "Opening float mismatch" });
    }

    const topSev = flags.reduce((s, f) => Math.min(s, SEVERITY_RANK[f.sev] ?? 9), 9);
    return { flags, topSev: flags.length ? topSev : 9 };
}

export default function CashRegisterReportPage() {
    const { currency } = useUtil();
    const { adminAppAccess } = useAuth();
    const userIsAdmin = isAppAdmin(adminAppAccess, AppContextEndpoints.getAppName());

    const [registers, setRegisters] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const [threshold, setThreshold] = useState("500");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [onlyFlagged, setOnlyFlagged] = useState(true);

    const fmt = (v) => `${currency}${Number(v || 0).toFixed(2)}`;

    useEffect(() => {
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadAll = async () => {
        setLoading(true);
        setError(null);
        try {
            const filters = {};
            if (dateFrom) filters.opened_at = { ...(filters.opened_at || {}), $gte: dateFrom };
            if (dateTo) filters.opened_at = { ...(filters.opened_at || {}), $lte: dateTo + "T23:59:59.999Z" };

            // Non-admins are limited to the last 7 days (mirrors history page).
            if (!userIsAdmin) {
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                const minDate = weekAgo.toISOString().split("T")[0];
                const existingGte = filters.opened_at?.$gte;
                if (!existingGte || existingGte < minDate) {
                    filters.opened_at = { ...(filters.opened_at || {}), $gte: minDate };
                }
            }

            const all = [];
            const pageSize = 100;
            let page = 1;
            let pageCount = 1;
            do {
                const res = await CashRegistersEndpoints.list({
                    filters,
                    sort: ["opened_at:desc"],
                    page,
                    pageSize,
                });
                all.push(...(res?.data ?? []));
                pageCount = res?.meta?.pagination?.pageCount ?? 1;
                page += 1;
            } while (page <= pageCount && page <= 20); // hard cap: 2000 registers

            setRegisters(all);
        } catch (err) {
            console.error("Failed to load register report", err);
            setError("Failed to load registers");
        } finally {
            setLoading(false);
        }
    };

    const thresholdNum = Number(threshold || 0);

    // Analyse every register, then sort worst-first.
    const analyzed = useMemo(() => {
        return registers
            .map((reg) => ({ reg, ...analyzeRegister(reg, thresholdNum, fmt) }))
            .sort((a, b) => {
                if (a.topSev !== b.topSev) return a.topSev - b.topSev;
                const da = a.reg.opened_at ? new Date(a.reg.opened_at).getTime() : 0;
                const db = b.reg.opened_at ? new Date(b.reg.opened_at).getTime() : 0;
                return db - da;
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [registers, thresholdNum, currency]);

    const summary = useMemo(() => {
        const s = {
            count: registers.length,
            flagged: 0,
            negExpected: 0,
            uncounted: 0,
            notClosed: 0,
            floatMismatch: 0,
            shortTotal: 0,
            overTotal: 0,
            netDiff: 0,
        };
        for (const a of analyzed) {
            if (a.flags.length) s.flagged += 1;
            for (const f of a.flags) {
                if (f.key === "NEG_EXPECTED") s.negExpected += 1;
                if (f.key === "UNCOUNTED") s.uncounted += 1;
                if (f.key === "NOT_CLOSED") s.notClosed += 1;
                if (f.key === "FLOAT") s.floatMismatch += 1;
            }
            const diff = a.reg.status === "Closed" && a.reg.difference != null ? Number(a.reg.difference) : 0;
            if (diff < 0) s.shortTotal += diff;
            else if (diff > 0) s.overTotal += diff;
            s.netDiff += diff;
        }
        return s;
    }, [analyzed, registers.length]);

    const rows = onlyFlagged ? analyzed.filter((a) => a.flags.length > 0) : analyzed;

    const rowClass = (topSev) => (topSev === 0 ? "table-danger" : topSev === 1 ? "table-warning" : "");

    const sevBadge = (sev) => {
        const cls = sev === "high" ? "bg-danger" : sev === "med" ? "bg-warning text-dark" : "bg-secondary";
        return cls;
    };

    const statusBadge = (status) => {
        const cls = { Active: "bg-success", Open: "bg-success", Closed: "bg-secondary", Expired: "bg-warning text-dark", Cancelled: "bg-danger" }[status] || "bg-light text-dark";
        return <span className={`badge ${cls}`}>{status}</span>;
    };

    const Metric = ({ label, value, cls = "" }) => (
        <div className="col-6 col-md-3 col-xl">
            <div className="card text-center h-100"><div className="card-body py-2">
                <div className="text-muted small">{label}</div>
                <div className={`fw-bold ${cls}`}>{value}</div>
            </div></div>
        </div>
    );

    return (
        <ProtectedRoute>
            <Layout>
                <div className="p-3">
                    {/* Header */}
                    <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
                        <div>
                            <h4 className="mb-0"><i className="fas fa-triangle-exclamation me-2 text-warning"></i>Register Report</h4>
                            <div className="text-muted small">
                                Discrepancy audit across {summary.count} register{summary.count === 1 ? "" : "s"}
                                {!userIsAdmin ? " • last 7 days" : ""}
                            </div>
                        </div>
                        <div className="d-flex gap-1">
                            <Link href="/cash-register-history" className="btn btn-outline-secondary btn-sm">
                                <i className="fas fa-history me-1"></i>History
                            </Link>
                            <Link href="/cash-register" className="btn btn-outline-primary btn-sm">
                                <i className="fas fa-cash-register me-1"></i>Current Register
                            </Link>
                        </div>
                    </div>

                    {error && <div className="alert alert-danger">{error}</div>}

                    {/* Summary metrics */}
                    <div className="row g-2 mb-3">
                        <Metric label="Registers" value={summary.count} />
                        <Metric label="With Issues" value={summary.flagged} cls={summary.flagged > 0 ? "text-danger" : "text-success"} />
                        <Metric label="Total Short" value={fmt(Math.abs(summary.shortTotal))} cls="text-danger" />
                        <Metric label="Total Over" value={fmt(summary.overTotal)} cls="text-success" />
                        <Metric label="Net Diff" value={`${summary.netDiff >= 0 ? "+" : ""}${fmt(summary.netDiff)}`} cls={summary.netDiff >= 0 ? "text-success" : "text-danger"} />
                        <Metric label="Neg. Expected" value={summary.negExpected} cls={summary.negExpected > 0 ? "text-danger" : ""} />
                        <Metric label="Uncounted" value={summary.uncounted} cls={summary.uncounted > 0 ? "text-warning" : ""} />
                        <Metric label="Never Closed" value={summary.notClosed} cls={summary.notClosed > 0 ? "text-danger" : ""} />
                    </div>

                    {/* Controls */}
                    <div className="card mb-3">
                        <div className="card-body py-2">
                            <form className="row g-2 align-items-end" onSubmit={(e) => { e.preventDefault(); loadAll(); }}>
                                <div className="col-auto">
                                    <label className="form-label small text-muted mb-0">Flag diff ≥</label>
                                    <div className="input-group input-group-sm">
                                        <span className="input-group-text">{currency}</span>
                                        <input type="number" step="1" min="0" className="form-control" style={{ width: 90 }}
                                            value={threshold} onChange={(e) => setThreshold(e.target.value)} />
                                    </div>
                                </div>
                                <div className="col-auto">
                                    <label className="form-label small text-muted mb-0">From</label>
                                    <input type="date" className="form-control form-control-sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                                </div>
                                <div className="col-auto">
                                    <label className="form-label small text-muted mb-0">To</label>
                                    <input type="date" className="form-control form-control-sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                                </div>
                                <div className="col-auto">
                                    <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
                                        {loading ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="fas fa-rotate me-1"></i>}
                                        Refresh
                                    </button>
                                </div>
                                <div className="col-auto ms-auto">
                                    <div className="form-check">
                                        <input className="form-check-input" type="checkbox" id="onlyFlagged"
                                            checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
                                        <label className="form-check-label small" htmlFor="onlyFlagged">Only show flagged ({summary.flagged})</label>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>

                    {/* Report table */}
                    <div className="card">
                        <div className="card-body p-0">
                            {loading ? (
                                <div className="text-muted p-3"><span className="spinner-border spinner-border-sm me-2"></span>Analysing registers…</div>
                            ) : rows.length === 0 ? (
                                <div className="text-success p-3"><i className="fas fa-check-circle me-2"></i>No discrepancies found in this window.</div>
                            ) : (
                                <div className="table-responsive">
                                    <table className="table table-sm align-middle mb-0">
                                        <thead className="table-light">
                                            <tr>
                                                <th>#</th>
                                                <th>Desk</th>
                                                <th>Opened By</th>
                                                <th>Opened</th>
                                                <th>Status</th>
                                                <th className="text-end">Opening</th>
                                                <th className="text-end">Expected</th>
                                                <th className="text-end">Counted</th>
                                                <th className="text-end">Difference</th>
                                                <th>Issues</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map(({ reg, flags, topSev }) => (
                                                <tr key={reg.documentId ?? reg.id} className={rowClass(topSev)}>
                                                    <td>{reg.id}</td>
                                                    <td className="small">{reg.desk_name || `Desk ${reg.desk_id}`}</td>
                                                    <td className="small">{reg.opened_by || "-"}</td>
                                                    <td className="small text-nowrap">{reg.opened_at ? new Date(reg.opened_at).toLocaleDateString() : "-"}</td>
                                                    <td>{statusBadge(reg.status)}</td>
                                                    <td className="text-end">{fmt(reg.opening_cash)}</td>
                                                    <td className={`text-end ${reg.expected_cash != null && Number(reg.expected_cash) < 0 ? "text-danger fw-bold" : ""}`}>
                                                        {reg.expected_cash != null ? fmt(reg.expected_cash) : "-"}
                                                    </td>
                                                    <td className="text-end">{reg.counted_cash != null ? fmt(reg.counted_cash) : "-"}</td>
                                                    <td className="text-end">
                                                        {reg.difference != null ? (
                                                            <span className={Number(reg.difference) >= 0 ? "text-success" : "text-danger"}>
                                                                {Number(reg.difference) >= 0 ? "+" : ""}{fmt(reg.difference)}
                                                            </span>
                                                        ) : "-"}
                                                    </td>
                                                    <td>
                                                        {flags.length === 0 ? (
                                                            <span className="text-success small"><i className="fas fa-check"></i></span>
                                                        ) : (
                                                            <div className="d-flex flex-wrap gap-1">
                                                                {flags.map((f) => (
                                                                    <span key={f.key} className={`badge ${sevBadge(f.sev)}`}>{f.label}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <Link href={`/${reg.documentId}/cash-register-detail`} className="btn btn-outline-primary btn-sm">
                                                            <i className="fas fa-eye"></i>
                                                        </Link>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="text-muted small mt-2">
                        <i className="fas fa-circle-info me-1"></i>
                        Negative or implausible expected cash on older registers is usually the legacy exchange-return bug
                        (a credit applied to a new sale was double-counted as a cash payout) — fixed for new sales.
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}
