import { useState } from "react";
import { SaleOrdersEndpoints } from "@rutba/api-provider/endpoints/index.js";
import CustomerCard from "../CustomerCard";
import ItemsTable from "../ItemsTable";
import { lineFromItem } from "../util";

// FAILED_DELIVERY: stock-items stay Reserved (the state machine deliberately
// does NOT restock on failure — see sale-order-state-machine.js comments).
// Choose to retry (back to OUT_FOR_DELIVERY) or cancel (then restock kicks in).
export default function FailedStage({ order, toast, onRefresh }) {
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

  const [riderNotes, setRiderNotes] = useState(order?.rider_notes || "");
  const [processing, setProcessing] = useState(false);

  const retry = async () => {
    setProcessing(true);
    try {
      await SaleOrdersEndpoints.updateStatus(order.documentId, {
        status: "OUT_FOR_DELIVERY",
        rider_notes: riderNotes || undefined,
      });
      toast?.("Order back out for delivery.", "success");
      await onRefresh?.();
    } catch (err) {
      console.error("Failed to retry delivery", err);
      toast?.("Failed to retry delivery.", "danger");
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

  return (
    <>
      <div className="alert alert-warning small">
        <i className="fas fa-triangle-exclamation me-2" />
        <strong>Delivery failed.</strong> Stock units stay reserved until you either
        retry the delivery or cancel the order.
      </div>

      <CustomerCard value={customer} readOnly orderId={order?.order_id} />
      <ItemsTable items={items} mode="view" />

      <div className="card">
        <div className="card-body">
          <div className="mb-3">
            <label className="form-label">Notes from last attempt</label>
            <textarea
              className="form-control"
              rows={2}
              value={riderNotes}
              onChange={(e) => setRiderNotes(e.target.value)}
            />
          </div>
          <div className="d-flex flex-wrap gap-2 justify-content-end">
            <button className="btn btn-outline-danger" onClick={cancel} disabled={processing}>
              <i className="fas fa-ban me-1" /> Cancel Order
            </button>
            <button className="btn btn-primary" onClick={retry} disabled={processing}>
              <i className="fas fa-rotate-right me-1" /> Retry Delivery
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
