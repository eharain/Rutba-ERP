import { useState } from "react";
import Link from "next/link";
import { ReturnRequestsEndpoints } from "@rutba/api-provider/endpoints/index.js";
import CustomerCard from "../CustomerCard";
import ItemsTable from "../ItemsTable";
import { PrintReturnLabelButton } from "../PrintAddressLabel";
import { lineFromItem } from "../util";

// RETURN_REQUESTED / RETURN_IN_TRANSIT / RETURNED — the detour off DELIVERED.
// The order-state side is mostly a viewer: the workhorse is the linked
// return-request, whose own state machine drives stock restocking + refund
// records. From here staff can:
//   - approve / reject a still-pending return
//   - print the provider-specific return label (own_rider pickup slip,
//     custom internal slip, easypost carrier URL)
//   - mark the parcel as received (triggers Sold → InStock walk on the
//     return-request's stock-items)
//   - resolve the return (records refund + transitions order to REFUND_INITIATED)
//
// For the full inspection / refund form we link out to /returns/:id so we
// don't fight with the per-line decision UI that already lives there.

const STATUS_BANNER = {
    RETURN_REQUESTED: {
        cls: "alert-info",
        icon: "fas fa-arrow-rotate-left",
        title: "Return requested.",
        body: "Review the customer's request, then approve to schedule pickup or reject with a reason.",
    },
    RETURN_IN_TRANSIT: {
        cls: "alert-info",
        icon: "fas fa-truck-arrow-right",
        title: "Return in transit.",
        body: "Pickup is in motion. Print the provider-specific return label, then mark received when the parcel arrives.",
    },
    RETURNED: {
        cls: "alert-info",
        icon: "fas fa-box-archive",
        title: "Goods received.",
        body: "Stock units have been walked back to inventory. Open the return record to settle the refund.",
    },
};

