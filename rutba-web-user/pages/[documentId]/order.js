import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

export default function OrderDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const [order, setOrder] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messageInput, setMessageInput] = useState("");
    const [sendingMessage, setSendingMessage] = useState(false);
    const [loading, setLoading] = useState(true);

    const STATUS_ORDER = [
        "PENDING_PAYMENT",
        "PAYMENT_CONFIRMED",
        "PREPARING",
        "AWAITING_PICKUP",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
    ];

    useEffect(() => {
        if (!jwt || !documentId) return;
        authApi.get(`/web-orders/${documentId}?populate=*`, {}, jwt)
            .then((res) => setOrder(res.data || res))
            .catch((err) => console.error("Failed to load order", err))
            .finally(() => setLoading(false));
    }, [jwt, documentId]);

    const fetchMessages = () => {
        if (!jwt || !documentId) return;
        authApi.get(`/orders/${documentId}/messages`, {}, jwt)
            .then((res) => setMessages(res.data || []))
            .catch((err) => console.error("Failed to load order messages", err));
    };

    useEffect(() => {
        fetchMessages();
        const interval = setInterval(fetchMessages, 10000);
        return () => clearInterval(interval);
    }, [jwt, documentId]);

    const handleSendMessage = async () => {
        const message = messageInput.trim();
        if (!message || !jwt || !documentId) return;
        try {
            setSendingMessage(true);
            await authApi.post(`/orders/${documentId}/messages`, { message }, jwt);
            setMessageInput("");
            fetchMessages();
        } catch (err) {
            console.error("Failed to send message", err);
        } finally {
            setSendingMessage(false);
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/orders">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">Order Details</h2>
                </div>

                {loading && <p>Loading order...</p>}

                {!loading && !order && (
                    <div className="alert alert-warning">Order not found.</div>
                )}

                {!loading && order && (
                    <div className="row">
                        <div className="col-md-8">
                            <div className="card mb-3">
                                <div className="card-header d-flex justify-content-between">
                                    <strong>Order #{order.orderNumber || order.order_id || order.id}</strong>
                                    <div className="d-flex gap-2">
                                        <span className={`badge bg-${statusColor(order.order_status)}`}>
                                            {labelStatus(order.order_status || "PENDING_PAYMENT")}
                                        </span>
                                        <span className={`badge bg-${statusColor(order.payment_status)}`}>
                                            {labelStatus(order.payment_status || "pending")}
                                        </span>
                                    </div>
                                </div>
                                <div className="card-body">
                                    <p><strong>Date:</strong> {new Date(order.createdAt).toLocaleDateString()}</p>
                                    <p><strong>Total:</strong> {order.total != null ? order.total.toFixed(2) : "—"}</p>

                                    <div className="mb-3">
                                        <p className="fw-bold mb-2">Delivery Timeline</p>
                                        <div className="d-flex flex-column gap-2">
                                            {STATUS_ORDER.map((status, idx) => {
                                                const currentIndex = STATUS_ORDER.indexOf(order.order_status);
                                                const done = currentIndex >= idx;
                                                return (
                                                    <div key={status} className="d-flex align-items-center gap-2">
                                                        <span
                                                            style={{ width: 10, height: 10, borderRadius: 9999 }}
                                                            className={done ? "bg-success" : "bg-secondary"}
                                                        />
                                                        <span className={done ? "text-dark" : "text-muted"}>
                                                            {labelStatus(status)}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {order.delivery_method && (
                                        <p>
                                            <strong>Delivery Method:</strong> {order.delivery_method.name} ({order.delivery_method.service_provider})
                                        </p>
                                    )}

                                    {order.assigned_rider && (
                                        <div className="alert alert-info py-2">
                                            <p className="mb-1 fw-bold">Assigned Rider</p>
                                            <p className="mb-0">{order.assigned_rider.full_name} • {order.assigned_rider.phone}</p>
                                        </div>
                                    )}

                                    {order.documentId && order.order_secret && (
                                        <div className="mb-3">
                                            <Link
                                                className="btn btn-sm btn-outline-info"
                                                href={`${process.env.NEXT_PUBLIC_WEB_URL || "https://rutba.pk"}/order-tracking/${order.documentId}?secret=${order.order_secret}`}
                                                target="_blank"
                                            >
                                                Track on Web
                                            </Link>
                                        </div>
                                    )}

                                    {order.items && order.items.length > 0 && (
                                        <table className="table table-sm mt-3">
                                            <thead>
                                                <tr>
                                                    <th>Product</th>
                                                    <th>Variant / Options</th>
                                                    <th>Qty</th>
                                                    <th>Price</th>
                                                    <th>Subtotal</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {order.items.map((item, idx) => (
                                                    <tr key={idx}>
                                                        <td>{item.productName || item.product_name || item.name}</td>
                                                        <td>
                                                            {item.variant_terms && item.variant_terms.length > 0 ? (
                                                                <div className="d-flex flex-wrap gap-1">
                                                                    {item.variant_terms.map((t, i) => (
                                                                        <span key={i} className="badge bg-light text-dark border">
                                                                            {t.typeName}: {t.termName}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <span className="text-muted">
                                                                    {item.variant_name || item.variant || "—"}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td>{item.quantity}</td>
                                                        <td>{item.price?.toFixed(2)}</td>
                                                        <td>{(item.quantity * item.price)?.toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}

                                    {/* Fallback: products.items from JSON structure */}
                                    {(!order.items || order.items.length === 0) && order.products?.items?.length > 0 && (
                                        <table className="table table-sm mt-3">
                                            <thead>
                                                <tr>
                                                    <th>Product</th>
                                                    <th>Variant / Options</th>
                                                    <th>Qty</th>
                                                    <th>Price</th>
                                                    <th>Subtotal</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {order.products.items.map((item, idx) => (
                                                    <tr key={idx}>
                                                        <td>{item.product_name || item.name}</td>
                                                        <td>
                                                            {item.variant_terms && item.variant_terms.length > 0 ? (
                                                                <div className="d-flex flex-wrap gap-1">
                                                                    {item.variant_terms.map((t, i) => (
                                                                        <span key={i} className="badge bg-light text-dark border">
                                                                            {t.typeName}: {t.termName}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <span className="text-muted">
                                                                    {item.variant_name || item.variant || "—"}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td>{item.quantity}</td>
                                                        <td>{Number(item.price).toFixed(2)}</td>
                                                        <td>{(item.quantity * item.price).toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>

                            {/* Packaging / Dispatch Helper */}
                            {((order.items && order.items.length > 0) || (order.products?.items?.length > 0)) && (
                                <div className="card mb-3 border-info">
                                    <div className="card-header bg-info text-white">
                                        <i className="fas fa-box me-2"></i>Packaging &amp; Dispatch
                                    </div>
                                    <div className="card-body">
                                        <p className="text-muted small mb-2">Use the details below to locate the correct items for this order.</p>
                                        {(order.items || order.products?.items || []).map((item, idx) => (
                                            <div key={idx} className="d-flex align-items-start gap-3 p-2 mb-2 bg-light rounded border">
                                                <div className="fw-bold" style={{ minWidth: 30 }}>#{idx + 1}</div>
                                                <div className="flex-grow-1">
                                                    <div className="fw-bold">{item.product_name || item.productName || item.name}</div>
                                                    {item.variant_terms && item.variant_terms.length > 0 ? (
                                                        <div className="d-flex flex-wrap gap-1 mt-1">
                                                            {item.variant_terms.map((t, i) => (
                                                                <span key={i} className="badge bg-primary">
                                                                    {t.typeName}: {t.termName}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (item.variant_name || item.variant) ? (
                                                        <div className="text-muted small mt-1">Variant: {item.variant_name || item.variant}</div>
                                                    ) : null}
                                                </div>
                                                <div className="text-end">
                                                    <span className="badge bg-dark fs-6">×{item.quantity}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="col-md-4">
                            {/* Customer Info */}
                            {order.customer_contact && (
                                <div className="card mb-3">
                                    <div className="card-header"><strong>Customer</strong></div>
                                    <div className="card-body">
                                        <p className="fw-bold">{order.customer_contact.name}</p>
                                        <p className="small">{order.customer_contact.phone_number}</p>
                                        <p className="small">{order.customer_contact.email}</p>
                                        <hr />
                                        <p className="small mb-0">
                                            {order.customer_contact.address}<br />
                                            {order.customer_contact.city}, {order.customer_contact.state}<br />
                                            {order.customer_contact.country} {order.customer_contact.zip_code}
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="card">
                                <div className="card-header"><strong>Actions</strong></div>
                                <div className="card-body d-grid gap-2">
                                    {order.status !== "cancelled" && order.status !== "returned" && (
                                        <Link className="btn btn-outline-warning" href={`/returns?orderId=${order.documentId || order.id}`}>
                                            <i className="fas fa-undo me-1"></i> Request Return
                                        </Link>
                                    )}
                                </div>
                            </div>

                            <div className="card mt-3">
                                <div className="card-header d-flex justify-content-between align-items-center">
                                    <strong>Messages</strong>
                                    <button className="btn btn-sm btn-outline-secondary" onClick={fetchMessages}>Refresh</button>
                                </div>
                                <div className="card-body">
                                    <div className="mb-3" style={{ maxHeight: 220, overflowY: 'auto' }}>
                                        {messages.length === 0 && <p className="text-muted small mb-0">No messages yet.</p>}
                                        {messages.map((m) => (
                                            <div key={m.documentId || m.id} className="border rounded p-2 mb-2">
                                                <div className="small text-muted text-uppercase">{m.sender_type}</div>
                                                <div className="small">{m.message}</div>
                                                <div className="small text-muted">{new Date(m.sent_at).toLocaleString()}</div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="input-group">
                                        <input
                                            className="form-control"
                                            value={messageInput}
                                            onChange={(e) => setMessageInput(e.target.value)}
                                            placeholder="Message rider/support"
                                        />
                                        <button
                                            className="btn btn-primary"
                                            disabled={sendingMessage || !messageInput.trim()}
                                            onClick={handleSendMessage}
                                        >
                                            {sendingMessage ? 'Sending...' : 'Send'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
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

