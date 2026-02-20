import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";

function getStatusBadgeClass(status) {
    switch (status) {
        case "paid": return "bg-success";
        case "unpaid": return "bg-danger";
        case "pending": return "bg-warning text-dark";
        default: return "bg-secondary";
    }
}

export default function Orders() {
    const { jwt } = useAuth();
    const { currency } = useUtil();
    const [orders, setOrders] = useState([]);
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
            });
            setOrders(res.data || []);
            setPageCount(res.meta?.pagination?.pageCount ?? 1);
        } catch (err) {
            console.error("Failed to load orders", err);
        } finally {
            setLoading(false);
        }
    }, [jwt, page]);

    useEffect(() => { load(); }, [load]);

    return (
        <ProtectedRoute>
            <Layout>
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
                                    <th>Total</th>
                                    <th>Payment</th>
                                    <th>Tracking</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map(o => (
                                    <tr key={o.id}>
                                        <td><code>{o.order_id}</code></td>
                                        <td>{o.customer_contact?.name || o.user_id || "—"}</td>
                                        <td>{currency}{parseFloat(o.total || 0).toFixed(2)}</td>
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

export async function getServerSideProps() { return { props: {} }; }
