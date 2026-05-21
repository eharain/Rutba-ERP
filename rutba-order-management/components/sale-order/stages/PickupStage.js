import { useState } from "react";
import { SaleOrdersEndpoints } from "@rutba/api-provider/endpoints/index.js";
import CustomerCard from "../CustomerCard";
import ItemsTable from "../ItemsTable";
import PrintLabelButton from "../PrintAddressLabel";
import { lineFromItem } from "../util";

// AWAITING_PICKUP: parcel is staged. Assign a rider (or note the third-party
// courier), then dispatch — that flips the order to OUT_FOR_DELIVERY.
export default function PickupStage({ order, riders, toast, onRefresh }) {
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

  const [riderDocumentId, setRiderDocumentId] = useState(order?.assigned_rider?.documentId || "");
  const [trackingCode, setTrackingCode] = useState(order?.tracking_code || "");
  const [trackingUrl, setTrackingUrl] = useState(order?.tracking_url || "");
  const [riderNotes, setRiderNotes] = useState(order?.rider_notes || "");
  const [processing, setProcessing] = useState(false);

  const assignRider = async () => {
    if (!riderDocumentId) return;
    setProcessing(true);
    try {
      await SaleOrdersEndpoints.assignRider(order.documentId, {
        rider_document_id: riderDocumentId,
      });
      toast?.("Rider assigned.", "success");
      await onRefresh?.();
    } catch (err) {
      console.error("Failed to assign rider", err);
      toast?.("Failed to assign rider.", "danger");
    } finally {
      setProcessing(false);
    }
  };

  const saveTracking = async () => {
    setProcessing(true);
    try {
      await SaleOrdersEndpoints.update(order.documentId, {
        data: {
          tracking_code: trackingCode.trim() || null,
          tracking_url: trackingUrl.trim() || null,
          rider_notes: riderNotes.trim() || null,
        },
      });
      toast?.("Tracking details saved.", "success");
      await onRefresh?.();
    } catch (err) {
      console.error("Failed to save tracking", err);
      toast?.("Failed to save tracking.", "danger");
    } finally {
      setProcessing(false);
    }
  };

  const dispatch = async () => {
    setProcessing(true);
    try {
      await SaleOrdersEndpoints.updateStatus(order.documentId, {
        status: "OUT_FOR_DELIVERY",
        rider_notes: riderNotes || undefined,
      });
      toast?.("Order out for delivery.", "success");
      await onRefresh?.();
    } catch (err) {
      console.error("Failed to dispatch order", err);
      toast?.("Could not dispatch order.", "danger");
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
      <div className="alert alert-primary small">
        <i className="fas fa-person-biking me-2" />
        <strong>Awaiting pickup.</strong> Assign a rider (or note the courier),
        attach tracking details, then dispatch.
      </div>

      <CustomerCard value={customer} readOnly orderId={order?.order_id} />
      <ItemsTable items={items} mode="view" />

      <div className="card mb-3">
        <div className="card-header bg-light fw-semibold">
          <i className="fas fa-route me-2" /> Dispatch
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Assign Rider</label>
              <div className="d-flex gap-2">
                <select
                  className="form-select"
                  value={riderDocumentId}
                  onChange={(e) => setRiderDocumentId(e.target.value)}
                >
                  <option value="">Select rider...</option>
                  {riders
                    .filter((r) =>
                      ["available", "off_duty", "on_delivery"].includes(String(r.status || ""))
                    )
                    .map((r) => (
                      <option key={r.documentId} value={r.documentId}>
                        {r.full_name} ({r.status || "n/a"})
                      </option>
                    ))}
                </select>
                <button
                  className="btn btn-outline-dark"
                  onClick={assignRider}
                  disabled={!riderDocumentId || processing}
                >
                  {processing ? "…" : "Assign"}
                </button>
              </div>
              {order?.assigned_rider?.full_name && (
                <small className="text-muted">
                  Currently assigned: <strong>{order.assigned_rider.full_name}</strong>
                </small>
              )}
            </div>

            <div className="col-md-3">
              <label className="form-label">Tracking Code</label>
              <input
                className="form-control"
                value={trackingCode}
                onChange={(e) => setTrackingCode(e.target.value)}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label">Tracking URL</label>
              <input
                className="form-control"
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.target.value)}
              />
            </div>
            <div className="col-12">
              <label className="form-label">Rider Notes</label>
              <textarea
                className="form-control"
                rows={2}
                value={riderNotes}
                onChange={(e) => setRiderNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="d-flex flex-wrap gap-2 justify-content-between mt-3">
            <button className="btn btn-outline-danger" onClick={cancel} disabled={processing}>
              <i className="fas fa-ban me-1" /> Cancel Order
            </button>
            <div className="d-flex gap-2">
              <PrintLabelButton order={order} />
              <button
                className="btn btn-outline-secondary"
                onClick={saveTracking}
                disabled={processing}
              >
                <i className="fas fa-save me-1" /> Save Tracking
              </button>
              <button className="btn btn-primary" onClick={dispatch} disabled={processing}>
                <i className="fas fa-paper-plane me-1" /> Dispatch
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
