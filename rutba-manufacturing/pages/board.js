import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import WorkflowBoard from "@rutba/pos-shared/components/workflow/WorkflowBoard";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MfgWorkOrdersEndpoints, WorkflowsEndpoints } from "@rutba/api-provider/endpoints";

const WO_ENTITY_UID = "api::mfg-work-order.mfg-work-order";

const PRIORITY_COLOR = { Low: "secondary", Normal: "info", High: "warning", Urgent: "danger" };

export default function Board() {
    const { jwt } = useAuth();
    const [workflow, setWorkflow] = useState(null);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const reload = useCallback(async () => {
        try {
            const res = await MfgWorkOrdersEndpoints.list(1, 200, { sort: ["due_date:asc", "createdAt:desc"] });
            setRows(res.data || []);
            setError("");
        } catch (err) {
            console.error("Failed to load work orders", err);
            setError("Failed to load work orders.");
        }
    }, []);

    useEffect(() => {
        if (!jwt) return;
        (async () => {
            setLoading(true);
            try {
                const wfRes = await WorkflowsEndpoints.list(1, 1, { entityUid: WO_ENTITY_UID });
                setWorkflow((wfRes.data || [])[0] || null);
            } catch (err) {
                console.error("Failed to load workflow", err);
            }
            await reload();
            setLoading(false);
        })();
    }, [jwt, reload]);

    async function onTransition(record, toKey) {
        try {
            await MfgWorkOrdersEndpoints.processTransition(record.documentId, toKey);
            await reload();
        } catch (err) {
            console.error("Transition failed", err);
            alert(err?.response?.data?.error?.message || "Transition failed.");
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-2">Production Board</h2>
                <p className="text-muted mb-3">
                    Work orders by workflow stage. Drag a card to an allowed column or use a card's move
                    button; click a card to open its job card.
                </p>
                {error && <div className="alert alert-danger">{error}</div>}
                {loading && <p>Loading board...</p>}
                {!loading && (
                    <WorkflowBoard
                        workflow={workflow}
                        items={rows}
                        stageOf={(r) => r.stage_key}
                        statusOf={(r) => r.status || "Draft"}
                        onTransition={onTransition}
                        card={{
                            title: (r) => `${r.wo_number || r.documentId}${r.name ? ` — ${r.name}` : ""}`,
                            href: (r) => `/work-orders/${r.documentId}`,
                            due: (r) => r.due_date,
                            meta: (r) => (
                                <>
                                    {r.product?.name && <div className="text-truncate">{r.product.name}</div>}
                                    <div className="d-flex gap-1 align-items-center flex-wrap">
                                        <span>{r.quantity_completed ?? 0}/{r.quantity_ordered ?? 0} pcs</span>
                                        {r.priority && (
                                            <span className={`badge bg-${PRIORITY_COLOR[r.priority] || "secondary"} ${["warning"].includes(PRIORITY_COLOR[r.priority]) ? "text-dark" : ""}`}>
                                                {r.priority}
                                            </span>
                                        )}
                                    </div>
                                </>
                            ),
                        }}
                    />
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
