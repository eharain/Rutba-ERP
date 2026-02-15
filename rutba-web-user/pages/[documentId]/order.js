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
                                                    <th>Qty</th>
                                                    <th>Price</th>
                                                    <th>Subtotal</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {order.items.map((item, idx) => (
                                                    <tr key={idx}>
                                                        <td>{item.productName || item.name}</td>
                                                        <td>{item.quantity}</td>
                                                        <td>{item.price?.toFixed(2)}</td>
                                                        <td>{(item.quantity * item.price)?.toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="col-md-4">
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
