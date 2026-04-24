import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

export default function Orders() {
    const { jwt } = useAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        authApi.get("/web-orders?sort=createdAt:desc", {}, jwt)
            .then((res) => setOrders(res.data || []))
            .catch((err) => console.error("Failed to load orders", err))
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Orders</h2>

                {loading && <p>Loading orders...</p>}

                {!loading && orders.length === 0 && (
                    <div className="alert alert-info">No orders yet.</div>
                )}

                {!loading && orders.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Order #</th>
                                    <th>Date</th>
                                    <th>Items</th>
                                    <th>Order Status</th>
                                    <th>Payment</th>
                                    <th>Total</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((order) => {
                                    const items = order.items || order.products?.items || [];
                                    return (
                                        <tr key={order.id}>
                                            <td>{order.orderNumber || order.order_id || order.id}</td>
                                            <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                                            <td>
                                                {items.slice(0, 2).map((item, idx) => (
                                                    <div key={idx} className="small mb-1">
                                                        <span className="fw-bold">{item.product_name || item.productName || item.name}</span>
                                                        {item.variant_terms && item.variant_terms.length > 0 && (
                                                            <span className="ms-1">
                                                                {item.variant_terms.map((t, i) => (
                                                                    <span key={i} className="badge bg-light text-dark border me-1" style={{ fontSize: '0.65rem' }}>
                                                                        {t.typeName}: {t.termName}
                                                                    </span>
                                                                ))}
                                                            </span>
                                                        )}
                                                        <span className="text-muted ms-1">×{item.quantity}</span>
                                                    </div>
                                                ))}
                                                {items.length > 2 && (
                                                    <span className="text-muted small">+{items.length - 2} more</span>
                                                )}
                                            </td>
                                            <td>
                                                <span className={`badge bg-${statusColor(order.order_status)}`}>
                                                    {labelStatus(order.order_status)}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`badge bg-${statusColor(order.payment_status)}`}>
                                                    {labelStatus(order.payment_status || "pending")}
                                                </span>
                                            </td>
                                            <td>{order.total != null ? Number(order.total).toFixed(2) : "—"}</td>
                                            <td>
                                                <div className="d-flex gap-2 flex-wrap">
                                                    <Link className="btn btn-sm btn-outline-primary" href={`/${order.documentId || order.id}/order`}>
                                                        View
                                                    </Link>
                                                    {order.documentId && order.order_secret && (
                                                        <Link
                                                            className="btn btn-sm btn-outline-info"
                                                            href={`${process.env.NEXT_PUBLIC_WEB_URL || "https://rutba.pk"}/order-tracking/${order.documentId}?secret=${order.order_secret}`}
                                                            target="_blank"
                                                        >
                                                            Track
                                                        </Link>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

function statusColor(status) {
    const key = String(status || '').toUpperCase();
    switch (status) {
        case "completed": return "success";
        case "shipped": return "info";
        case "cancelled": return "danger";
        case "returned": return "warning";
        case "processing": return "primary";
        case "PENDING_PAYMENT": return "secondary";
        case "PAYMENT_CONFIRMED": return "primary";
        case "PREPARING": return "info";
        case "AWAITING_PICKUP": return "warning";
        case "OUT_FOR_DELIVERY": return "primary";
        case "DELIVERED": return "success";
        case "FAILED_DELIVERY": return "danger";
        case "CANCELLED": return "danger";
        case "SUCCEEDED": return "success";
        case "FAILED": return "danger";
        case "EXPIRED": return "warning";
        case "ORDERED": return "info";
        default: return "secondary";
    }
}

function labelStatus(status) {
    const key = String(status || "").replace(/_/g, " ");
    return key.length ? key.charAt(0).toUpperCase() + key.slice(1).toLowerCase() : "Pending";
}

