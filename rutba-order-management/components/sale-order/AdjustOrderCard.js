import { useEffect, useState } from "react";
import { SaleOrdersEndpoints } from "@rutba/api-provider/endpoints/index.js";
import ItemsTable from "./ItemsTable";
import { lineFromItem, itemFromLine, EMPTY_LINE, serverMessage } from "./util";
import { useOfferOptions, bestOffer, priceForChoice } from "./hooks/useOfferOptions";

// Mid-flight order adjustment for staff on already-confirmed orders. Lives
// in VerificationStage (PAYMENT_CONFIRMED) and PreparationStage (PREPARING).
// Two saves happen on submit:
//
//   1. PUT /sale-orders/:id with the new items + recomputed total.
//      (delivery_cost is carried over from the existing order; staff can't
//      change shipping from this card.)
//   2. POST /:id/request-cost-change-ack with old/new totals + reason.
//      The server stamps pending_cost_change and dispatches the customer
//      email. Until the customer clicks (or staff overrides via phone) the
//      stage's Start-Packaging / Ready-for-Pickup button stays disabled —
//      see CostChangeBanner.
//
// Same-total changes (e.g. swap a variant size with identical price) still
// hit step 1 but skip step 2 — there's nothing for the customer to approve.
export default function AdjustOrderCard({
  order,
  productsCatalog,
  toast,
  onSaved,
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [processing, setProcessing] = useState(false);

  const initialItems = (order?.products?.items || []).map(lineFromItem);
  const [items, setItems] = useState(
    initialItems.length > 0 ? initialItems : [{ ...EMPTY_LINE }]
  );

  const currentTotal = Number(order?.total) || 0;
  const currentDeliveryCost = Number(order?.delivery_cost) || 0;
  const newSubtotal = items.reduce(
    (s, it) => s + Number(it.quantity || 0) * Number(it.price || 0),
    0
  );
  const newTotal = newSubtotal + currentDeliveryCost;
  const totalChanged = Math.abs(newTotal - currentTotal) > 0.001;

  const { ensure: ensureOffers, get: getOffers } = useOfferOptions();

  // Populate the discount picker for lines already on the order, so an
  // adjustment shows (and can keep) whatever offer priced them originally.
  useEffect(() => {
    if (!open) return;
    for (const it of items) {
      if (it.productDocumentId) ensureOffers(it.productDocumentId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items.map((i) => i.productDocumentId).join("|"), ensureOffers]);

  const updateItemField = (index, field, value) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));

  const selectProduct = async (index, docId) => {
    const found = productsCatalog?.find((p) => p.documentId === docId);
    const catalogPrice = Number(found?.selling_price);
    setItems((prev) =>
      prev.map((it, i) =>
        i === index
          ? {
              ...it,
              productDocumentId: docId,
              productName: found?.name || it.productName,
              price: catalogPrice > 0 ? String(catalogPrice) : it.price,
              originalPrice: catalogPrice > 0 ? String(catalogPrice) : "",
              discountSource: "none",
              saleOfferDocumentId: "",
              offerName: "",
              discountReason: "",
            }
          : it
      )
    );
    if (!docId) return;

    const entry = (await ensureOffers(docId)) || getOffers(docId);
    if (!entry) return;
    const best = bestOffer(entry);
    const patch = priceForChoice(entry, best ? best.documentId : "none");
    setItems((prev) =>
      prev.map((it, i) =>
        i === index && it.productDocumentId === docId ? { ...it, ...patch } : it
      )
    );
  };

  const selectDiscount = (index, choice) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        return { ...it, ...priceForChoice(getOffers(it.productDocumentId), choice) };
      })
    );
  };

  const handleSave = async () => {
    const bad = items.some((it) => {
      const q = Number(it.quantity || 0);
      const p = Number(it.price || 0);
      return !String(it.productDocumentId || "").trim() || q <= 0 || p < 0;
    });
    if (bad) {
      toast?.("Each item needs a product, valid quantity, and unit price.", "warning");
      return;
    }
    if (totalChanged && !reason.trim()) {
      toast?.("Add a reason — the customer will see it in the approval email.", "warning");
      return;
    }
    if (items.some((it) => it.discountSource === "manual" && !String(it.discountReason || "").trim())) {
      toast?.("A manual discount needs a reason.", "warning");
      return;
    }

    setProcessing(true);
    try {
      // /update-items re-prices server-side and re-verifies each line's offer
      // link, then recomputes subtotal/total itself — so the totals shown here
      // are a preview, and the server's answer is what lands on the order.
      await SaleOrdersEndpoints.updateItems(order.documentId, {
        items: items.map(itemFromLine),
      });

      if (totalChanged) {
        await SaleOrdersEndpoints.requestCostChangeAck(order.documentId, {
          old_total: currentTotal,
          new_total: newTotal,
          reason: reason.trim(),
        });
        toast?.(
          "Order updated. Approval email sent to the customer.",
          "success"
        );
      } else {
        toast?.("Order updated — total unchanged, no customer ack needed.", "success");
      }

      setOpen(false);
      setReason("");
      await onSaved?.();
    } catch (err) {
      console.error("Failed to adjust order", err);
      toast?.(`Failed to adjust order: ${serverMessage(err)}`, "danger");
    } finally {
      setProcessing(false);
    }
  };

  if (!open) {
    return (
      <div className="mb-3 d-flex justify-content-end">
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={() => setOpen(true)}
        >
          <i className="fas fa-pen me-1" />
          Adjust Items / Total
        </button>
      </div>
    );
  }

  return (
    <div className="card mb-3 border-warning">
      <div className="card-header bg-warning-subtle fw-semibold d-flex align-items-center justify-content-between">
        <span>
          <i className="fas fa-pen me-2" />
          Adjust Order
        </span>
        <button
          type="button"
          className="btn-close"
          aria-label="Close"
          onClick={() => {
            setOpen(false);
            setItems(
              initialItems.length > 0 ? initialItems : [{ ...EMPTY_LINE }]
            );
            setReason("");
          }}
          disabled={processing}
        />
      </div>
      <div className="card-body">
        <div className="alert alert-light border small">
          <i className="fas fa-circle-info me-1" />
          Changes to items or quantities will recompute the total. If the new
          total differs from the customer's confirmed total, an approval email
          goes out automatically — the order won't move to packaging until the
          customer confirms.
        </div>

        <ItemsTable
          items={items}
          mode="edit"
          productsCatalog={productsCatalog}
          onUpdateField={updateItemField}
          onSelectProduct={selectProduct}
          onSelectDiscount={selectDiscount}
          offerOptionsFor={getOffers}
          onAddRow={() => setItems((prev) => [...prev, { ...EMPTY_LINE }])}
          onRemoveRow={(index) =>
            setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
          }
        />

        <div className="row g-2 mb-3">
          <div className="col-md-4">
            <label className="form-label text-muted small mb-0">Current total</label>
            <div className="fw-semibold">{currentTotal.toFixed(2)}</div>
          </div>
          <div className="col-md-4">
            <label className="form-label text-muted small mb-0">Delivery</label>
            <div className="fw-semibold">{currentDeliveryCost.toFixed(2)}</div>
          </div>
          <div className="col-md-4">
            <label className="form-label text-muted small mb-0">New total</label>
            <div className={"fw-semibold " + (totalChanged ? "text-warning" : "")}>
              {newTotal.toFixed(2)}
              {totalChanged && (
                <span className="ms-2 small">
                  ({newTotal > currentTotal ? "+" : ""}
                  {(newTotal - currentTotal).toFixed(2)})
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label">
            Reason {totalChanged && <span className="text-danger">*</span>}
          </label>
          <input
            className="form-control"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder='e.g. "swapped to in-stock variant", "added missing accessory"'
            disabled={processing}
          />
          <div className="form-text small">
            Sent to the customer in the approval email so they understand the change.
          </div>
        </div>

        <div className="d-flex justify-content-end gap-2">
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
            className="btn btn-warning"
            onClick={handleSave}
            disabled={processing}
          >
            <i className="fas fa-paper-plane me-1" />
            {processing
              ? "Saving…"
              : totalChanged
              ? "Save & Email Customer"
              : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
