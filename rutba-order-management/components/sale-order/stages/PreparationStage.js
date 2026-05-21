import { useState } from "react";
import { SaleOrdersEndpoints } from "@rutba/api-provider/endpoints/index.js";
import CustomerCard from "../CustomerCard";
import ItemsTable from "../ItemsTable";
import StockItemPicker from "../StockItemPicker";
import CostChangeBanner from "../CostChangeBanner";
import AdjustOrderCard from "../AdjustOrderCard";
import { lineFromItem } from "../util";

// PREPARING: warehouse picks each line and attaches a physical stock unit.
// Once every line has an attached unit (or staff decide they're done — some
// lines may be non-serialised products) advance to AWAITING_PICKUP.
export default function PreparationStage({ order, productsCatalog, toast, onRefresh }) {
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

  const [pickerIndex, setPickerIndex] = useState(null);
  const [attaching, setAttaching] = useState(false);
  const [processing, setProcessing] = useState(false);

  const linesAttached = items.filter((it) => it.stockItemInfo).length;
  const allAttached = items.length > 0 && linesAttached === items.length;

  // Block Ready-for-Pickup while a customer cost-change ack is outstanding.
  // CostChangeBanner is the staff-facing surface for resolving it (resend
  // email or override-by-phone).
  const pendingChange = order?.pending_cost_change;
  const blockedByPending =
    pendingChange && typeof pendingChange === "object"
    && pendingChange.ack_required !== false
    && !pendingChange.acked_at;

  const handleAttach = async (stockItem) => {
    if (pickerIndex == null) return;
    setAttaching(true);
    try {
      await SaleOrdersEndpoints.attachStockItem(order.documentId, {
        item_index: pickerIndex,
        stock_item_document_id: stockItem.documentId,
      });
      toast?.("Stock unit attached.", "success");
      setPickerIndex(null);
      await onRefresh?.();
    } catch (err) {
      console.error("Failed to attach stock item", err);
      toast?.(`Could not attach unit: ${err?.message || "unknown error"}`, "danger");
    } finally {
      setAttaching(false);
    }
  };

  const advance = async () => {
    setProcessing(true);
    try {
      await SaleOrdersEndpoints.updateStatus(order.documentId, { status: "AWAITING_PICKUP" });
      toast?.("Order ready for pickup.", "success");
      await onRefresh?.();
    } catch (err) {
      console.error("Failed to advance to pickup", err);
      toast?.("Could not advance to pickup.", "danger");
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
      <div className="alert alert-secondary small">
        <i className="fas fa-boxes-stacked me-2" />
        <strong>Packaging.</strong> Attach a stock unit to each line. Lines with
        non-serialised products can be left without a unit if that's how you operate;
        you can still advance to pickup.
      </div>

      <CostChangeBanner order={order} toast={toast} onRefresh={onRefresh} />

      <CustomerCard value={customer} readOnly orderId={order?.order_id} />

      <ItemsTable
        items={items}
        mode="fulfill"
        onOpenPicker={setPickerIndex}
        isNewOrder={false}
      />

      <AdjustOrderCard
        order={order}
        productsCatalog={productsCatalog}
        toast={toast}
        onSaved={onRefresh}
      />

      <div className="card">
        <div className="card-body d-flex flex-wrap gap-2 justify-content-between align-items-center">
          <div className="small text-muted">
            <strong>{linesAttached}</strong> of <strong>{items.length}</strong> lines have an attached stock unit.
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-outline-danger" onClick={cancel} disabled={processing}>
              <i className="fas fa-ban me-1" /> Cancel Order
            </button>
            <button
              className="btn btn-primary"
              onClick={advance}
              disabled={processing || blockedByPending}
              title={
                blockedByPending
                  ? "Awaiting customer ack of the cost change"
                  : allAttached
                  ? "Ready — move to Awaiting Pickup"
                  : "Some lines have no stock unit; advance anyway if that's expected"
              }
            >
              <i className="fas fa-arrow-right me-1" /> Ready for Pickup
            </button>
          </div>
        </div>
      </div>

      <StockItemPicker
        open={pickerIndex != null}
        productDocumentId={items[pickerIndex]?.productDocumentId}
        productLabel={items[pickerIndex]?.productName}
        lineIndex={pickerIndex ?? 0}
        attaching={attaching}
        onAttach={handleAttach}
        onClose={() => setPickerIndex(null)}
      />
    </>
  );
}
