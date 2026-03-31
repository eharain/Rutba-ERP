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
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt || !documentId) return;
        authApi.get(`/web-orders/${documentId}?populate=*`, {}, jwt)
            .then((res) => setOrder(res.data || res))
            .catch((err) => console.error("Failed to load order", err))
            .finally(() => setLoading(false));
    }, [jwt, documentId]);

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
                                    <strong>Order #{order.orderNumber || order.id}</strong>
                                    <span className={`badge bg-${statusColor(order.status)}`}>
                                        {order.status || "Pending"}
                                    </span>
                                </div>
                                <div className="card-body">
                                    <p><strong>Date:</strong> {new Date(order.createdAt).toLocaleDateString()}</p>
                                    <p><strong>Total:</strong> {order.total != null ? order.total.toFixed(2) : "—"}</p>

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
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

function statusColor(status) {
    switch (status) {
        case "completed": return "success";
        case "shipped": return "info";
        case "cancelled": return "danger";
        case "returned": return "warning";
        case "processing": return "primary";
        default: return "secondary";
    }
}

export async function getServerSideProps() { return { props: {} }; }
