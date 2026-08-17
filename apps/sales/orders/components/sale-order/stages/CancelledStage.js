import { useState } from "react";
import { SaleOrdersEndpoints } from "@rutba/api-provider/endpoints/index.js";
import CustomerCard from "../CustomerCard";
import ItemsTable from "../ItemsTable";
import { lineFromItem } from "../util";

// CANCELLED / REFUND_INITIATED / REFUNDED. The state machine only allows
// CANCELLED → REFUND_INITIATED → REFUNDED. REFUNDED is terminal.
export default function CancelledStage({ order, toast, onRefresh }) {
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
  const [processing, setProcessing] = useState(false);

  const advance = async (nextStatus, successMsg) => {
    setProcessing(true);
    try {
      await SaleOrdersEndpoints.updateStatus(order.documentId, { status: nextStatus });
      toast?.(successMsg, "info");
      await onRefresh?.();
    } catch (err) {
      console.error("Failed to advance refund state", err);
      toast?.(`Failed to set ${nextStatus}.`, "danger");
    } finally {
      setProcessing(false);
    }
  };

  const banner = {
    CANCELLED: {
      cls: "alert-danger",
      icon: "fas fa-ban",
      title: "Cancelled.",
      body: "Reserved stock units have been returned to inventory. If money changed hands, initiate a refund.",
    },
    REFUND_INITIATED: {
      cls: "alert-warning",
      icon: "fas fa-hourglass-half",
      title: "Refund pending.",
      body: "Accounts is processing the refund. Mark as refunded once the funds are back with the customer.",
    },
    REFUNDED: {
      cls: "alert-secondary",
      icon: "fas fa-circle-xmark",
      title: "Refunded.",
      body: "Terminal. No further action possible.",
    },
  }[status] || { cls: "alert-light", icon: "fas fa-circle-info", title: status, body: "" };

  return (
    <>
      <div className={`alert ${banner.cls} small`}>
        <i className={`${banner.icon} me-2`} />
        <strong>{banner.title}</strong> {banner.body}
      </div>

      <CustomerCard value={customer} readOnly orderId={order?.order_id} />
      <ItemsTable items={items} mode="view" />

      {status !== "REFUNDED" && (
        <div className="card">
          <div className="card-body d-flex flex-wrap gap-2 justify-content-end">
            {status === "CANCELLED" && (
              <button
                className="btn btn-warning"
                onClick={() => advance("REFUND_INITIATED", "Refund initiated.")}
                disabled={processing}
              >
                <i className="fas fa-hand-holding-dollar me-1" /> Initiate Refund
              </button>
            )}
            {status === "REFUND_INITIATED" && (
              <button
                className="btn btn-secondary"
                onClick={() => advance("REFUNDED", "Order refunded.")}
                disabled={processing}
              >
                <i className="fas fa-check me-1" /> Mark Refunded
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
