import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import { useToast } from "../components/Toast";
import Link from "next/link";

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

export default function SaleOrdersPage() {
    const { jwt } = useAuth();
    const { currency } = useUtil();
    const { toast, ToastContainer } = useToast();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageCount, setPageCount] = useState(1);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await authApi.get("/sale-orders", {
                sort: ["createdAt:desc"],
                pagination: { page, pageSize: 25 },
                populate: ["customer_contact", "delivery_method", "assigned_rider", "delivery_zone"],
            });
            setOrders(res.data || []);
            setPageCount(res.meta?.pagination?.pageCount ?? 1);
        } catch (err) {
            console.error("Failed to load orders", err);
            toast("Failed to load orders.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt, page, toast]);

    useEffect(() => { load(); }, [load]);

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center justify-content-between mb-3">
                    <h2 className="mb-0">Web Orders</h2>
                    <div className="d-flex gap-2">
                        <Link className="btn btn-sm btn-primary" href="/new/sale-order">
                            <i className="fas fa-plus me-1" />New Order
                        </Link>
                        <button className="btn btn-sm btn-outline-secondary" onClick={load}>
                            <i className="fas fa-rotate me-1" />Refresh
                        </button>
                    </div>
                </div>

                <div className="alert alert-info">
                    <i className="fas fa-circle-info me-2"></i>
                    <strong>Default flow:</strong> This page shows order list only. Use <em>New Order</em> to create and <em>Edit</em> to update an order in its dedicated page.
                </div>

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
                                    <th style={{ minWidth: 140 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map(o => (
                                    <tr key={o.id}>
                                        <td>
                                            <Link href={`/${o.documentId}/sale-order`} className="text-decoration-none fw-semibold">
                                                <code>{o.order_id}</code>
                                            </Link>
                                        </td>
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
                                            <Link href={`/${o.documentId}/sale-order`} className="btn btn-sm btn-outline-primary">
                                                <i className="fas fa-edit me-1" />Edit
                                            </Link>
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

