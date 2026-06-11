import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import WorkflowBoard from "@rutba/pos-shared/components/workflow/WorkflowBoard";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { useToast } from "../components/Toast";
import {
    SaleOrdersEndpoints,
    ReturnRequestsEndpoints,
    WorkflowsEndpoints,
} from "@rutba/api-provider/endpoints/index.js";

const SO_UID = "api::sale-order.sale-order";
const RR_UID = "api::return-request.return-request";

export default function Board() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();
    const [tab, setTab] = useState("orders");

    const [workflows, setWorkflows] = useState({}); // uid -> workflow
    const [orders, setOrders] = useState([]);
    const [returns, setReturns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const reload = useCallback(async () => {
        try {
            const [soRes, rrRes] = await Promise.all([
                SaleOrdersEndpoints.list({
                    page: 1, pageSize: 200,
                    sort: ["createdAt:desc"],
                    populate: ["customer_person", "delivery_method"],
                }),
                ReturnRequestsEndpoints.list({
                    page: 1, pageSize: 200,
                    sort: ["createdAt:desc"],
                    populate: ["sale_order"],
                }),
            ]);
            setOrders(soRes.data || []);
            setReturns(rrRes.data || []);
            setError("");
        } catch (err) {
            console.error("Failed to load board data", err);
            setError("Failed to load board data.");
        }
    }, []);

    useEffect(() => {
        if (!jwt) return;
        (async () => {
            setLoading(true);
            try {
                const [soWf, rrWf] = await Promise.all([
                    WorkflowsEndpoints.list(1, 1, { entityUid: SO_UID }),
                    WorkflowsEndpoints.list(1, 1, { entityUid: RR_UID }),
                ]);
                setWorkflows({
                    [SO_UID]: (soWf.data || [])[0] || null,
                    [RR_UID]: (rrWf.data || [])[0] || null,
                });
            } catch (err) {
                console.error("Failed to load workflows", err);
            }
            await reload();
            setLoading(false);
        })();
    }, [jwt, reload]);

    async function moveOrder(record, toKey) {
        try {
            await SaleOrdersEndpoints.updateStatus(record.documentId, { status: toKey });
            toast?.("Order moved.", "success");
            await reload();
        } catch (err) {
            console.error("Order transition failed", err);
            toast?.(err?.response?.data?.error?.message || "Transition failed.", "danger");
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <h2 className="mb-2">Order Boards</h2>
                <ul className="nav nav-tabs mb-3">
                    <li className="nav-item">
                        <button className={`nav-link ${tab === "orders" ? "active" : ""}`} onClick={() => setTab("orders")}>
                            <i className="fas fa-shopping-bag me-1"></i> Sale Orders
                        </button>
                    </li>
                    <li className="nav-item">
                        <button className={`nav-link ${tab === "returns" ? "active" : ""}`} onClick={() => setTab("returns")}>
                            <i className="fas fa-rotate-left me-1"></i> Returns
                        </button>
                    </li>
                </ul>

                {error && <div className="alert alert-danger">{error}</div>}
                {loading && <p>Loading board...</p>}

                {!loading && tab === "orders" && (
                    <WorkflowBoard
                        workflow={workflows[SO_UID]}
                        items={orders}
                        stageOf={(r) => r.stage_key}
                        statusOf={(r) => r.order_status || "PENDING_PAYMENT"}
                        onTransition={moveOrder}
                        card={{
                            title: (r) => r.order_id || r.documentId,
                            href: (r) => `/${r.documentId}/sale-order`,
                            due: (r) => r.estimated_delivery_time,
                            meta: (r) => (
                                <>
                                    {r.customer_person?.name && <div className="text-truncate">{r.customer_person.name}</div>}
                                    <div className="d-flex gap-1 flex-wrap align-items-center">
                                        {r.delivery_method?.name && (
                                            <span className="badge bg-light text-dark border">{r.delivery_method.name}</span>
                                        )}
                                        {r.total != null && <span>Rs {Number(r.total).toLocaleString()}</span>}
                                    </div>
                                </>
                            ),
                        }}
                    />
                )}

                {!loading && tab === "returns" && (
                    <>
                        <p className="text-muted small mb-2">
                            Returns move through their detail form (approval, inspection and refund need
                            extra data) — open a card to act on it.
                        </p>
                        <WorkflowBoard
                            workflow={workflows[RR_UID]}
                            items={returns}
                            stageOf={(r) => r.stage_key}
                            statusOf={(r) => r.status || "REQUESTED"}
                            card={{
                                title: (r) => r.return_ref || r.documentId,
                                href: (r) => `/returns/${r.documentId}`,
                                meta: (r) => (
                                    <>
                                        {r.sale_order?.order_id && <div>Order: {r.sale_order.order_id}</div>}
                                        {r.reason && <span className="badge bg-light text-dark border">{r.reason.replace(/_/g, " ")}</span>}
                                    </>
                                ),
                            }}
                        />
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
