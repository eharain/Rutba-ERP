import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import { ReturnRequestsEndpoints } from "@rutba/api-provider/endpoints/index.js";
import { useToast } from "../components/Toast";

// Status filter chips drive the URL ?status= just like /sale-orders so
// sidebar links can deep-link to a particular queue.
const STATUS_LABELS = {
    REQUESTED:       "Pending Approval",
    APPROVED:        "Approved",
    AWAITING_PICKUP: "Awaiting Pickup",
    RECEIVED:        "Received",
    COMPLETED:       "Completed",
    REJECTED:        "Rejected",
    CANCELLED:       "Cancelled",
};
const VALID_STATUSES = new Set(Object.keys(STATUS_LABELS));

function statusBadge(status) {
    switch (status) {
        case "REQUESTED":       return "bg-warning text-dark";
        case "APPROVED":        return "bg-primary";
        case "AWAITING_PICKUP": return "bg-info text-dark";
        case "RECEIVED":        return "bg-info text-dark";
        case "COMPLETED":       return "bg-success";
        case "REJECTED":        return "bg-danger";
        case "CANCELLED":       return "bg-secondary";
        default:                return "bg-light text-muted border";
    }
}

export default function ReturnsInboxPage() {
    const router = useRouter();
    const { jwt } = useAuth();
    const { currency } = useUtil();
    const { toast, ToastContainer } = useToast();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageCount, setPageCount] = useState(1);

    const statusFromUrl = typeof router.query.status === "string" ? router.query.status : "";
    const activeStatus = VALID_STATUSES.has(statusFromUrl) ? statusFromUrl : "";

    useEffect(() => { setPage(1); }, [activeStatus]);

    const load = useCallback(async () => {
        if (!jwt || !router.isReady) return;
        setLoading(true);
        try {
            const res = await ReturnRequestsEndpoints.list({
                sort: ["createdAt:desc"],
                pagination: { page, pageSize: 25 },
                populate: ["sale_order", "items", "owners"],
                filters: activeStatus ? { status: { $eq: activeStatus } } : undefined,
            });
            setRows(res.data || []);
            setPageCount(res.meta?.pagination?.pageCount ?? 1);
        } catch (err) {
            console.error("Failed to load returns", err);
            toast("Failed to load returns.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt, router.isReady, page, activeStatus, toast]);

    useEffect(() => { load(); }, [load]);

    const heading = activeStatus
        ? `Returns · ${STATUS_LABELS[activeStatus]}`
        : "Returns";

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center justify-content-between mb-3">
                    <h2 className="mb-0">{heading}</h2>
                    <div className="d-flex gap-2">
                        {activeStatus && (
                            <Link className="btn btn-sm btn-outline-secondary" href="/returns">
                                <i className="fas fa-times me-1" />Clear filter
                            </Link>
                        )}
                        <button className="btn btn-sm btn-outline-secondary" onClick={load}>
                            <i className="fas fa-rotate me-1" />Refresh
                        </button>
                    </div>
                </div>

                {/* Quick-filter chips. Click sets ?status= and the URL drives the list. */}
                <div className="d-flex flex-wrap gap-2 mb-3">
                    {Object.entries(STATUS_LABELS).map(([key, label]) => (
                        <Link
                            key={key}
                            href={`/returns?status=${key}`}
                            className={`badge text-decoration-none ${activeStatus === key ? statusBadge(key) : "bg-light text-muted border"}`}
                        >
                            {label}
                        </Link>
                    ))}
                </div>

                {loading && <p>Loading returns…</p>}

                {!loading && rows.length === 0 && (
                    <div className="alert alert-info">
                        {activeStatus
                            ? `No returns in ${STATUS_LABELS[activeStatus]}.`
                            : "No returns yet. Customers can request a return from /profile/orders/[id] on the storefront."}
                    </div>
                )}

                {!loading && rows.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Return Ref</th>
                                    <th>Order</th>
                                    <th>Reason</th>
                                    <th>Items</th>
                                    <th>Refund</th>
                                    <th>Status</th>
                                    <th>Requested</th>
                                    <th style={{ minWidth: 100 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => {
                                    const lineCount = (r.items || []).length;
                                    const refundPaisa = Number(r.refund_amount_paisa || 0);
                                    return (
                                        <tr key={r.id}>
                                            <td>
                                                <Link href={`/returns/${r.documentId}`} className="text-decoration-none fw-semibold">
                                                    <code>{r.return_ref}</code>
                                                </Link>
                                            </td>
                                            <td>
                                                {r.sale_order?.documentId ? (
                                                    <Link href={`/${r.sale_order.documentId}/sale-order`} className="text-decoration-none">
                                                        <code className="small">{r.sale_order.order_id}</code>
                                                    </Link>
                                                ) : "—"}
                                            </td>
                                            <td className="small">{r.reason || "—"}</td>
                                            <td>{lineCount} {lineCount === 1 ? "line" : "lines"}</td>
                                            <td>{currency}{(refundPaisa / 100).toFixed(2)}</td>
                                            <td>
                                                <span className={`badge ${statusBadge(r.status)}`}>
                                                    {STATUS_LABELS[r.status] || r.status}
                                                </span>
                                            </td>
                                            <td style={{ whiteSpace: "nowrap" }}>{new Date(r.createdAt).toLocaleDateString()}</td>
                                            <td>
                                                <Link href={`/returns/${r.documentId}`} className="btn btn-sm btn-outline-primary">
                                                    <i className="fas fa-arrow-right me-1" />Review
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {pageCount > 1 && (
                    <nav>
                        <ul className="pagination pagination-sm">
                            {Array.from({ length: pageCount }, (_, i) => (
                                <li key={i + 1} className={`page-item ${page === i + 1 ? "active" : ""}`}>
                                    <button className="page-link" onClick={() => setPage(i + 1)}>{i + 1}</button>
                                </li>
                            ))}
                        </ul>
                    </nav>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
