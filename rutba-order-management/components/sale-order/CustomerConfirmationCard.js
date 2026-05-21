import { useState } from "react";
import { SaleOrdersEndpoints } from "@rutba/api-provider/endpoints/index.js";
import { serverMessage } from "./util";

// Customer confirmation card. Lives in VerificationStage (and shows up in
// SettledStage as read-only history). Captures the fact that the order
// processing team reached the customer to confirm the order before packaging
// starts — covers "did the customer mean to order this?", "is the address
// right?", "is the COD amount expected?". Optional but encouraged: the
// "Start Preparing" button is enabled regardless, but the badge on later
// stages tells the warehouse + rider whether the order was customer-acked.
//
// Channels (customer_confirmed_via enum):
//   email      — auto-confirmation from the storefront email link
//   phone      — staff called and got verbal okay
//   whatsapp   — staff messaged + got reply
//   in_person  — walk-in / store visit
export default function CustomerConfirmationCard({ order, toast, onRefresh }) {
  const alreadyConfirmed = Boolean(order?.customer_confirmed_at);

  const [via, setVia] = useState(order?.customer_confirmed_via || "phone");
  const [notes, setNotes] = useState(order?.customer_confirmation_notes || "");
  const [processing, setProcessing] = useState(false);

  const handleRecord = async () => {
    setProcessing(true);
    try {
      await SaleOrdersEndpoints.update(order.documentId, {
        data: {
          customer_confirmed_at: new Date(),
          customer_confirmed_via: via,
          customer_confirmation_notes: notes?.trim() || null,
        },
      });
      toast?.("Customer confirmation recorded.", "success");
      await onRefresh?.();
    } catch (err) {
      console.error("Failed to record customer confirmation", err);
      toast?.(`Failed to record confirmation: ${serverMessage(err)}`, "danger");
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Clear the customer confirmation? This is for fixing a mis-click.")) return;
    setProcessing(true);
    try {
      await SaleOrdersEndpoints.update(order.documentId, {
        data: {
          customer_confirmed_at: null,
          customer_confirmed_via: null,
          customer_confirmation_notes: null,
        },
      });
      toast?.("Confirmation cleared.", "info");
      await onRefresh?.();
    } catch (err) {
      console.error("Failed to clear confirmation", err);
      toast?.(`Failed to clear confirmation: ${serverMessage(err)}`, "danger");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="card mb-3">
      <div className="card-header bg-light fw-semibold d-flex align-items-center justify-content-between">
        <span>
          <i className="fas fa-user-check me-2" /> Customer Confirmation
        </span>
        <span
          className={
            "badge " + (alreadyConfirmed ? "bg-success" : "bg-warning text-dark")
          }
        >
          {alreadyConfirmed ? "confirmed" : "not yet"}
        </span>
      </div>
      <div className="card-body">
        <div className="text-muted small mb-3">
          Reach out to the customer to validate the order before packaging — confirm
          the delivery address, item list, and (for COD) the cash they'll have ready.
          A quick phone call avoids returns later.
        </div>

        {alreadyConfirmed && (
          <div className="alert alert-success small mb-3">
            <i className="fas fa-check me-1" />
            Confirmed <strong>{new Date(order.customer_confirmed_at).toLocaleString()}</strong>{" "}
            via <strong>{order.customer_confirmed_via}</strong>.
            {order.customer_confirmation_notes && (
              <div className="mt-1 text-muted">{order.customer_confirmation_notes}</div>
            )}
          </div>
        )}

        <div className="row g-3 mb-3">
          <div className="col-md-3">
            <label className="form-label">Channel</label>
            <select
              className="form-select"
              value={via}
              onChange={(e) => setVia(e.target.value)}
              disabled={processing}
            >
              <option value="phone">Phone</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="in_person">In Person</option>
            </select>
          </div>
          <div className="col-md-9">
            <label className="form-label">Notes</label>
            <input
              className="form-control"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. confirmed COD amount, asked to swap M → L on item 2"
              disabled={processing}
            />
          </div>
        </div>

        <div className="d-flex flex-wrap gap-2 justify-content-end">
          {alreadyConfirmed && (
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={handleReset}
              disabled={processing}
            >
              Reset
            </button>
          )}
          <button
            type="button"
            className="btn btn-success"
            onClick={handleRecord}
            disabled={processing}
          >
            <i className="fas fa-check me-1" />
            {alreadyConfirmed ? "Update Confirmation" : "Record Confirmation"}
          </button>
        </div>
      </div>
    </div>
  );
}
