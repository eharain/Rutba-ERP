import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import {
    HrLeaveRequestsEndpoints,
    HrExpenseClaimsEndpoints,
    PayLoansEndpoints,
    PayAdvancesEndpoints,
} from "@rutba/api-provider/endpoints";

function fmtDate(d) {
    return d ? new Date(d).toLocaleDateString() : "—";
}

/**
 * Every queue a line manager can act on, in one place. Each entry owns its
 * endpoints and its columns; the page itself stays generic so adding a future
 * approval type is a config entry, not new UI code.
 *
 * `listTeam` is server-scoped: HR/payroll managers get org-wide rows, a line
 * manager gets only their reports, and a plain employee is rejected (handled
 * per-queue as `denied` rather than failing the whole page).
 */
const QUEUES = [
    {
        key: "leave",
        label: "Leave",
        icon: "fa-plane-departure",
        api: HrLeaveRequestsEndpoints,
        load: () => HrLeaveRequestsEndpoints.listTeamQueue(),
        columns: ["Employee", "Type", "From", "To", "Days", "Reason"],
        cells: (r) => [
            r.employee?.name || "—",
            r.leave_type || "—",
            fmtDate(r.start_date),
            fmtDate(r.end_date),
            r.total_days ?? "—",
            r.reason || "—",
        ],
    },
    {
        key: "expense",
        label: "Expense Claims",
        icon: "fa-file-invoice-dollar",
        api: HrExpenseClaimsEndpoints,
        load: () => HrExpenseClaimsEndpoints.listTeam(),
        columns: ["Employee", "Category", "Date", "Amount", "Description"],
        cells: (r) => [
            r.employee?.name || "—",
            r.category || "—",
            fmtDate(r.claim_date),
            r.amount ?? "—",
            r.description || "—",
        ],
    },
    {
        key: "loan",
        label: "Loans",
        icon: "fa-hand-holding-dollar",
        api: PayLoansEndpoints,
        load: () => PayLoansEndpoints.listTeam(),
        columns: ["Employee", "Principal", "Installments", "Reason"],
        cells: (r) => [
            r.employee?.name || "—",
            r.principal_amount ?? "—",
            r.installments_count ?? "—",
            r.reason || "—",
        ],
    },
    {
        key: "advance",
        label: "Advances",
        icon: "fa-money-bill-transfer",
        api: PayAdvancesEndpoints,
        load: () => PayAdvancesEndpoints.listTeam(),
        columns: ["Employee", "Amount", "Requested", "Reason"],
        cells: (r) => [
            r.employee?.name || "—",
            r.amount ?? "—",
            fmtDate(r.requested_date),
            r.reason || "—",
        ],
    },
];

export default function Approvals() {
    const { jwt } = useAuth();
    const [active, setActive] = useState(QUEUES[0].key);
    // per-queue: { rows, denied, loading }
    const [state, setState] = useState(() =>
        Object.fromEntries(QUEUES.map((q) => [q.key, { rows: [], denied: false, loading: true }])),
    );
    const [actionLoading, setActionLoading] = useState({});

    const loadQueue = useCallback(async (q) => {
        setState((p) => ({ ...p, [q.key]: { ...p[q.key], loading: true } }));
        try {
            const res = await q.load();
            setState((p) => ({ ...p, [q.key]: { rows: res?.data || [], denied: false, loading: false } }));
        } catch (err) {
            // A plain employee has no team queue — that's a 403, not a page error.
            setState((p) => ({ ...p, [q.key]: { rows: [], denied: true, loading: false } }));
        }
    }, []);

    useEffect(() => {
        if (!jwt) return;
        QUEUES.forEach((q) => loadQueue(q));
    }, [jwt, loadQueue]);

    async function decide(q, documentId, action) {
        const key = `${q.key}:${documentId}:${action}`;
        let reason = null;
        if (action === "reject") {
            reason = window.prompt("Reason for rejection (optional):");
            if (reason === null) return;
        }
        setActionLoading((p) => ({ ...p, [key]: true }));
        try {
            if (action === "approve") await q.api.approve(documentId);
            else await q.api.reject(documentId, { reason: reason || null });
            await loadQueue(q);
        } catch (err) {
            console.error(`Failed to ${action} ${q.key}`, err);
            alert(`Failed to ${action} this ${q.label.toLowerCase()} request.`);
        } finally {
            setActionLoading((p) => ({ ...p, [key]: false }));
        }
    }

    const allDenied = QUEUES.every((q) => state[q.key].denied);
    const anyLoading = QUEUES.some((q) => state[q.key].loading);
    const activeQueue = QUEUES.find((q) => q.key === active);
    const activeState = state[active];

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-1">Approvals</h2>
                <p className="text-muted small mb-3">Pending requests from your team, awaiting your decision.</p>

                {anyLoading && <p>Loading…</p>}

                {!anyLoading && allDenied && (
                    <div className="alert alert-secondary">
                        You don&apos;t manage a team, so there&apos;s nothing to approve here.
                    </div>
                )}

                {!anyLoading && !allDenied && (
                    <>
                        <ul className="nav nav-tabs mb-3">
                            {QUEUES.filter((q) => !state[q.key].denied).map((q) => (
                                <li className="nav-item" key={q.key}>
                                    <button
                                        type="button"
                                        className={`nav-link ${active === q.key ? "active" : ""}`}
                                        onClick={() => setActive(q.key)}
                                    >
                                        <i className={`fa-solid ${q.icon} me-1`}></i>
                                        {q.label}
                                        {state[q.key].rows.length > 0 && (
                                            <span className="badge bg-danger ms-2">{state[q.key].rows.length}</span>
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>

                        {activeState.denied ? (
                            <div className="alert alert-secondary">You can&apos;t act on {activeQueue.label.toLowerCase()}.</div>
                        ) : activeState.rows.length === 0 ? (
                            <div className="alert alert-info">No pending {activeQueue.label.toLowerCase()} requests.</div>
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-striped table-hover align-middle">
                                    <thead className="table-dark">
                                        <tr>
                                            {activeQueue.columns.map((c) => <th key={c}>{c}</th>)}
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activeState.rows.map((r) => (
                                            <tr key={r.id}>
                                                {activeQueue.cells(r).map((v, i) => <td key={i}>{v}</td>)}
                                                <td>
                                                    <div className="d-flex gap-1">
                                                        <button
                                                            className="btn btn-sm btn-success"
                                                            onClick={() => decide(activeQueue, r.documentId, "approve")}
                                                            disabled={actionLoading[`${activeQueue.key}:${r.documentId}:approve`]}
                                                        >
                                                            Approve
                                                        </button>
                                                        <button
                                                            className="btn btn-sm btn-danger"
                                                            onClick={() => decide(activeQueue, r.documentId, "reject")}
                                                            disabled={actionLoading[`${activeQueue.key}:${r.documentId}:reject`]}
                                                        >
                                                            Reject
                                                        </button>
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
