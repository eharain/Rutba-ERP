import { useState } from "react";
import { useRouter } from "next/router";
import { SaleOrdersEndpoints } from "@rutba/api-provider/endpoints/index.js";
import CustomerCard from "../CustomerCard";
import ItemsTable from "../ItemsTable";
import { EMPTY_LINE } from "../util";

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
    const loaded = (order?.products?.items || []).map((item) => ({
      productDocumentId: item.product?.documentId || item.product || "",
      productName: item.product_name || "",
      quantity: String(item.quantity ?? 1),
      price: String(item.price ?? 0),
      variant: item.variant || "",
      variantName: item.variant_name || "",
      variantTerms: item.variant_terms || null,
      imageId: item.image?.id ?? (typeof item.image === "number" ? item.image : null),
      imageMedia: item.image && typeof item.image === "object" ? item.image : null,
      stockItemDocumentId: item.stock_item?.documentId || "",
      stockItemInfo: null,
    }));
    return loaded.length > 0 ? loaded : [{ ...EMPTY_LINE }];
  });

  const [saving, setSaving] = useState(false);

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
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const formatted = items.map((it) => {
        const q = Number(it.quantity || 0);
        const p = Number(it.price || 0);
        const out = {
          product: it.productDocumentId,
          product_name: it.productName.trim(),
          quantity: q,
          price: p,
          total: q * p,
        };
        if (it.variant) out.variant = it.variant;
        if (it.variantName) out.variant_name = it.variantName;
        if (it.variantTerms) out.variant_terms = it.variantTerms;
        if (it.imageId) out.image = it.imageId;
        if (it.stockItemDocumentId) out.stock_item = { documentId: it.stockItemDocumentId };
        return out;
      });
      const subtotal = formatted.reduce((s, it) => s + Number(it.total || 0), 0);
      const payload = {
        data: {
          customer: {
            name: customer.name.trim(),
            phone: customer.phone.trim(),
            email: customer.email.trim(),
            line1: customer.line1.trim(),
            state: customer.state.trim(),
            city: customer.city.trim(),
            zip_code: customer.zip_code.trim(),
            country: customer.country.trim(),
          },
          products: { items: formatted },
          subtotal,
          total: subtotal,
        },
      };

      if (isNew) {
        payload.data.order_id = `ADM-${Date.now()}`;
        const res = await SaleOrdersEndpoints.create(payload);
        const created = res.data || res;
        toast?.("Order created.", "success");
        router.push(`/${created.documentId}/sale-order`);
      } else {
        await SaleOrdersEndpoints.update(order.documentId, payload);
        toast?.("Order saved.", "success");
        await onSaved?.();
      }
    } catch (err) {
      console.error("Failed to save order", err);
      toast?.("Failed to save order.", "danger");
    } finally {
      setSaving(false);
    }
  };

  const updateItemField = (index, field, value) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));

  const selectProduct = (index, docId) => {
    const found = productsCatalog.find((p) => p.documentId === docId);
    setItems((prev) =>
      prev.map((it, i) =>
        i === index
          ? { ...it, productDocumentId: docId, productName: found?.name || it.productName }
          : it
      )
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
