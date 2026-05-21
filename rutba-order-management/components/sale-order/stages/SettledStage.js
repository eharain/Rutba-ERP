import { useState } from "react";
import { SaleOrdersEndpoints, ReturnRequestsEndpoints } from "@rutba/api-provider/endpoints/index.js";
import CustomerCard from "../CustomerCard";
import ItemsTable from "../ItemsTable";
import { isCOD, lineFromItem } from "../util";

// DELIVERED. Always read-only on the order itself (no transitions out via
// the state machine), but COD orders need a post-delivery cash-recording
// + verification flow here: the rider/courier has handed over cash, and
// accounts reconciles it. Until that's done the order is delivered but
// not financially closed — surfacing it as a yellow "outstanding" state.
export default function SettledStage({ order, riders = [], toast, onRefresh }) {
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
  const total = Number(order?.total) || 0;
  const paidSoFar = Number(order?.paid_amount) || 0;
  const cashOutstanding = codOrder && verifStatus !== "verified";

  return (
    <>
      <div className={`alert ${cashOutstanding ? "alert-warning" : "alert-success"} small`}>
        <i className={`fas ${cashOutstanding ? "fa-hourglass-half" : "fa-circle-check"} me-2`} />
        {cashOutstanding ? (
          <>
            <strong>Delivered — awaiting cash remittance.</strong> Stock units are
            finalised to Sold, but the COD payment hasn't been reconciled yet.
            Record the cash collected and have accounts verify it below.
          </>
        ) : (
          <>
            <strong>Delivered &amp; settled.</strong> Stock units are finalised to
            Sold and payment is verified. This order is read-only.
          </>
        )}
      </div>

      <CustomerCard value={customer} readOnly orderId={order?.order_id} />
      <ItemsTable items={items} mode="view" />

      <div className="card mb-3">
        <div className="card-header bg-light fw-semibold">
          <i className="fas fa-receipt me-2" /> Summary
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label text-muted small mb-0">Total</label>
              <div className="fw-semibold">{total.toFixed(2)}</div>
            </div>
            <div className="col-md-3">
              <label className="form-label text-muted small mb-0">Paid</label>
              <div className="fw-semibold">{paidSoFar.toFixed(2)}</div>
            </div>
            <div className="col-md-3">
              <label className="form-label text-muted small mb-0">Payment Method</label>
              <div className="fw-semibold">{order?.payment_method || "—"}</div>
            </div>
            <div className="col-md-3">
              <label className="form-label text-muted small mb-0">Delivered At</label>
              <div className="fw-semibold small">
                {order?.actual_delivery_time
                  ? new Date(order.actual_delivery_time).toLocaleString()
                  : <span className="text-muted">—</span>}
              </div>
            </div>
            <div className="col-md-3">
              <label className="form-label text-muted small mb-0">Rider</label>
              <div className="fw-semibold">
                {order?.assigned_rider?.full_name || <span className="text-muted">—</span>}
              </div>
            </div>
            <div className="col-md-3">
              <label className="form-label text-muted small mb-0">Tracking</label>
              <div className="fw-semibold">
                {order?.tracking_code ? (
                  order.tracking_url ? (
                    <a href={order.tracking_url} target="_blank" rel="noopener noreferrer">
                      {order.tracking_code}
                    </a>
                  ) : (
                    order.tracking_code
                  )
                ) : (
                  <span className="text-muted">—</span>
                )}
              </div>
            </div>
            <div className="col-md-3">
              <label className="form-label text-muted small mb-0">Verified By</label>
              <div className="fw-semibold small">
                {order?.payment_verified_by?.username ||
                  order?.payment_verified_by?.email ||
                  <span className="text-muted">—</span>}
              </div>
            </div>
            <div className="col-md-3">
              <label className="form-label text-muted small mb-0">Verified At</label>
              <div className="fw-semibold small">
                {order?.payment_verified_at
                  ? new Date(order.payment_verified_at).toLocaleString()
                  : <span className="text-muted">—</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {cashOutstanding && (
        <CodSettlementCard
          order={order}
          riders={riders}
          total={total}
          paidSoFar={paidSoFar}
          verifStatus={verifStatus}
          toast={toast}
          onRefresh={onRefresh}
        />
      )}

      <RequestReturnCard order={order} items={items} toast={toast} onRefresh={onRefresh} />
    </>
  );
}

// Staff-initiated return on behalf of a customer. Creates a return-request
// via the same endpoint the storefront uses, which side-effects the order
// state machine into RETURN_REQUESTED — the shell then re-routes to
// ReturnStage. Lines are checkboxed; quantity defaults to ordered qty and
// can be edited.
function RequestReturnCard({ order, items, toast, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("changed_mind");
  const [reasonNotes, setReasonNotes] = useState("");
  const [selected, setSelected] = useState({});
  const [processing, setProcessing] = useState(false);

  const REASON_OPTIONS = [
    ["defective",           "Defective"],
    ["damaged_in_transit",  "Damaged in transit"],
    ["wrong_item",          "Wrong item"],
    ["wrong_size",          "Wrong size"],
    ["changed_mind",        "Changed mind"],
    ["late_delivery",       "Delivered late"],
    ["other",               "Other"],
  ];

  function toggle(idx, line) {
    setSelected((s) => {
      const next = { ...s };
      if (next[idx]) delete next[idx];
      else next[idx] = { quantity: Number(line.quantity) || 1 };
      return next;
    });
  }

  async function onSubmit() {
    const chosen = Object.entries(selected);
    if (chosen.length === 0) {
      toast?.("Pick at least one line to return.", "warning");
      return;
    }
    setProcessing(true);
    try {
      await ReturnRequestsEndpoints.createReturnRequest({
        sale_order_document_id: order.documentId,
        reason,
        reason_notes: reasonNotes.trim() || undefined,
        items: chosen.map(([idx, { quantity }]) => ({
          order_line_index: Number(idx),
          quantity: Number(quantity) || 1,
          reason,
        })),
      });
      toast?.("Return requested. The order is now in the return chain.", "success");
      setOpen(false);
      await onRefresh?.();
    } catch (err) {
      console.error("Failed to create return-request", err);
      toast?.(err?.response?.data?.error?.message || err.message || "Failed to request return", "danger");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="card mt-3">
      <div className="card-header bg-light fw-semibold d-flex align-items-center justify-content-between">
        <span>
          <i className="fas fa-arrow-rotate-left me-2" />
          After-sale
        </span>
        {!open && (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => setOpen(true)}
          >
            <i className="fas fa-arrow-rotate-left me-1" /> Request Return
          </button>
        )}
      </div>
      {open && (
        <div className="card-body">
          <div className="row g-3 mb-3">
            <div className="col-md-4">
              <label className="form-label">Reason</label>
              <select
                className="form-select"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={processing}
              >
                {REASON_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="col-md-8">
              <label className="form-label">Notes (optional)</label>
              <input
                className="form-control"
                value={reasonNotes}
                onChange={(e) => setReasonNotes(e.target.value)}
                placeholder="e.g. customer reported broken zipper"
                disabled={processing}
              />
            </div>
            <div className="col-12">
              <label className="form-label">Lines to return</label>
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: 32 }}></th>
                      <th>Product</th>
                      <th style={{ width: 100 }}>Ordered</th>
                      <th style={{ width: 120 }}>Return qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((line, idx) => {
                      const sel = selected[idx];
                      const ordered = Number(line.quantity) || 1;
                      return (
                        <tr key={idx}>
                          <td>
                            <input
                              type="checkbox"
                              className="form-check-input"
                              checked={!!sel}
                              onChange={() => toggle(idx, line)}
                              disabled={processing}
                            />
                          </td>
                          <td>
                            <div className="fw-semibold">{line.product_name || line.name || "—"}</div>
                            {line.variant_name && (
                              <div className="small text-muted">{line.variant_name}</div>
                            )}
                          </td>
                          <td>{ordered}</td>
                          <td>
                            <input
                              type="number"
                              className="form-control form-control-sm"
                              min={1}
                              max={ordered}
                              value={sel?.quantity ?? ordered}
                              onChange={(e) => {
                                const next = { ...selected };
                                if (!next[idx]) return;
                                next[idx] = { quantity: Math.min(ordered, Math.max(1, Number(e.target.value) || 1)) };
                                setSelected(next);
                              }}
                              disabled={!sel || processing}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="d-flex flex-wrap gap-2 justify-content-end">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => setOpen(false)}
              disabled={processing}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onSubmit}
              disabled={processing}
            >
              <i className="fas fa-paper-plane me-1" /> Submit Return Request
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Post-delivery COD reconciliation. Mirrors PaymentStage's prepaid path:
// record the actual cash + collector, then accounts marks Verified once
// they confirm the cash drop / wallet match. Disputed flags it for
// follow-up without rolling back the original collection record.
function CodSettlementCard({ order, riders, total, paidSoFar, verifStatus, toast, onRefresh }) {
  const [paidAmount, setPaidAmount] = useState(
    paidSoFar > 0 ? String(paidSoFar) : String(total || "")
  );
  const [collectedByRider, setCollectedByRider] = useState(
    order?.payment_collected_by_rider?.documentId || order?.assigned_rider?.documentId || ""
  );
  const [collectedByNote, setCollectedByNote] = useState(order?.payment_collected_by_note || "");
  const [verificationNotes, setVerificationNotes] = useState(order?.payment_verification_notes || "");
  const [processing, setProcessing] = useState(false);

  const handleRecord = async () => {
    const amount = Number(paidAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      toast?.("Amount must be a non-negative number.", "warning");
      return;
    }
    setProcessing(true);
    try {
      await SaleOrdersEndpoints.recordPayment(order.documentId, {
        payment_method: "cod",
        paid_amount: amount,
        collected_by_rider_document_id: collectedByRider || undefined,
        collected_by_note: collectedByNote?.trim() || undefined,
      });
      toast?.("COD cash recorded.", "success");
      await onRefresh?.();
    } catch (err) {
      console.error("Failed to record COD cash", err);
      toast?.(`Failed to record cash: ${err?.message || "unknown error"}`, "danger");
    } finally {
      setProcessing(false);
    }
  };

  const handleVerify = async (status) => {
    setProcessing(true);
    try {
      await SaleOrdersEndpoints.verifyPayment(order.documentId, {
        status,
        notes: verificationNotes?.trim() || undefined,
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

  return (
    <div className="card">
      <div className="card-header bg-light fw-semibold d-flex align-items-center justify-content-between">
        <span>
          <i className="fas fa-cash-register me-2" /> COD Cash Remittance
        </span>
        <span
          className={
            "badge " +
            (verifStatus === "disputed"
              ? "bg-danger"
              : paidSoFar > 0
              ? "bg-warning text-dark"
              : "bg-secondary")
          }
        >
          {paidSoFar > 0 ? verifStatus : "not yet recorded"}
        </span>
      </div>
      <div className="card-body">
        <div className="row g-3 mb-3">
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
          <div className="col-md-6">
            <label className="form-label">Courier ref / note</label>
            <input
              className="form-control"
              value={collectedByNote}
              onChange={(e) => setCollectedByNote(e.target.value)}
              placeholder='e.g. "TCS slip 12345", "rider deposit slip #874"'
            />
          </div>
          <div className="col-12">
            <label className="form-label">Verification Notes</label>
            <textarea
              className="form-control form-control-sm"
              rows={2}
              placeholder="Cash deposit slip #, dispute reason, etc."
              value={verificationNotes}
              onChange={(e) => setVerificationNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="d-flex flex-wrap gap-2 justify-content-between">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => setPaidAmount(String(total || ""))}
            disabled={processing}
          >
            Fill full amount
          </button>
          <div className="d-flex flex-wrap gap-2">
            <button className="btn btn-outline-primary" onClick={handleRecord} disabled={processing}>
              <i className="fas fa-check-circle me-1" /> Record Cash
            </button>
            <button
              className="btn btn-outline-danger btn-sm"
              onClick={() => handleVerify("disputed")}
              disabled={processing || paidSoFar <= 0}
              title={paidSoFar <= 0 ? "Record cash first" : "Flag this payment for follow-up"}
            >
              <i className="fas fa-flag me-1" /> Flag Disputed
            </button>
            <button
              className="btn btn-success"
              onClick={() => handleVerify("verified")}
              disabled={processing || paidSoFar <= 0}
              title={paidSoFar <= 0 ? "Record cash first" : "Confirm the cash drop landed"}
            >
              <i className="fas fa-check me-1" /> Mark Verified
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
