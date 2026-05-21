import { useState } from "react";
import { SaleOrdersEndpoints } from "@rutba/api-provider/endpoints/index.js";
import CustomerCard from "../CustomerCard";
import ItemsTable from "../ItemsTable";
import { isCOD, lineFromItem } from "../util";

// PAYMENT_CONFIRMED. Two flavors:
//
//   Prepaid (card/bank/wallet/gateway): cash already in hand, accounts
//   reconciles it landed. Verified → Start Preparing.
//
//   COD: no cash has been collected yet — the order needs to ship first
//   before there's anything to verify. Verify/Dispute are deferred to
//   SettledStage. Start Preparing is ungated.
export default function VerificationStage({ order, toast, onRefresh }) {
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

  const codOrder = isCOD(order);
  const verifStatus = order?.payment_verification_status || "unverified";
  const verifBy = order?.payment_verified_by;

  const [notes, setNotes] = useState(order?.payment_verification_notes || "");
  const [processing, setProcessing] = useState(false);

  const setVerification = async (status) => {
    setProcessing(true);
    try {
      await SaleOrdersEndpoints.verifyPayment(order.documentId, {
        status,
        notes: notes?.trim() || undefined,
      });
      toast?.(`Payment marked ${status}.`, status === "disputed" ? "warning" : "success");
      await onRefresh?.();
    } catch (err) {
      console.error("Failed to update verification", err);
      toast?.(`Failed to update verification: ${err?.message || "unknown error"}`, "danger");
    } finally {
      setProcessing(false);
    }
  };

  const advance = async () => {
    setProcessing(true);
    try {
      await SaleOrdersEndpoints.updateStatus(order.documentId, { status: "PREPARING" });
      toast?.("Order moved to Preparing.", "success");
      await onRefresh?.();
    } catch (err) {
      console.error("Failed to advance order", err);
      toast?.("Could not start preparing.", "danger");
    } finally {
      setProcessing(false);
    }
  };

  const cancel = async () => {
    if (!confirm("Cancel this order? Reserved stock units will be released.")) return;
    setProcessing(true);
    try {
      await SaleOrdersEndpoints.updateStatus(order.documentId, { status: "CANCELLED" });
      toast?.("Order cancelled.", "info");
      await onRefresh?.();
    } catch (err) {
      console.error("Failed to cancel order", err);
      toast?.("Failed to cancel order.", "danger");
    } finally {
      setProcessing(false);
    }
  };

  // For COD the verify buttons stay locked until the cash actually arrives
  // (SettledStage), so Start Preparing isn't gated on verification. For
  // prepaid orders we still require accounts to reconcile first.
  const canAdvanceToPreparing = codOrder || verifStatus === "verified";

  return (
    <>
      {codOrder ? (
        <div className="alert alert-info small">
          <i className="fas fa-hourglass-half me-2" />
          <strong>COD — verification deferred.</strong> No cash has been collected
          yet, so there's nothing to verify here. The rider/courier will collect
          on delivery, and accounts reconciles in the order's <em>Settled</em> stage.
        </div>
      ) : (
        <div className="alert alert-info small">
          <i className="fas fa-shield-halved me-2" />
          <strong>Awaiting verification.</strong> Accounts confirms the cash/transfer
          actually landed. Once verified, the order can move into preparation.
        </div>
      )}

      <CustomerCard value={customer} readOnly orderId={order?.order_id} />
      <ItemsTable items={items} mode="view" />

      <div className="card">
        <div className="card-header bg-light fw-semibold d-flex align-items-center justify-content-between">
          <span>
            <i className="fas fa-clipboard-check me-2" /> Accounts Verification
          </span>
          <span
            className={
              "badge " +
              (verifStatus === "verified"
                ? "bg-success"
                : verifStatus === "disputed"
                ? "bg-danger"
                : "bg-warning text-dark")
            }
          >
            {codOrder ? "deferred" : verifStatus}
          </span>
        </div>
        <div className="card-body">
          <div className="row g-2 mb-3">
            <div className="col-md-3">
              <label className="form-label text-muted small mb-0">Method</label>
              <div className="fw-semibold">{order?.payment_method || "—"}</div>
            </div>
            <div className="col-md-3">
              <label className="form-label text-muted small mb-0">Collected At</label>
              <div className="fw-semibold small">
                {order?.payment_collected_at
                  ? new Date(order.payment_collected_at).toLocaleString()
                  : <span className="text-muted">{codOrder ? "After delivery" : "—"}</span>}
              </div>
            </div>
            <div className="col-md-3">
              <label className="form-label text-muted small mb-0">Verified By</label>
              <div className="fw-semibold small">
                {verifBy?.username || verifBy?.email || <span className="text-muted">—</span>}
              </div>
            </div>
            <div className="col-md-3">
              <label className="form-label text-muted small mb-0">
                {codOrder ? "Expected" : "Paid"}
              </label>
              <div className="fw-semibold">
                {codOrder
                  ? Number(order?.total || 0).toFixed(2)
                  : `${Number(order?.paid_amount || 0).toFixed(2)} / ${Number(order?.total || 0).toFixed(2)}`}
              </div>
            </div>
          </div>

          {!codOrder && (
            <div className="mb-3">
              <label className="form-label">Verification Notes</label>
              <textarea
                className="form-control form-control-sm"
                rows={2}
                placeholder="Cash deposit slip #, dispute reason, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          )}

          <div className="d-flex flex-wrap gap-2 justify-content-between">
            <button className="btn btn-outline-danger" onClick={cancel} disabled={processing}>
              <i className="fas fa-ban me-1" /> Cancel Order
            </button>
            <div className="d-flex gap-2 flex-wrap">
              {!codOrder && (
                <>
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => setVerification("unverified")}
                    disabled={processing || verifStatus === "unverified"}
                  >
                    Reset
                  </button>
                  <button
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => setVerification("disputed")}
                    disabled={processing || verifStatus === "disputed"}
                  >
                    <i className="fas fa-flag me-1" /> Flag Disputed
                  </button>
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => setVerification("verified")}
                    disabled={processing || verifStatus === "verified"}
                  >
                    <i className="fas fa-check me-1" /> Mark Verified
                  </button>
                </>
              )}
              <button
                className="btn btn-primary"
                onClick={advance}
                disabled={processing || !canAdvanceToPreparing}
                title={
                  canAdvanceToPreparing
                    ? "Start preparing the order"
                    : "Verify payment first"
                }
              >
                <i className="fas fa-arrow-right me-1" /> Start Preparing
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
