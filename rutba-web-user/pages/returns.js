import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function Returns() {
    const router = useRouter();
    const { orderId } = router.query;
    const { jwt } = useAuth();

    const [order, setOrder] = useState(null);
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!jwt || !orderId) return;
        authApi.get(`/web-orders/${orderId}?populate=*`, {}, jwt)
            .then((res) => setOrder(res.data || res))
            .catch((err) => console.error("Failed to load order", err));
    }, [jwt, orderId]);

    async function handleSubmit(e) {
        e.preventDefault();
        if (!reason.trim()) {
            setError("Please provide a reason for the return.");
            return;
        }

        setSubmitting(true);
        setError("");

        try {
            await authApi.post("/return-requests", {
                data: {
                    order: orderId,
                    reason: reason.trim(),
                }
            }, jwt);
            setSubmitted(true);
        } catch (err) {
            console.error("Failed to submit return request", err);
            setError("Failed to submit return request. Please try again.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Request a Return</h2>

                {!orderId && (
                    <div className="alert alert-info">
                        Please select an order to request a return. Go to{" "}
                        <a href="/orders">My Orders</a> and click &quot;Request Return&quot; on the order.
                    </div>
                )}

                {submitted && (
                    <div className="alert alert-success">
                        <i className="fas fa-check-circle me-2"></i>
                        Your return request has been submitted. We will review it shortly.
                        <div className="mt-2">
                            <a href="/orders" className="btn btn-sm btn-outline-success">Back to Orders</a>
                        </div>
                    </div>
                )}

                {orderId && !submitted && (
                    <div className="row">
                        <div className="col-md-8">
                            {order && (
                                <div className="card mb-3">
                                    <div className="card-header">
                                        <strong>Order #{order.orderNumber || order.id}</strong>
                                    </div>
                                    <div className="card-body">
                                        <p><strong>Date:</strong> {new Date(order.createdAt).toLocaleDateString()}</p>
                                        <p><strong>Total:</strong> {order.total != null ? order.total.toFixed(2) : "—"}</p>
                                    </div>
                                </div>
                            )}

                            <form onSubmit={handleSubmit}>
                                <div className="mb-3">
                                    <label htmlFor="reason" className="form-label fw-bold">
                                        Reason for Return
                                    </label>
                                    <textarea
                                        id="reason"
                                        className="form-control"
                                        rows={4}
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        placeholder="Please describe why you want to return this order..."
                                    />
                                </div>

                                {error && <div className="alert alert-danger">{error}</div>}

                                <button
                                    type="submit"
                                    className="btn btn-warning"
                                    disabled={submitting}
                                >
                                    {submitting ? "Submitting..." : "Submit Return Request"}
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
