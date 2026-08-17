import { useState } from "react";
import { SaleOrdersEndpoints } from "@rutba/api-provider/endpoints/index.js";
import CustomerCard from "../CustomerCard";
import ItemsTable from "../ItemsTable";
import CostChangeBanner from "../CostChangeBanner";
import { isPaymentDeferred, lineFromItem } from "../util";

// PENDING_PAYMENT — items locked, action depends on payment method:
//
//   COD: confirm the COD commitment (no cash recorded yet). The order
//   advances PENDING_PAYMENT → PAYMENT_CONFIRMED, then the verification
//   stage just gates progress to PREPARING. Cash is recorded + verified
//   AFTER delivery, in SettledStage.
//
//   Non-COD (card / bank / wallet / gateway): record what was collected.
//   /record-payment auto-advances to PAYMENT_CONFIRMED when the paid
//   amount covers the order total, mirroring the Stripe webhook.
export default function PaymentStage({ order, riders, toast, onAdvanced }) {
  const total = Number(order?.total) || 0;
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

  // Default the method based on what the chosen delivery method allows.
  // - delivery_method.supports_cod === true → default cod (PK's dominant flow)
  // - delivery_method.supports_cod === false → COD is hidden entirely;
  //                                            default to card / first prepaid
  // - no delivery_method (legacy order)     → fall back to whatever was
  //                                            already on the order, or cod.
  const codAllowed = order?.delivery_method?.supports_cod !== false;
  const defaultMethod = order?.payment_method || (codAllowed ? "cod" : "card");
  const [paymentMethod, setPaymentMethod] = useState(defaultMethod);
  const [paidAmount, setPaidAmount] = useState(
    Number(order?.paid_amount) > 0 ? String(order.paid_amount) : String(total || "")
  );
  const [collectedByRider, setCollectedByRider] = useState(
    order?.payment_collected_by_rider?.documentId || ""
  );
  const [collectedByNote, setCollectedByNote] = useState(order?.payment_collected_by_note || "");
  const [processing, setProcessing] = useState(false);

  const isCodMethod = paymentMethod === "cod";

  const handleConfirmCod = async () => {
    setProcessing(true);
    try {
      // Persist payment_method so downstream stages know to defer verification
      // until delivery. payment_status mirrors that on the legacy badge.
      await SaleOrdersEndpoints.update(order.documentId, {
        data: { payment_method: "cod", payment_status: "COD" },
      });
      await SaleOrdersEndpoints.updateStatus(order.documentId, { status: "PAYMENT_CONFIRMED" });
      toast?.("COD order confirmed — cash will be collected on delivery.", "success");
      await onAdvanced?.();
    } catch (err) {
      console.error("Failed to confirm COD order", err);
      toast?.(`Failed to confirm COD: ${err?.message || "unknown error"}`, "danger");
    } finally {
      setProcessing(false);
    }
  };

  const handleRecord = async () => {
    const amount = Number(paidAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      toast?.("Paid amount must be a non-negative number.", "warning");
      return;
    }
    setProcessing(true);
    try {
      await SaleOrdersEndpoints.recordPayment(order.documentId, {
        payment_method: paymentMethod,
        paid_amount: amount,
        collected_by_rider_document_id: collectedByRider || undefined,
        collected_by_note: collectedByNote?.trim() || undefined,
      });
      toast?.("Payment recorded.", "success");
      await onAdvanced?.();
    } catch (err) {
      console.error("Failed to record payment", err);
      toast?.(`Failed to record payment: ${err?.message || "unknown error"}`, "danger");
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel this order? Reserved stock units will be released.")) return;
    setProcessing(true);
    try {
      await SaleOrdersEndpoints.updateStatus(order.documentId, { status: "CANCELLED" });
      toast?.("Order cancelled.", "info");
      await onAdvanced?.();
    } catch (err) {
      console.error("Failed to cancel order", err);
      toast?.("Failed to cancel order.", "danger");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <div className="alert alert-warning small">
        <i className="fas fa-money-bill-wave me-2" />
        {isCodMethod ? (
          <>
            <strong>Awaiting payment — Cash on Delivery.</strong> Confirm to start
            preparing the order. <strong>No cash is recorded now</strong> — the
            rider/courier collects on delivery and accounts reconciles afterwards.
          </>
        ) : (
          <>
            <strong>Awaiting payment.</strong> Record what was collected — the order
            advances to <em>Payment Confirmed</em> automatically once the paid amount
            covers the total.
          </>
        )}
      </div>

      <CostChangeBanner order={order} />

      <CustomerCard value={customer} readOnly orderId={order?.order_id} />
      <ItemsTable items={items} mode="view" />

      <div className="card">
        <div className="card-header bg-light fw-semibold">
          <i className="fas fa-cash-register me-2" />
          {isCodMethod ? "Confirm COD Order" : "Record Payment"}
        </div>
        <div className="card-body">
          <div className="row g-3 mb-3">
            <div className="col-md-3">
              <label className="form-label text-muted small mb-0">Order Total</label>
              <div className="fw-semibold">{total.toFixed(2)}</div>
            </div>
            <div className="col-md-3">
              <label className="form-label">Method</label>
              <select
                className="form-select"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                {/* COD only shown when the chosen delivery method allows it.
                    The picker is the source of truth — see
                    delivery-method.supports_cod admin checkbox. */}
                {codAllowed && <option value="cod">Cash on Delivery</option>}
                <option value="card">Card</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="mobile_wallet">Mobile Wallet (Jazzcash / Easypaisa)</option>
                <option value="online_gateway">Online Gateway</option>
              </select>
            </div>

            {/* Cash-recording inputs only make sense for prepaid methods.
                For COD we collect at delivery, so these get hidden — accounts
                will see them re-appear in SettledStage after the order lands. */}
            {!isCodMethod && (
              <>
                <div className="col-md-3">
                  <label className="form-label">Amount Collected</label>
                  <input
                    className="form-control"
                    type="number"
                    min="0"
                    step="0.01"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    placeholder={String(total || "0.00")}
                  />
                </div>
                <div className="col-md-3">
                  <label className="form-label">Collected by (Rider)</label>
                  <select
                    className="form-select"
                    value={collectedByRider}
                    onChange={(e) => setCollectedByRider(e.target.value)}
                  >
                    <option value="">— None (courier / direct)</option>
                    {riders.map((r) => (
                      <option key={r.documentId} value={r.documentId}>
                        {r.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-9">
                  <label className="form-label">Or courier ref / note</label>
                  <input
                    className="form-control"
                    value={collectedByNote}
                    onChange={(e) => setCollectedByNote(e.target.value)}
                    placeholder='e.g. "TCS slip 12345"'
                  />
                </div>
              </>
            )}

            {isCodMethod && (
              <div className="col-12">
                <div className="alert alert-light border small mb-0">
                  <i className="fas fa-circle-info me-1" />
                  Expected cash to collect: <strong>{total.toFixed(2)}</strong>.
                  This will be recorded and verified in the order's <em>Settled</em>
                  stage, after the rider/courier remits.
                </div>
              </div>
            )}
          </div>

          <div className="d-flex flex-wrap gap-2 justify-content-between">
            <button className="btn btn-outline-danger" onClick={handleCancel} disabled={processing}>
              <i className="fas fa-ban me-1" /> Cancel Order
            </button>
            <div className="d-flex gap-2">
              {!isCodMethod && (
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setPaidAmount(String(total || ""))}
                  disabled={processing}
                  title="Pre-fill with the order total"
                >
                  Fill full amount
                </button>
              )}
              {isCodMethod ? (
                <button className="btn btn-primary" onClick={handleConfirmCod} disabled={processing}>
                  <i className="fas fa-check-circle me-1" />
                  {processing ? "Confirming…" : "Confirm COD Order"}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={handleRecord} disabled={processing}>
                  <i className="fas fa-check-circle me-1" />
                  {processing ? "Recording…" : "Record Payment"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
