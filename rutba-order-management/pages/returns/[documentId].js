import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import { ReturnRequestsEndpoints } from "@rutba/api-provider/endpoints/index.js";
import { useToast } from "../../components/Toast";

const STATUS_LABELS = {
    REQUESTED:       "Pending Approval",
    APPROVED:        "Approved",
    AWAITING_PICKUP: "Awaiting Pickup",
    RECEIVED:        "Received",
    COMPLETED:       "Completed",
    REJECTED:        "Rejected",
    CANCELLED:       "Cancelled",
};
const RESTOCK_LABEL = {
    back_to_inventory: "Restock (sellable)",
    damaged_writeoff:  "Damaged — write-off",
};
const REFUND_METHOD_LABEL = {
    original_method: "Original payment method",
    bank_transfer:   "Bank transfer",
    manual_cash:     "Manual cash",
    store_credit:    "Store credit",
};

export default function ReturnDetailPage() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const { currency } = useUtil();
    const { toast, ToastContainer } = useToast();
    const [ret, setRet] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    // Form-state for the inspection step. Initialised from the loaded
    // return's per-line decisions (so re-opening a half-done inspection
    // preserves the previous picks) when the document arrives.
    const [decisions, setDecisions] = useState({});
    const [rejectReason, setRejectReason] = useState("");
    const [refundMethod, setRefundMethod] = useState("manual_cash");
    const [refundAmount, setRefundAmount] = useState("");
    const [refundNotes, setRefundNotes] = useState("");

    const load = useCallback(async () => {
        if (!jwt || !router.isReady || !documentId || documentId === "new") return;
        setLoading(true);
        try {
            const res = await ReturnRequestsEndpoints.byId(documentId);
            const data = res.data || res;
            setRet(data);
            // Hydrate decision-form state from the persisted lines.
            const seed = {};
            (data.items || []).forEach((line) => {
                seed[line.order_line_index] = {
                    restock_decision: line.restock_decision || "back_to_inventory",
                    inspection_notes: line.inspection_notes || "",
                };
            });
            setDecisions(seed);
            // Pre-fill refund amount with the total computed at request time.
            const paisa = Number(data.refund_amount_paisa || 0);
            if (paisa > 0) setRefundAmount((paisa / 100).toFixed(2));
        } catch (err) {
            console.error("Failed to load return", err);
            toast("Failed to load return.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt, router.isReady, documentId, toast]);

    useEffect(() => { load(); }, [load]);

    async function runAction(label, fn) {
        if (busy) return;
        setBusy(true);
        try {
            await fn();
            toast(label, "success");
            await load();
        } catch (err) {
            console.error(label, err);
            toast(err?.response?.data?.error?.message || err.message || `${label} failed`, "danger");
        } finally {
            setBusy(false);
        }
    }

    function onApprove() {
        runAction("Approved", () => ReturnRequestsEndpoints.approveReturn(documentId, {
            pickup_method: ret?.pickup_method || "customer_ship",
        }));
    }
    function onReject() {
        if (!rejectReason.trim()) return toast("Rejection reason is required.", "warning");
        runAction("Rejected", () => ReturnRequestsEndpoints.rejectReturn(documentId, { rejection_reason: rejectReason }));
    }
    function onCancel() {
        if (!confirm("Cancel this return? This is not reversible.")) return;
        runAction("Cancelled", () => ReturnRequestsEndpoints.cancelReturn(documentId, {}));
    }
    function onSetReceived() {
        const item_decisions = Object.entries(decisions).map(([idx, d]) => ({
            order_line_index: Number(idx),
            restock_decision: d.restock_decision,
            inspection_notes: d.inspection_notes,
        }));
        runAction("Marked received + restocked", () =>
            ReturnRequestsEndpoints.setReceived(documentId, { item_decisions }),
        );
    }
    function onResolve() {
        const paisa = Math.round(Number(refundAmount || 0) * 100);
        runAction("Return completed", () =>
            ReturnRequestsEndpoints.resolveReturn(documentId, {
                refund_amount_paisa: paisa,
                refund_method:       refundMethod,
                refund_status:       "pending_manual",
                refund_notes:        refundNotes,
            }),
        );
    }

    if (loading) {
        return (
            <ProtectedRoute><Layout><p>Loading return…</p></Layout></ProtectedRoute>
        );
    }
    if (!ret) {
        return (
            <ProtectedRoute><Layout><div className="alert alert-warning">Return not found.</div></Layout></ProtectedRoute>
        );
    }

    const status = ret.status;
    const canApprove  = status === "REQUESTED";
    const canReject   = status === "REQUESTED";
    const canCancel   = status === "REQUESTED" || status === "APPROVED" || status === "AWAITING_PICKUP";
    const canReceive  = status === "APPROVED" || status === "AWAITING_PICKUP";
    const canResolve  = status === "RECEIVED";

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center justify-content-between mb-3">
                    <div>
                        <Link href="/returns" className="small text-muted text-decoration-none">
                            <i className="fas fa-arrow-left me-1" />Returns
                        </Link>
                        <h2 className="mb-0 mt-1">
                            <code>{ret.return_ref}</code>
                            <span className="badge bg-light text-dark border ms-2">{STATUS_LABELS[status] || status}</span>
                        </h2>
                        {ret.sale_order?.documentId && (
                            <div className="text-muted small">
                                Order: <Link href={`/${ret.sale_order.documentId}/sale-order`}><code>{ret.sale_order.order_id}</code></Link>
                            </div>
                        )}
                    </div>
                    <div className="d-flex gap-2">
                        {canCancel && (
                            <button className="btn btn-outline-secondary btn-sm" onClick={onCancel} disabled={busy}>
                                Cancel return
                            </button>
                        )}
                    </div>
                </div>

                <div className="row g-3">
                    <div className="col-lg-8">
                        {/* Reason + customer-uploaded evidence */}
                        <div className="card mb-3">
                            <div className="card-header">Customer request</div>
                            <div className="card-body">
                                <div className="row">
                                    <div className="col-md-4 small text-muted">Reason</div>
                                    <div className="col-md-8">{ret.reason}</div>
                                </div>
                                {ret.reason_notes && (
                                    <div className="row mt-2">
                                        <div className="col-md-4 small text-muted">Notes</div>
                                        <div className="col-md-8">{ret.reason_notes}</div>
                                    </div>
                                )}
                                <div className="row mt-2">
                                    <div className="col-md-4 small text-muted">Resolution requested</div>
                                    <div className="col-md-8">{ret.resolution || "refund"}</div>
                                </div>
                                {Array.isArray(ret.customer_evidence) && ret.customer_evidence.length > 0 && (
                                    <div className="mt-3">
                                        <div className="small text-muted mb-1">Evidence</div>
                                        <div className="d-flex gap-2 flex-wrap">
                                            {ret.customer_evidence.map((m) => (
                                                <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer">
                                                    <img src={m.url} alt={m.name} style={{ height: 80, borderRadius: 4, border: "1px solid #ddd" }} />
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Per-line inspection table. Always visible — staff can review
                            during approval and edit during inspection. Inputs only
                            actually save on Set Received. */}
                        <div className="card mb-3">
                            <div className="card-header">Lines</div>
                            <div className="card-body p-0">
                                <table className="table mb-0">
                                    <thead className="table-light">
                                        <tr>
                                            <th>#</th>
                                            <th>Product</th>
                                            <th>Qty</th>
                                            <th>Unit refund</th>
                                            <th>Restock decision</th>
                                            <th>Inspection notes</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(ret.items || []).map((line) => {
                                            const idx = line.order_line_index;
                                            const decision = decisions[idx] || {};
                                            const editable = canReceive || canResolve;
                                            return (
                                                <tr key={`${line.id || idx}`}>
                                                    <td className="small text-muted">{idx}</td>
                                                    <td>
                                                        <div className="fw-semibold">{line.product_name || "—"}</div>
                                                        {line.variant_name && <div className="text-muted small">{line.variant_name}</div>}
                                                    </td>
                                                    <td>{line.quantity}</td>
                                                    <td>{currency}{(Number(line.unit_refund_paisa || 0) / 100).toFixed(2)}</td>
                                                    <td style={{ minWidth: 200 }}>
                                                        {editable ? (
                                                            <select
                                                                className="form-select form-select-sm"
                                                                value={decision.restock_decision || "back_to_inventory"}
                                                                onChange={(e) => setDecisions((d) => ({
                                                                    ...d, [idx]: { ...d[idx], restock_decision: e.target.value },
                                                                }))}
                                                            >
                                                                {Object.entries(RESTOCK_LABEL).map(([k, v]) => (
                                                                    <option key={k} value={k}>{v}</option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            <span className="small">{RESTOCK_LABEL[line.restock_decision] || line.restock_decision || "—"}</span>
                                                        )}
                                                    </td>
                                                    <td style={{ minWidth: 200 }}>
                                                        {editable ? (
                                                            <input
                                                                type="text"
                                                                className="form-control form-control-sm"
                                                                value={decision.inspection_notes || ""}
                                                                placeholder="Condition, missing parts…"
                                                                onChange={(e) => setDecisions((d) => ({
                                                                    ...d, [idx]: { ...d[idx], inspection_notes: e.target.value },
                                                                }))}
                                                            />
                                                        ) : (
                                                            <span className="small text-muted">{line.inspection_notes || "—"}</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Resolution form — only meaningful in RECEIVED. Visible
                            in COMPLETED as a read-only summary so staff can see
                            what was paid out. */}
                        {(canResolve || status === "COMPLETED") && (
                            <div className="card mb-3">
                                <div className="card-header">Refund</div>
                                <div className="card-body">
                                    <div className="row g-2">
                                        <div className="col-md-4">
                                            <label className="form-label small">Amount</label>
                                            <div className="input-group input-group-sm">
                                                <span className="input-group-text">{currency}</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className="form-control"
                                                    value={refundAmount}
                                                    onChange={(e) => setRefundAmount(e.target.value)}
                                                    disabled={!canResolve}
                                                />
                                            </div>
                                        </div>
                                        <div className="col-md-4">
                                            <label className="form-label small">Method</label>
                                            <select
                                                className="form-select form-select-sm"
                                                value={refundMethod}
                                                onChange={(e) => setRefundMethod(e.target.value)}
                                                disabled={!canResolve}
                                            >
                                                {Object.entries(REFUND_METHOD_LABEL).map(([k, v]) => (
                                                    <option key={k} value={k}>{v}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="col-md-12">
                                            <label className="form-label small">Notes</label>
                                            <input
                                                type="text"
                                                className="form-control form-control-sm"
                                                value={refundNotes}
                                                onChange={(e) => setRefundNotes(e.target.value)}
                                                disabled={!canResolve}
                                            />
                                        </div>
                                    </div>
                                    {status === "COMPLETED" && (
                                        <div className="alert alert-success small mt-3 mb-0">
                                            Refund recorded as <strong>{ret.refund_status}</strong>. Accounts settles
                                            manually for MVP — gateway refund integration is in Phase E.2.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="col-lg-4">
                        {/* Workflow actions — state-driven. The order matches the
                            happy-path progression so the next action is always
                            in the same spot. */}
                        <div className="card sticky-top" style={{ top: 70 }}>
                            <div className="card-header">Actions</div>
                            <div className="card-body d-grid gap-2">
                                {canApprove && (
                                    <button className="btn btn-success" onClick={onApprove} disabled={busy}>
                                        <i className="fas fa-check me-2" />Approve
                                    </button>
                                )}
                                {canReject && (
                                    <>
                                        <input
                                            type="text"
                                            className="form-control form-control-sm"
                                            placeholder="Rejection reason"
                                            value={rejectReason}
                                            onChange={(e) => setRejectReason(e.target.value)}
                                        />
                                        <button className="btn btn-outline-danger" onClick={onReject} disabled={busy}>
                                            <i className="fas fa-xmark me-2" />Reject
                                        </button>
                                    </>
                                )}
                                {canReceive && (
                                    <button className="btn btn-primary" onClick={onSetReceived} disabled={busy}>
                                        <i className="fas fa-box-archive me-2" />Mark received + restock
                                    </button>
                                )}
                                {canResolve && (
                                    <button className="btn btn-primary" onClick={onResolve} disabled={busy}>
                                        <i className="fas fa-circle-check me-2" />Complete + record refund
                                    </button>
                                )}
                                {!canApprove && !canReject && !canReceive && !canResolve && (
                                    <div className="text-muted small mb-0">
                                        No further actions available for status {status}.
                                    </div>
                                )}
                            </div>
                            {ret.rejection_reason && (
                                <div className="card-footer small">
                                    <div className="text-muted">Rejection reason</div>
                                    <div>{ret.rejection_reason}</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}