export default function ReturnStage({ order, activeReturn, toast, onRefresh }) {
    const items = (order?.products?.items || []).map(lineFromItem);
    const snap = order?.delivery_snapshot || {};
    const customer = {
        name: snap.name || order?.customer_person?.name || "",
        phone: snap.phone || order?.customer_person?.phone || "",
        email: snap.email || order?.customer_person?.email || "",
        line1: snap.line1 || order?.delivery_address?.line1 || "",
        state: snap.state || order?.delivery_address?.state || "",
        city: snap.city || order?.delivery_address?.city || "",
        zip_code: snap.zip_code || order?.delivery_address?.zip_code || "",
        country: snap.country || order?.delivery_address?.country || "PK",
    };

    const status = order?.order_status;
    const banner = STATUS_BANNER[status] || { cls: "alert-light", icon: "fas fa-circle-info", title: status, body: "" };

    const [processing, setProcessing] = useState(false);
    const [rejectReason, setRejectReason] = useState("");

    async function runAction(label, fn) {
        if (processing) return;
        setProcessing(true);
        try {
            await fn();
            toast?.(label, "success");
            await onRefresh?.();
        } catch (err) {
            console.error(label, err);
            toast?.(err?.response?.data?.error?.message || err.message || `${label} failed`, "danger");
        } finally {
            setProcessing(false);
        }
    }

    const retDocId = activeReturn?.documentId;
    const retStatus = activeReturn?.status;

    const canApprove = retStatus === "REQUESTED";
    const canReject  = retStatus === "REQUESTED";
    const canReceive = retStatus === "APPROVED" || retStatus === "AWAITING_PICKUP";
    const canPrintLabel = canReceive || retStatus === "APPROVED";

    function onApprove() {
        runAction("Return approved — pickup scheduled.", () =>
            ReturnRequestsEndpoints.approveReturn(retDocId, {
                pickup_method: activeReturn?.pickup_method || "courier_pickup",
            }),
        );
    }
    function onReject() {
        if (!rejectReason.trim()) {
            toast?.("Rejection reason is required.", "warning");
            return;
        }
        runAction("Return rejected.", () =>
            ReturnRequestsEndpoints.rejectReturn(retDocId, { rejection_reason: rejectReason }),
        );
    }
    function onSetReceived() {
        runAction("Return received — stock units restocked.", () =>
            ReturnRequestsEndpoints.setReceived(retDocId, {}),
        );
    }

    return (
        <>
            <div className={`alert ${banner.cls} small`}>
                <i className={`${banner.icon} me-2`} />
                <strong>{banner.title}</strong> {banner.body}
            </div>

            <CustomerCard value={customer} readOnly orderId={order?.order_id} />
            <ItemsTable items={items} mode="view" />

            <div className="card mb-3">
                <div className="card-header bg-light fw-semibold d-flex justify-content-between align-items-center">
                    <span>
                        <i className="fas fa-arrow-rotate-left me-2" />
                        Return Workflow
                    </span>
                    {activeReturn && (
                        <Link
                            href={`/returns/${activeReturn.documentId}`}
                            className="small text-decoration-none"
                        >
                            Open return record <i className="fas fa-arrow-up-right-from-square ms-1" />
                        </Link>
                    )}
                </div>
                <div className="card-body">
                    {!activeReturn ? (
                        <div className="alert alert-warning mb-0 small">
                            Order is in <code>{status}</code> but no active return-request was found.
                            The customer may have cancelled the request — refresh the page or open the
                            order's return history.
                        </div>
                    ) : (
                        <>
                            <div className="row g-3 mb-3">
                                <div className="col-md-3">
                                    <label className="form-label text-muted small mb-0">Return ref</label>
                                    <div className="fw-semibold">
                                        <code>{activeReturn.return_ref}</code>
                                    </div>
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label text-muted small mb-0">Return status</label>
                                    <div className="fw-semibold">{retStatus || "—"}</div>
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label text-muted small mb-0">Reason</label>
                                    <div className="fw-semibold">{activeReturn.reason || "—"}</div>
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label text-muted small mb-0">Pickup method</label>
                                    <div className="fw-semibold">
                                        {activeReturn.return_method?.name
                                            || activeReturn.pickup_method
                                            || <span className="text-muted">—</span>}
                                    </div>
                                </div>
                                {activeReturn.reason_notes && (
                                    <div className="col-12">
                                        <label className="form-label text-muted small mb-0">Customer notes</label>
                                        <div className="small">{activeReturn.reason_notes}</div>
                                    </div>
                                )}
                            </div>

                            {canReject && (
                                <div className="mb-3">
                                    <label className="form-label small">Rejection reason (only if rejecting)</label>
                                    <input
                                        type="text"
                                        className="form-control form-control-sm"
                                        value={rejectReason}
                                        onChange={(e) => setRejectReason(e.target.value)}
                                        placeholder="e.g. outside return window, item shows signs of use"
                                    />
                                </div>
                            )}

                            <div className="d-flex flex-wrap gap-2 justify-content-between">
                                <div className="d-flex flex-wrap gap-2">
                                    {canPrintLabel && (
                                        <PrintReturnLabelButton
                                            returnRequest={activeReturn}
                                        >
                                            Print Return Label
                                        </PrintReturnLabelButton>
                                    )}
                                </div>
                                <div className="d-flex flex-wrap gap-2">
                                    {canReject && (
                                        <button
                                            className="btn btn-outline-danger"
                                            onClick={onReject}
                                            disabled={processing}
                                        >
                                            <i className="fas fa-xmark me-1" /> Reject
                                        </button>
                                    )}
                                    {canApprove && (
                                        <button
                                            className="btn btn-success"
                                            onClick={onApprove}
                                            disabled={processing}
                                        >
                                            <i className="fas fa-check me-1" /> Approve + schedule pickup
                                        </button>
                                    )}
                                    {canReceive && (
                                        <button
                                            className="btn btn-primary"
                                            onClick={onSetReceived}
                                            disabled={processing}
                                        >
                                            <i className="fas fa-box-archive me-1" /> Mark received + restock
                                        </button>
                                    )}
                                    {retStatus === "RECEIVED" && (
                                        <Link
                                            href={`/returns/${activeReturn.documentId}`}
                                            className="btn btn-primary"
                                        >
                                            <i className="fas fa-hand-holding-dollar me-1" /> Resolve + record refund
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
