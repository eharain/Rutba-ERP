import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { SaleOrdersEndpoints } from "@rutba/api-provider/endpoints/index.js";
import CustomerCard from "../CustomerCard";
import ItemsTable from "../ItemsTable";
import { EMPTY_LINE, itemFromLine, lineFromItem, serverMessage } from "../util";
import { useOfferOptions, bestOffer, priceForChoice } from "../hooks/useOfferOptions";

// Editable order — pre-payment. Owns customer + items. Save here either
// creates a new order or PATCHes an existing one in PENDING_PAYMENT.
// Items and address become read-only once the order leaves this stage,
// so we don't bother shielding fields with extra disabled-flags later.
export default function DraftStage({
  order,
  isNew,
  productsCatalog,
  toast,
  onSaved,
}) {
  const router = useRouter();

  const snap = order?.delivery_snapshot || {};
  const person = order?.customer_person || {};
  const addr = order?.delivery_address || {};

  const [customer, setCustomer] = useState({
    name: snap.name || person.name || "",
    phone: snap.phone || person.phone || "",
    email: snap.email || person.email || "",
    line1: snap.line1 || addr.line1 || "",
    state: snap.state || addr.state || "",
    city: snap.city || addr.city || "",
    zip_code: snap.zip_code || addr.zip_code || "",
    country: snap.country || addr.country || "PK",
  });

  const [items, setItems] = useState(() => {
    const loaded = (order?.products?.items || []).map(lineFromItem);
    return loaded.length > 0 ? loaded : [{ ...EMPTY_LINE }];
  });

  const [saving, setSaving] = useState(false);
  const { ensure: ensureOffers, get: getOffers } = useOfferOptions();

  // Load offer options for whatever products the lines already reference, so
  // reopening a saved draft shows its discount picker populated (and flags a
  // linked offer that has since lapsed) without waiting for staff to touch it.
  useEffect(() => {
    for (const it of items) {
      if (it.productDocumentId) ensureOffers(it.productDocumentId);
    }
    // Only the set of products matters; re-running on every keystroke would
    // be wasted work (ensureOffers is cached + deduped anyway).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => i.productDocumentId).join("|"), ensureOffers]);

  const validate = () => {
    const required = ["name", "phone", "email", "line1", "state", "city", "zip_code", "country"];
    if (required.some((k) => !String(customer[k] || "").trim())) {
      toast?.("Please fill all required order fields.", "warning");
      return false;
    }
    if (!Array.isArray(items) || items.length === 0) {
      toast?.("Add at least one product item.", "warning");
      return false;
    }
    const bad = items.some((it) => {
      const q = Number(it.quantity || 0);
      const p = Number(it.price || 0);
      return !String(it.productDocumentId || "").trim() || q <= 0 || p < 0;
    });
    if (bad) {
      toast?.("Each item must have a product, valid quantity, and unit price.", "warning");
      return false;
    }
    // Mirror the server rule rather than let it 409 — a manual discount is
    // the one price the server takes on trust, so it has to say why.
    if (items.some((it) => it.discountSource === "manual" && !String(it.discountReason || "").trim())) {
      toast?.("A manual discount needs a reason.", "warning");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const formatted = items.map(itemFromLine);
      const subtotal = formatted.reduce((s, it) => s + Number(it.total || 0), 0);
      const contact = {
        name: customer.name.trim(),
        phone: customer.phone.trim(),
        email: customer.email.trim(),
        line1: customer.line1.trim(),
        state: customer.state.trim(),
        city: customer.city.trim(),
        zip_code: customer.zip_code.trim(),
        country: customer.country.trim(),
      };

      if (isNew) {
        // POST /sale-orders is the shared checkout handler: it takes a flat
        // `customer` object and resolves person + address + snapshot itself.
        //
        // payment_status MUST be sent. Omitting it defaults the handler to
        // "Ordered", which it reads as already-paid and jumps the order
        // straight to PAYMENT_CONFIRMED — skipping the delivery-method and
        // payment stages entirely, so the order ends up with no delivery
        // method and no payment method. "Pending" keeps it in
        // PENDING_PAYMENT so the stage flow below picks up where it should.
        const res = await SaleOrdersEndpoints.create({
          data: {
            order_id: `ADM-${Date.now()}`,
            customer: contact,
            products: { items: formatted },
            subtotal,
            total: subtotal,
            payment_status: "Pending",
          },
        });
        const created = res.data || res;
        toast?.("Order created.", "success");
        router.push(`/${created.documentId}/sale-order`);
      } else {
        // Two writes, because they need different handlers:
        //   - the contact goes through the plain core PUT, which validates
        //     against the schema and would reject the create-only `customer`
        //     shape, so it writes delivery_snapshot (what stages read back);
        //   - the items go through /update-items, which re-prices them and
        //     re-verifies each line's offer link. Sending items on the PUT
        //     would write client prices straight to the DB unchecked.
        await SaleOrdersEndpoints.update(order.documentId, {
          data: { delivery_snapshot: { ...(order.delivery_snapshot || {}), ...contact } },
        });
        await SaleOrdersEndpoints.updateItems(order.documentId, { items: formatted });
        toast?.("Order saved.", "success");
        await onSaved?.();
      }
    } catch (err) {
      console.error("Failed to save order", err);
      toast?.(`Failed to save order: ${serverMessage(err)}`, "danger");
    } finally {
      setSaving(false);
    }
  };

  const updateItemField = (index, field, value) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));

  // Selecting a product prices the line immediately — the server re-derives
  // every price from the catalog and 409s anything below what it allows, so a
  // line left at the "0" default can never save. The price then lands on the
  // best live offer rather than list: an order taken over the phone should
  // cost what the storefront would have charged, not more.
  const selectProduct = async (index, docId) => {
    const found = productsCatalog.find((p) => p.documentId === docId);
    const catalogPrice = Number(found?.selling_price);
    setItems((prev) =>
      prev.map((it, i) =>
        i === index
          ? {
              ...it,
              productDocumentId: docId,
              productName: found?.name || it.productName,
              // Provisional, from the catalog — replaced below once the offer
              // lookup lands. Set now so the row isn't showing 0 meanwhile.
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
        // Guard against the row having been repointed at another product
        // while the lookup was in flight.
        i === index && it.productDocumentId === docId ? { ...it, ...patch } : it
      )
    );
  };

  const selectDiscount = (index, choice) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        const entry = getOffers(it.productDocumentId);
        return { ...it, ...priceForChoice(entry, choice) };
      })
    );
  };

  return (
    <>
      <div className="alert alert-info small">
        <i className="fas fa-circle-info me-2" />
        <strong>Draft.</strong> Edit customer + items, then save. Once payment is
        recorded the line items lock so the order matches what the customer paid for.
      </div>

      <CustomerCard value={customer} onChange={setCustomer} orderId={order?.order_id} />

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

      <div className="d-flex justify-content-end">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <i className="fas fa-save me-1" />
          {saving ? "Saving…" : isNew ? "Create Order" : "Save Order"}
        </button>
      </div>
    </>
  );
}
