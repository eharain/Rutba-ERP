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
                <h2 className="mb-3">My Orders</h2>

                {loading && <p>Loading orders...</p>}

                {!loading && orders.length === 0 && (
                    <div className="alert alert-info">You have no orders yet.</div>
                )}

                {!loading && orders.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Order #</th>
                                    <th>Date</th>
                                    <th>Status</th>
                                    <th>Total</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((order) => (
                                    <tr key={order.id}>
                                        <td>{order.orderNumber || order.id}</td>
                                        <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                                        <td>
                                            <span className={`badge bg-${statusColor(order.status)}`}>
                                                {order.status || "Pending"}
                                            </span>
                                        </td>
                                        <td>{order.total != null ? order.total.toFixed(2) : "—"}</td>
                                        <td>
                                            <Link className="btn btn-sm btn-outline-primary" href={`/${order.documentId || order.id}/order`}>
                                                View
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
