import { useState } from "react";
import { SaleOrdersEndpoints } from "@rutba/api-provider/endpoints/index.js";
import CustomerCard from "../CustomerCard";
import ItemsTable from "../ItemsTable";
import PrintLabelButton from "../PrintAddressLabel";
import { lineFromItem } from "../util";

// OUT_FOR_DELIVERY: rider is on the way. Two terminal-ish outcomes:
//   - DELIVERED — the state machine finalises attached stock-items to Sold
//   - FAILED_DELIVERY — units stay Reserved; staff can retry or cancel later
export default function DeliveryStage({ order, toast, onRefresh }) {
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

  const markDelivered = async () => {
    setProcessing(true);
    try {
      await SaleOrdersEndpoints.updateStatus(order.documentId, {
        status: "DELIVERED",
        rider_notes: riderNotes || undefined,
      });
      toast?.("Order delivered.", "success");
      await onRefresh?.();
    } catch (err) {
      console.error("Failed to mark delivered", err);
      toast?.("Failed to mark delivered.", "danger");
    } finally {
      setProcessing(false);
    }
  };

  const markFailed = async () => {
    if (!confirm("Mark this delivery as failed?")) return;
    setProcessing(true);
    try {
      await SaleOrdersEndpoints.updateStatus(order.documentId, {
        status: "FAILED_DELIVERY",
        rider_notes: riderNotes || undefined,
      });
      toast?.("Delivery flagged failed.", "warning");
      await onRefresh?.();
    } catch (err) {
      console.error("Failed to mark failed", err);
      toast?.("Failed to flag delivery.", "danger");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <div className="alert alert-primary small">
        <i className="fas fa-truck-fast me-2" />
        <strong>Out for delivery.</strong> Mark the outcome when the rider reports
        back. <em>Delivered</em> finalises the attached stock units to Sold.
      </div>

      <CustomerCard value={customer} readOnly orderId={order?.order_id} />
      <ItemsTable items={items} mode="view" />

      <div className="card">
        <div className="card-header bg-light fw-semibold">
          <i className="fas fa-flag-checkered me-2" /> Delivery Outcome
        </div>
        <div className="card-body">
          <div className="row g-2 mb-3">
            <div className="col-md-4">
              <label className="form-label text-muted small mb-0">Rider</label>
              <div className="fw-semibold">
                {order?.assigned_rider?.full_name || <span className="text-muted">—</span>}
              </div>
            </div>
            <div className="col-md-4">
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
            <div className="col-md-4">
              <label className="form-label text-muted small mb-0">Estimated</label>
              <div className="fw-semibold small">
                {order?.estimated_delivery_time
                  ? new Date(order.estimated_delivery_time).toLocaleString()
                  : <span className="text-muted">—</span>}
              </div>
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label">Rider Notes</label>
            <textarea
              className="form-control"
              rows={2}
              value={riderNotes}
              onChange={(e) => setRiderNotes(e.target.value)}
              placeholder="e.g. customer not home, left with concierge"
            />
          </div>

          <div className="d-flex flex-wrap gap-2 justify-content-between">
            <PrintLabelButton order={order} />
            <div className="d-flex flex-wrap gap-2">
              <button className="btn btn-outline-warning" onClick={markFailed} disabled={processing}>
                <i className="fas fa-triangle-exclamation me-1" /> Mark Failed
              </button>
              <button className="btn btn-success" onClick={markDelivered} disabled={processing}>
                <i className="fas fa-check-double me-1" /> Mark Delivered
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
