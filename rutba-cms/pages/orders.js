import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import { useToast } from "../components/Toast";

function getStatusBadgeClass(status) {
    const s = String(status || "").toUpperCase();
    switch (s) {
        case "PAID":
        case "SUCCEEDED":
        case "DELIVERED":
        case "paid": return "bg-success";
        case "FAILED":
        case "CANCELLED":
        case "unpaid": return "bg-danger";
        case "PENDING_PAYMENT":
        case "AWAITING_PICKUP":
        case "pending": return "bg-warning text-dark";
        case "OUT_FOR_DELIVERY":
        case "PAYMENT_CONFIRMED":
        case "PREPARING":
            return "bg-primary";
        default: return "bg-secondary";
    }
}

const STATUS_OPTIONS = [
    "PENDING_PAYMENT",
    "PAYMENT_CONFIRMED",
    "PREPARING",
    "AWAITING_PICKUP",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "FAILED_DELIVERY",
    "CANCELLED",
    "REFUND_INITIATED",
    "REFUNDED",
];

export default function Orders() {
    const { jwt } = useAuth();
    const { currency } = useUtil();
    const { toast, ToastContainer } = useToast();
    const [orders, setOrders] = useState([]);
    const [riders, setRiders] = useState([]);
    const [statusDraft, setStatusDraft] = useState({});
    const [riderDraft, setRiderDraft] = useState({});
    const [actionLoading, setActionLoading] = useState({});
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageCount, setPageCount] = useState(1);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await authApi.get("/orders", {
                sort: ["createdAt:desc"],
                pagination: { page, pageSize: 25 },
                populate: ["customer_contact", "delivery_method", "assigned_rider", "delivery_zone"],
            });
            setOrders(res.data || []);
            setPageCount(res.meta?.pagination?.pageCount ?? 1);

            const riderRes = await authApi.get("/riders", {
                sort: ["full_name:asc"],
                fields: ["documentId", "full_name", "status"],
                pagination: { pageSize: 200 },
            });
            setRiders(riderRes.data || []);
        } catch (err) {
            console.error("Failed to load orders", err);
        } finally {
            setLoading(false);
        }
    }, [jwt, page]);

    useEffect(() => { load(); }, [load]);

    const updateStatus = async (documentId) => {
        const status = statusDraft[documentId];
        if (!status) return;
        setActionLoading((p) => ({ ...p, [documentId + "-status"]: true }));
        try {
            await authApi.post(`/orders/${documentId}/update-status`, { status });
            toast("Order status updated.", "success");
            await load();
        } catch (err) {
            console.error("Failed to update order status", err);
            toast("Failed to update order status.", "danger");
        } finally {
            setActionLoading((p) => ({ ...p, [documentId + "-status"]: false }));
        }
    };

    const assignRider = async (documentId) => {
        const rider_document_id = riderDraft[documentId];
        if (!rider_document_id) return;
        setActionLoading((p) => ({ ...p, [documentId + "-rider"]: true }));
        try {
            await authApi.post(`/orders/${documentId}/assign-rider`, { rider_document_id });
            toast("Rider assigned.", "success");
            await load();
        } catch (err) {
            console.error("Failed to assign rider", err);
            toast("Failed to assign rider.", "danger");
        } finally {
            setActionLoading((p) => ({ ...p, [documentId + "-rider"]: false }));
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <h2 className="mb-3">Web Orders</h2>

                {loading && <p>Loading orders...</p>}

                {!loading && orders.length === 0 && (
                    <div className="alert alert-info">No orders found.</div>
                )}

                {!loading && orders.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Order ID</th>
                                    <th>Customer</th>
                                    <th>Method / Rider</th>
                                    <th>Total</th>
                                    <th>Order Status</th>
                                    <th>Payment</th>
                                    <th>Tracking</th>
                                    <th>Date</th>
                                    <th style={{ minWidth: 300 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map(o => (
                                    <tr key={o.id}>
                                        <td><code>{o.order_id}</code></td>
                                        <td>{o.customer_contact?.name || o.user_id || "—"}</td>
                                        <td>
                                            <div className="small">
                                                <div>{o.delivery_method?.name || "—"}</div>
                                                <div className="text-muted">{o.assigned_rider?.full_name || "No rider"}</div>
                                            </div>
                                        </td>
                                        <td>{currency}{parseFloat(o.total || 0).toFixed(2)}</td>
                                        <td>
                                            <span className={`badge ${getStatusBadgeClass(o.order_status)}`}>
                                                {o.order_status || "—"}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`badge ${getStatusBadgeClass(o.payment_status)}`}>
                                                {o.payment_status || "—"}
                                            </span>
                                        </td>
                                        <td>
                                            {o.tracking_code ? (
                                                o.tracking_url ? (
                                                    <a href={o.tracking_url} target="_blank" rel="noopener noreferrer">{o.tracking_code}</a>
                                                ) : (
                                                    o.tracking_code
                                                )
                                            ) : "—"}
                                        </td>
                                        <td style={{ whiteSpace: "nowrap" }}>{new Date(o.createdAt).toLocaleDateString()}</td>
                                        <td>
                                            <div className="d-flex flex-column gap-2">
                                                <div className="d-flex gap-1">
                                                    <select
                                                        className="form-select form-select-sm"
                                                        value={statusDraft[o.documentId] || ""}
                                                        onChange={(e) => setStatusDraft((p) => ({ ...p, [o.documentId]: e.target.value }))}
                                                    >
                                                        <option value="">Update Status…</option>
                                                        {STATUS_OPTIONS.map((s) => (
                                                            <option key={s} value={s}>{s}</option>
                                                        ))}
                                                    </select>
                                                    <button
                                                        className="btn btn-sm btn-primary"
                                                        onClick={() => updateStatus(o.documentId)}
                                                        disabled={!statusDraft[o.documentId] || actionLoading[o.documentId + "-status"]}
                                                    >
                                                        {actionLoading[o.documentId + "-status"] ? "..." : "Save"}
                                                    </button>
                                                </div>

                                                <div className="d-flex gap-1">
                                                    <select
                                                        className="form-select form-select-sm"
                                                        value={riderDraft[o.documentId] || ""}
                                                        onChange={(e) => setRiderDraft((p) => ({ ...p, [o.documentId]: e.target.value }))}
                                                    >
                                                        <option value="">Assign Rider…</option>
                                                        {riders
                                                            .filter((r) => ["available", "off_duty", "on_delivery"].includes(String(r.status || "")))
                                                            .map((r) => (
                                                                <option key={r.documentId} value={r.documentId}>
                                                                    {r.full_name} ({r.status || "n/a"})
                                                                </option>
                                                            ))}
                                                    </select>
                                                    <button
                                                        className="btn btn-sm btn-outline-dark"
                                                        onClick={() => assignRider(o.documentId)}
                                                        disabled={!riderDraft[o.documentId] || actionLoading[o.documentId + "-rider"]}
                                                    >
                                                        {actionLoading[o.documentId + "-rider"] ? "..." : "Assign"}
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
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

