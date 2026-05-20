import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import {
  SaleOrdersEndpoints,
  RidersEndpoints,
  ProductsEndpoints,
  StockItemsEndpoints,
  MediaUtilsEndpoints,
} from "@rutba/api-provider/endpoints/index.js";
import Link from "next/link";
import { useToast } from "../../components/Toast";

// Resolve a Strapi media object to a thumbnail URL. Prefers the `thumbnail`
// format because the table cell is 48px — pulling the original would waste
// bandwidth across rows.
function resolveItemThumb(imageMedia) {
  if (!imageMedia) return null;
  const chosen =
    imageMedia.formats?.thumbnail ||
    imageMedia.formats?.small ||
    imageMedia;
  const url = chosen?.url || imageMedia.url;
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return MediaUtilsEndpoints.imageBaseUrl() + url;
}

const ORDER_STATUS_OPTIONS = [
  "PENDING_PAYMENT",
  "PAYMENT_CONFIRMED",
  "PREPARING",
  "AWAITING_PICKUP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED_DELIVERY",
  "CANCELLED",
  "REFUND_INITIATED",
  "REFUNDED",
];

export default function SaleOrderDetailPage() {
  const router = useRouter();
  const { documentId } = router.query;
  const { jwt } = useAuth();
  const { toast, ToastContainer } = useToast();

  const isNew = !documentId || documentId === "new";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [riders, setRiders] = useState([]);
  const [productsCatalog, setProductsCatalog] = useState([]);

  const [orderId, setOrderId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [country, setCountry] = useState("PK");
  const [orderItems, setOrderItems] = useState([
    { productDocumentId: "", productName: "", quantity: "1", price: "0", variant: "", variantName: "", variantTerms: null, imageId: null, imageMedia: null, stockItemDocumentId: "", stockItemInfo: null },
  ]);
  const [paymentStatus, setPaymentStatus] = useState("COD");
  const [trackingCode, setTrackingCode] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [riderNotes, setRiderNotes] = useState("");
  const [orderStatus, setOrderStatus] = useState("PENDING_PAYMENT");
  const [riderDocumentId, setRiderDocumentId] = useState("");

  // ── Payment collection state ──
  // Driven by the Payment card below. Captured separately from the
  // top-of-form `payment_status` (which is the legacy freeform Stripe/COD
  // label) because the new flow tracks the *who/when/how* of cash collection
  // and a separate verification step in accounts.
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [paidAmount, setPaidAmount] = useState("");
  const [collectedByRider, setCollectedByRider] = useState("");
  const [collectedByNote, setCollectedByNote] = useState("");
  const [paymentCollectedAt, setPaymentCollectedAt] = useState(null); // read-only display
  const [paymentCollectedByRiderInfo, setPaymentCollectedByRiderInfo] = useState(null);
  const [paymentVerificationStatus, setPaymentVerificationStatus] = useState("unverified");
  const [paymentVerificationNotes, setPaymentVerificationNotes] = useState("");
  const [paymentVerifiedAt, setPaymentVerifiedAt] = useState(null);
  const [paymentVerifiedBy, setPaymentVerifiedBy] = useState(null);
  const [orderTotal, setOrderTotal] = useState(0); // used to suggest paid_amount

  // ── Stock-item picker (per-line fulfillment) ──────────────────────────
  // Open with a line index; the modal loads InStock units for that line's
  // product, lets staff pick one, and POSTs attach-stock-item. Closing
  // resets pickerForIndex back to null.
  const [pickerForIndex, setPickerForIndex] = useState(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState("");
  const [pickerUnits, setPickerUnits] = useState([]);
  const [attaching, setAttaching] = useState(false);

  useEffect(() => {
    if (!jwt || !documentId) return;

    const load = async () => {
      setLoading(true);
      try {
        const [riderRes, productRes] = await Promise.all([
          RidersEndpoints.list({
            sort: ["full_name:asc"],
            fields: ["documentId", "full_name", "status"],
            pagination: { pageSize: 200 },
          }),
          ProductsEndpoints.list(1, 500, {
            sort: ["name:asc"],
            fields: ["documentId", "name"],
          }),
        ]);

        setRiders(riderRes.data || []);
        setProductsCatalog(productRes.data || []);

        if (isNew) {
          setLoading(false);
          return;
        }

        const res = await SaleOrdersEndpoints.byId(documentId, {
          // Deep-populate items.image + items.product so staff can see the
          // exact variant + thumbnail the customer picked. Without the nested
          // populate, items come back as `{ product: <id>, image: <id> }` and
          // the table can't render either.
          populate: {
            customer_person: true,
            delivery_address: true,
            assigned_rider: true,
            // Payment audit relations — needed to render "collected by:
            // <rider>" and "verified by: <accountant>" in the Payment card.
            payment_collected_by_rider: { fields: ["documentId", "full_name"] },
            payment_verified_by: { fields: ["id", "username", "email"] },
            products: {
              populate: {
                items: {
                  populate: {
                    image: true,
                    product: { fields: ["documentId", "name"] },
                  },
                },
              },
            },
          },
        });
        const o = res.data || res;
        const loadedItems = (o.products?.items || []).map((item) => ({
          productDocumentId: item.product?.documentId || item.product || "",
          productName: item.product_name || "",
          quantity: String(item.quantity ?? 1),
          price: String(item.price ?? 0),
          // Preserve variant + image attribution end-to-end. The storefront
          // captured these at add-to-cart; if we drop them here, saving the
          // order from this UI wipes the customer's actual selection.
          variant: item.variant || "",
          variantName: item.variant_name || "",
          variantTerms: item.variant_terms || null,
          // image can be either a populated media object (with url/formats)
          // or a bare id depending on populate. Keep both: the id is what we
          // round-trip on save, the media object is what the table renders.
          imageId: item.image?.id ?? (typeof item.image === "number" ? item.image : null),
          imageMedia: item.image && typeof item.image === "object" ? item.image : null,
          // Stock-item attachment for fulfillment. Picker UI sets these via
          // attachStockItem; the bare object is enough metadata to show in
          // the table without re-fetching.
          stockItemDocumentId: item.stock_item?.documentId || "",
          stockItemInfo: item.stock_item
            ? {
                sku: item.stock_item.sku || "",
                barcode: item.stock_item.barcode || "",
                name: item.stock_item.name || "",
                status: item.stock_item.status || "",
              }
            : null,
        }));

        // Read precedence: snapshot (frozen, accurate at order time) → live person
        // → live address. The form lets staff edit the form fields without
        // touching the snapshot — saves go back as a flat `customer` payload.
        const snap = o.delivery_snapshot || {};
        const person = o.customer_person || {};
        const addr = o.delivery_address || {};
        setOrderId(o.order_id || "");
        setCustomerName(snap.name || person.name || "");
        setPhoneNumber(snap.phone || person.phone || "");
        setEmail(snap.email || person.email || "");
        setAddress(snap.line1 || addr.line1 || "");
        setState(snap.state || addr.state || "");
        setCity(snap.city || addr.city || "");
        setZipCode(snap.zip_code || addr.zip_code || "");
        setCountry(snap.country || addr.country || "PK");
        setOrderItems(loadedItems.length > 0 ? loadedItems : [{ productDocumentId: "", productName: "", quantity: "1", price: "0", variant: "", variantName: "", variantTerms: null, imageId: null, imageMedia: null, stockItemDocumentId: "", stockItemInfo: null }]);
        setPaymentStatus(o.payment_status || "COD");
        setTrackingCode(o.tracking_code || "");
        setTrackingUrl(o.tracking_url || "");
        setRiderNotes(o.rider_notes || "");
        setOrderStatus(o.order_status || "PENDING_PAYMENT");
        setRiderDocumentId(o.assigned_rider?.documentId || "");

        // Hydrate payment-collection fields. paid_amount defaults to the
        // order total so a one-click "Record full COD" feels natural; staff
        // can still adjust for partial payments.
        const total = Number(o.total) || 0;
        setOrderTotal(total);
        setPaymentMethod(o.payment_method || "cod");
        setPaidAmount(
          Number(o.paid_amount) > 0 ? String(o.paid_amount) : String(total || "")
        );
        setCollectedByRider(o.payment_collected_by_rider?.documentId || "");
        setPaymentCollectedByRiderInfo(o.payment_collected_by_rider || null);
        setCollectedByNote(o.payment_collected_by_note || "");
        setPaymentCollectedAt(o.payment_collected_at || null);
        setPaymentVerificationStatus(o.payment_verification_status || "unverified");
        setPaymentVerificationNotes(o.payment_verification_notes || "");
        setPaymentVerifiedAt(o.payment_verified_at || null);
        setPaymentVerifiedBy(o.payment_verified_by || null);
      } catch (err) {
        console.error("Failed to load order", err);
        toast("Failed to load order.", "danger");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [jwt, documentId, isNew, toast]);

  const validateBasicFields = () => {
    const required = [customerName, phoneNumber, email, address, state, city, zipCode, country];
    if (required.some((v) => !String(v || "").trim())) {
      toast("Please fill all required order fields.", "warning");
      return false;
    }

    if (!Array.isArray(orderItems) || orderItems.length === 0) {
      toast("Add at least one product item.", "warning");
      return false;
    }

    const hasInvalidItem = orderItems.some((item) => {
      const qty = Number(item.quantity || 0);
      const unitPrice = Number(item.price || 0);
      return !String(item.productDocumentId || "").trim() || qty <= 0 || unitPrice < 0;
    });

    if (hasInvalidItem) {
      toast("Each item must have a product, valid quantity, and valid unit price.", "warning");
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateBasicFields()) return;

    setSaving(true);
    try {
      const formattedItems = orderItems.map((item) => {
        const qty = Number(item.quantity || 0);
        const unitPrice = Number(item.price || 0);
        // Round-trip variant + image so saving an edit doesn't wipe the
        // customer's original selection. Only emit the fields when they
        // actually have content — keeps new admin-created orders clean.
        const out = {
          product: item.productDocumentId,
          product_name: item.productName.trim(),
          quantity: qty,
          price: unitPrice,
          total: qty * unitPrice,
        };
        if (item.variant) out.variant = item.variant;
        if (item.variantName) out.variant_name = item.variantName;
        if (item.variantTerms) out.variant_terms = item.variantTerms;
        if (item.imageId) out.image = item.imageId;
        // Round-trip the attached stock-item too. Without this, a Save Order
        // after attaching a unit would silently drop the relation and the
        // unit would stay Reserved with nothing pointing at it. attach-stock-item
        // is the canonical way to bind a unit; this just preserves bindings
        // that already exist when staff edits other order fields.
        if (item.stockItemDocumentId) out.stock_item = { documentId: item.stockItemDocumentId };
        return out;
      });

      const subtotal = formattedItems.reduce((sum, item) => sum + Number(item.total || 0), 0);

      const payload = {
        data: {
          // Flat customer payload (unification Phase 1A) — server resolves
          // person + snapshot, optionally persists into the user's address book.
          customer: {
            name: customerName.trim(),
            phone: phoneNumber.trim(),
            email: email.trim(),
            line1: address.trim(),
            state: state.trim(),
            city: city.trim(),
            zip_code: zipCode.trim(),
            country: country.trim(),
          },
          products: {
            items: formattedItems,
          },
          subtotal,
          total: subtotal,
          payment_status: paymentStatus || "COD",
          tracking_code: trackingCode.trim() || null,
          tracking_url: trackingUrl.trim() || null,
          rider_notes: riderNotes.trim() || null,
        },
      };

      if (isNew) {
        payload.data.order_id = `ADM-${Date.now()}`;
        const res = await SaleOrdersEndpoints.create(payload);
        const created = res.data || res;
        toast("Order created.", "success");
        router.push(`/${created.documentId}/sale-order`);
      } else {
        await SaleOrdersEndpoints.update(documentId, payload);
        toast("Order updated.", "success");
      }
    } catch (err) {
      console.error("Failed to save order", err);
      toast("Failed to save order.", "danger");
    } finally {
      setSaving(false);
    }
  };

  const updateItemField = (index, field, value) => {
    setOrderItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const handleSelectProduct = (index, selectedDocumentId) => {
    const selected = productsCatalog.find((p) => p.documentId === selectedDocumentId);
    setOrderItems((prev) => prev.map((item, i) => (
      i !== index
        ? item
        : {
            ...item,
            productDocumentId: selectedDocumentId,
            productName: selected?.name || item.productName,
          }
    )));
  };

  const addProductRow = () => {
    setOrderItems((prev) => [...prev, { productDocumentId: "", productName: "", quantity: "1", price: "0", variant: "", variantName: "", variantTerms: null, imageId: null, imageMedia: null, stockItemDocumentId: "", stockItemInfo: null }]);
  };

  const removeProductRow = (index) => {
    setOrderItems((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleUpdateStatus = async () => {
    if (!orderStatus) return;
    setProcessing(true);
    try {
      await SaleOrdersEndpoints.updateStatus(documentId, {
        status: orderStatus,
        rider_notes: riderNotes || undefined,
      });
      toast("Order status updated.", "success");
    } catch (err) {
      console.error("Failed to update order status", err);
      toast("Failed to update order status.", "danger");
    } finally {
      setProcessing(false);
    }
  };

  const handleAssignRider = async () => {
    if (!riderDocumentId) return;
    setProcessing(true);
    try {
      await SaleOrdersEndpoints.assignRider(documentId, { rider_document_id: riderDocumentId });
      toast("Rider assigned.", "success");
    } catch (err) {
      console.error("Failed to assign rider", err);
      toast("Failed to assign rider.", "danger");
    } finally {
      setProcessing(false);
    }
  };

  // ── Payment collection handlers ──────────────────────────────────────
  // recordPayment captures the *what was collected* — method, amount, who
  // brought the cash in. The endpoint server-side auto-advances the order
  // to PAYMENT_CONFIRMED if amount >= total, mirroring the Stripe webhook
  // for cards. Re-loads the order after to refresh the audit fields.
  const handleRecordPayment = async () => {
    const amount = Number(paidAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      toast("Paid amount must be a non-negative number.", "warning");
      return;
    }
    if (!paymentMethod) {
      toast("Pick a payment method first.", "warning");
      return;
    }
    setProcessing(true);
    try {
      const res = await SaleOrdersEndpoints.recordPayment(documentId, {
        payment_method: paymentMethod,
        paid_amount: amount,
        collected_by_rider_document_id: collectedByRider || undefined,
        collected_by_note: collectedByNote?.trim() || undefined,
      });
      const updated = res?.data || res;
      // Reflect server-side computed fields back into the form so the
      // verification status / collected_at / payment_status badge update
      // without a hard reload.
      setPaymentCollectedAt(updated?.payment_collected_at || null);
      setPaymentCollectedByRiderInfo(updated?.payment_collected_by_rider || null);
      setPaymentVerificationStatus(updated?.payment_verification_status || "unverified");
      setPaymentStatus(updated?.payment_status || paymentStatus);
      if (updated?.order_status) setOrderStatus(updated.order_status);
      toast("Payment recorded. Awaiting accounts verification.", "success");
    } catch (err) {
      console.error("Failed to record payment", err);
      toast(`Failed to record payment: ${err?.message || "unknown error"}`, "danger");
    } finally {
      setProcessing(false);
    }
  };

  // verifyPayment is the accounts-side action — confirms the cash actually
  // landed (drawer, deposit, wallet match). Disputed status flags it for
  // follow-up without rolling back the original collection record.
  const handleVerifyPayment = async (nextStatus) => {
    if (!["verified", "disputed", "unverified"].includes(nextStatus)) return;
    setProcessing(true);
    try {
      const res = await SaleOrdersEndpoints.verifyPayment(documentId, {
        status: nextStatus,
        notes: paymentVerificationNotes?.trim() || undefined,
      });
      const updated = res?.data || res;
      setPaymentVerificationStatus(updated?.payment_verification_status || nextStatus);
      setPaymentVerifiedAt(updated?.payment_verified_at || null);
      setPaymentVerifiedBy(updated?.payment_verified_by || null);
      toast(`Payment marked ${nextStatus}.`, nextStatus === "disputed" ? "warning" : "success");
    } catch (err) {
      console.error("Failed to verify payment", err);
      toast(`Failed to update verification: ${err?.message || "unknown error"}`, "danger");
    } finally {
      setProcessing(false);
    }
  };

  // ── Stock-item picker handlers ──────────────────────────────────────
  // openPicker fetches up to 100 InStock units for the line's product. We
  // don't paginate here — typical product carries < 100 InStock units; if
  // that ever breaks we'll add a search box and switch to server-side
  // filtering by sku/barcode like StockItemsEndpoints.list already supports.
  const openPicker = async (index) => {
    const line = orderItems[index];
    if (!line?.productDocumentId) {
      toast("Pick a product on this line first.", "warning");
      return;
    }
    setPickerForIndex(index);
    setPickerLoading(true);
    setPickerError("");
    setPickerUnits([]);
    try {
      const res = await StockItemsEndpoints.list(1, 100, {
        statusFilter: "InStock",
        productDocId: line.productDocumentId,
        sort: ["createdAt:asc"],
      });
      const units = res?.data ?? [];
      setPickerUnits(units);
      if (units.length === 0) {
        setPickerError("No InStock units available for this product.");
      }
    } catch (err) {
      console.error("Failed to load stock items", err);
      setPickerError(err?.message || "Failed to load stock units.");
    } finally {
      setPickerLoading(false);
    }
  };

  const closePicker = () => {
    setPickerForIndex(null);
    setPickerLoading(false);
    setPickerError("");
    setPickerUnits([]);
  };

  // Attach a chosen unit to the line + reflect the server's response back
  // into form state so the row updates without a full page reload. The
  // server's response is the updated order doc, so we re-extract the same
  // line and patch its stock-item bits.
  const handleAttachStockItem = async (stockItem) => {
    if (pickerForIndex == null) return;
    setAttaching(true);
    try {
      const res = await SaleOrdersEndpoints.attachStockItem(documentId, {
        item_index: pickerForIndex,
        stock_item_document_id: stockItem.documentId,
      });
      const updated = res?.data || res;
      const updatedLine = updated?.products?.items?.[pickerForIndex];
      setOrderItems((prev) =>
        prev.map((line, i) =>
          i === pickerForIndex
            ? {
                ...line,
                stockItemDocumentId: updatedLine?.stock_item?.documentId || stockItem.documentId,
                stockItemInfo: updatedLine?.stock_item
                  ? {
                      sku: updatedLine.stock_item.sku || stockItem.sku || "",
                      barcode: updatedLine.stock_item.barcode || stockItem.barcode || "",
                      name: updatedLine.stock_item.name || stockItem.name || "",
                      status: updatedLine.stock_item.status || "Reserved",
                    }
                  : {
                      sku: stockItem.sku || "",
                      barcode: stockItem.barcode || "",
                      name: stockItem.name || "",
                      status: "Reserved",
                    },
              }
            : line
        )
      );
      toast("Stock unit attached.", "success");
      closePicker();
    } catch (err) {
      console.error("Failed to attach stock item", err);
      toast(`Could not attach unit: ${err?.message || "unknown error"}`, "danger");
    } finally {
      setAttaching(false);
    }
  };

  return (
    <ProtectedRoute>
      <Layout>
        <ToastContainer />

        <div className="d-flex align-items-center mb-3">
          <Link className="btn btn-sm btn-outline-secondary me-3" href="/sale-orders">
            <i className="fas fa-arrow-left"></i> Back
          </Link>
          <h2 className="mb-0">{isNew ? "New Sale Order" : "Edit Sale Order"}</h2>
          <div className="ms-auto d-flex gap-2">
            <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : isNew ? "Create Order" : "Save Order"}
            </button>
          </div>
        </div>

        {loading && <p>Loading...</p>}

        {!loading && (
          <>
            <div className="card mb-4">
              <div className="card-header bg-light fw-semibold">
                <i className="fas fa-receipt me-2"></i>
                Order Details
              </div>
              <div className="card-body">
                {!isNew && (
                  <div className="mb-3">
                    <label className="form-label">Order ID</label>
                    <input className="form-control" value={orderId} disabled readOnly />
                  </div>
                )}

                <div className="row g-2">
                  <div className="col-md-3">
                    <label className="form-label">Customer Name</label>
                    <input className="form-control" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label">Phone</label>
                    <input className="form-control" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Email</label>
                    <input className="form-control" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Address</label>
                    <input className="form-control" value={address} onChange={(e) => setAddress(e.target.value)} required />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label">State</label>
                    <input className="form-control" value={state} onChange={(e) => setState(e.target.value)} required />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label">City</label>
                    <input className="form-control" value={city} onChange={(e) => setCity(e.target.value)} required />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label">Zip Code</label>
                    <input className="form-control" value={zipCode} onChange={(e) => setZipCode(e.target.value)} required />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label">Country</label>
                    <input className="form-control" value={country} onChange={(e) => setCountry(e.target.value)} required />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label">Payment Status</label>
                    <select className="form-select" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
                      <option value="COD">COD</option>
                      <option value="SUCCEEDED">SUCCEEDED</option>
                      <option value="PENDING">PENDING</option>
                    </select>
                  </div>
                  <div className="col-md-2">
                    <label className="form-label">Tracking Code</label>
                    <input className="form-control" value={trackingCode} onChange={(e) => setTrackingCode(e.target.value)} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Tracking URL</label>
                    <input className="form-control" value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} />
                  </div>
                  <div className="col-12">
                    <label className="form-label">Rider Notes</label>
                    <textarea className="form-control" rows={3} value={riderNotes} onChange={(e) => setRiderNotes(e.target.value)} />
                  </div>

                  <div className="col-12 mt-3">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <label className="form-label mb-0">Products</label>
                      <button type="button" className="btn btn-sm btn-outline-primary" onClick={addProductRow}>
                        <i className="fas fa-plus me-1"></i>Add Product
                      </button>
                    </div>

                    <div className="alert alert-light border small mb-2">
                      Products are associated at order time. Attach a physical
                      <strong> stock unit </strong>per line during fulfillment — once
                      attached, the unit moves to <em>Reserved</em> and leaves
                      available stock.
                    </div>

                    <div className="table-responsive">
                      <table className="table table-sm align-middle">
                        <thead>
                          <tr>
                            <th style={{ width: 64 }}>Image</th>
                            <th style={{ minWidth: 240 }}>Product</th>
                            <th style={{ minWidth: 200 }}>Product Name / Variant</th>
                            <th style={{ width: 100 }}>Qty</th>
                            <th style={{ width: 140 }}>Unit Price</th>
                            <th style={{ width: 140 }}>Total</th>
                            <th style={{ minWidth: 200 }}>Stock Unit</th>
                            <th style={{ width: 90 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {orderItems.map((item, index) => {
                            const qty = Number(item.quantity || 0);
                            const unitPrice = Number(item.price || 0);
                            const lineTotal = qty * unitPrice;
                            const thumbUrl = resolveItemThumb(item.imageMedia);
                            // variant_terms is a free-form JSON map (e.g.
                            // { Size: "M", Color: "Red" }) — render whatever
                            // keys are there so the schema can evolve without
                            // this UI needing updates.
                            const variantTermsEntries =
                              item.variantTerms && typeof item.variantTerms === "object"
                                ? Object.entries(item.variantTerms)
                                : [];

                            return (
                              <tr key={index}>
                                <td>
                                  {thumbUrl ? (
                                    // Plain <img> not next/image — this app is
                                    // CSR-only and we'd otherwise need to whitelist
                                    // the Strapi host in next.config.
                                    <img
                                      src={thumbUrl}
                                      alt={item.productName || "item"}
                                      style={{
                                        width: 48,
                                        height: 48,
                                        objectFit: "cover",
                                        borderRadius: 4,
                                        background: "#f4f4f5",
                                      }}
                                    />
                                  ) : (
                                    <div
                                      style={{
                                        width: 48,
                                        height: 48,
                                        borderRadius: 4,
                                        background: "#f4f4f5",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: "#9ca3af",
                                        fontSize: 18,
                                      }}
                                      title="No image attached"
                                    >
                                      <i className="fas fa-image" />
                                    </div>
                                  )}
                                </td>
                                <td>
                                  <select
                                    className="form-select form-select-sm"
                                    value={item.productDocumentId}
                                    onChange={(e) => handleSelectProduct(index, e.target.value)}
                                  >
                                    <option value="">Select product...</option>
                                    {productsCatalog.map((p) => (
                                      <option key={p.documentId} value={p.documentId}>{p.name || p.documentId}</option>
                                    ))}
                                  </select>
                                </td>
                                <td>
                                  <input
                                    className="form-control form-control-sm"
                                    value={item.productName}
                                    onChange={(e) => updateItemField(index, "productName", e.target.value)}
                                  />
                                  {/* Variant attribution — read-only because it
                                      reflects the customer's choice at order
                                      time. Editing it here would silently
                                      misrepresent what was actually purchased. */}
                                  {(item.variantName || variantTermsEntries.length > 0) && (
                                    <div className="mt-1 d-flex flex-wrap gap-1">
                                      {item.variantName && (
                                        <span className="badge bg-secondary">
                                          {item.variantName}
                                        </span>
                                      )}
                                      {variantTermsEntries.map(([k, v]) => (
                                        <span key={k} className="badge bg-light text-dark border">
                                          {k}: {String(v)}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td>
                                  <input
                                    className="form-control form-control-sm"
                                    type="number"
                                    min="1"
                                    value={item.quantity}
                                    onChange={(e) => updateItemField(index, "quantity", e.target.value)}
                                  />
                                </td>
                                <td>
                                  <input
                                    className="form-control form-control-sm"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.price}
                                    onChange={(e) => updateItemField(index, "price", e.target.value)}
                                  />
                                </td>
                                <td>{lineTotal.toFixed(2)}</td>
                                {/* Stock-unit attachment for fulfillment. Shows
                                    the attached unit's identifying info when
                                    bound; otherwise an "Attach unit" button
                                    that opens the picker scoped to this line's
                                    product. New (unsaved) rows can't attach
                                    yet — they need a real documentId on the
                                    order first. */}
                                <td>
                                  {item.stockItemInfo ? (
                                    <div className="small">
                                      <div className="fw-semibold text-success">
                                        <i className="fas fa-check-circle me-1"></i>
                                        {item.stockItemInfo.sku ||
                                          item.stockItemInfo.barcode ||
                                          item.stockItemInfo.name ||
                                          "Attached"}
                                      </div>
                                      <div className="text-muted">
                                        {item.stockItemInfo.status || "Reserved"}
                                        {item.stockItemInfo.barcode && item.stockItemInfo.sku && (
                                          <span className="ms-2">· {item.stockItemInfo.barcode}</span>
                                        )}
                                      </div>
                                      <button
                                        type="button"
                                        className="btn btn-link btn-sm p-0 mt-1"
                                        onClick={() => openPicker(index)}
                                        disabled={isNew}
                                      >
                                        Change
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-primary"
                                      onClick={() => openPicker(index)}
                                      disabled={isNew || !item.productDocumentId}
                                      title={
                                        isNew
                                          ? "Save the order first"
                                          : !item.productDocumentId
                                          ? "Pick a product first"
                                          : "Attach an InStock unit"
                                      }
                                    >
                                      <i className="fas fa-box me-1"></i>
                                      Attach unit
                                    </button>
                                  )}
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-danger"
                                    onClick={() => removeProductRow(index)}
                                    disabled={orderItems.length <= 1}
                                  >
                                    <i className="fas fa-trash"></i>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {!isNew && (
              <div className="card">
                <div className="card-header bg-light fw-semibold">
                  <i className="fas fa-cogs me-2"></i>
                  Processing Actions
                </div>
                <div className="card-body">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Order Status</label>
                      <div className="d-flex gap-2">
                        <select className="form-select" value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)}>
                          {ORDER_STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        <button className="btn btn-outline-primary" onClick={handleUpdateStatus} disabled={processing}>
                          {processing ? "..." : "Update"}
                        </button>
                      </div>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Assign Rider</label>
                      <div className="d-flex gap-2">
                        <select className="form-select" value={riderDocumentId} onChange={(e) => setRiderDocumentId(e.target.value)}>
                          <option value="">Select rider...</option>
                          {riders
                            .filter((r) => ["available", "off_duty", "on_delivery"].includes(String(r.status || "")))
                            .map((r) => (
                              <option key={r.documentId} value={r.documentId}>
                                {r.full_name} ({r.status || "n/a"})
                              </option>
                            ))}
                        </select>
                        <button className="btn btn-outline-dark" onClick={handleAssignRider} disabled={!riderDocumentId || processing}>
                          {processing ? "..." : "Assign"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Payment card ─────────────────────────────────────────
                Mirrors pos-sale's CheckoutModal in spirit: pick a method,
                record what was collected, then accounts verifies. The
                "Cash on Delivery" path is the headline use case — riders
                drop cash, the order gets PAID/PARTIAL marked here, and
                rutba-accounts reconciles via the same record on a separate
                page.
            */}
            {!isNew && (
              <div className="card mt-4">
                <div className="card-header bg-light fw-semibold d-flex align-items-center justify-content-between">
                  <span>
                    <i className="fas fa-money-bill-wave me-2"></i>
                    Payment
                  </span>
                  <span className="d-flex gap-2 align-items-center">
                    <span className={`badge ${
                      paymentVerificationStatus === "verified" ? "bg-success" :
                      paymentVerificationStatus === "disputed" ? "bg-danger" :
                      "bg-warning text-dark"
                    }`}>
                      {paymentVerificationStatus}
                    </span>
                    <span className={`badge ${
                      String(paymentStatus).toUpperCase() === "PAID" ? "bg-success" :
                      String(paymentStatus).toUpperCase() === "PARTIAL" ? "bg-warning text-dark" :
                      "bg-secondary"
                    }`}>
                      {paymentStatus || "—"}
                    </span>
                  </span>
                </div>
                <div className="card-body">
                  {/* Summary row — what we already know about the order */}
                  <div className="row g-2 mb-3">
                    <div className="col-md-3">
                      <label className="form-label text-muted small mb-0">Order Total</label>
                      <div className="fw-semibold">{Number(orderTotal || 0).toFixed(2)}</div>
                    </div>
                    <div className="col-md-3">
                      <label className="form-label text-muted small mb-0">Collected At</label>
                      <div className="fw-semibold small">
                        {paymentCollectedAt
                          ? new Date(paymentCollectedAt).toLocaleString()
                          : <span className="text-muted">Not yet</span>}
                      </div>
                    </div>
                    <div className="col-md-3">
                      <label className="form-label text-muted small mb-0">Verified At</label>
                      <div className="fw-semibold small">
                        {paymentVerifiedAt
                          ? new Date(paymentVerifiedAt).toLocaleString()
                          : <span className="text-muted">Not yet</span>}
                      </div>
                    </div>
                    <div className="col-md-3">
                      <label className="form-label text-muted small mb-0">Verified By</label>
                      <div className="fw-semibold small">
                        {paymentVerifiedBy?.username || paymentVerifiedBy?.email || <span className="text-muted">—</span>}
                      </div>
                    </div>
                  </div>

                  <div className="alert alert-light border small mb-3">
                    <i className="fas fa-circle-info me-1"></i>
                    <strong>Cash on Delivery (Pakistan):</strong> riders or third-party
                    couriers collect cash on handover. Record the collection here so
                    the order auto-advances to <em>Payment Confirmed</em>, then the
                    accounts team verifies the cash drop separately.
                  </div>

                  <div className="row g-3">
                    <div className="col-md-3">
                      <label className="form-label">Method</label>
                      <select
                        className="form-select"
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                      >
                        <option value="cod">Cash on Delivery</option>
                        <option value="card">Card</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="mobile_wallet">Mobile Wallet (Jazzcash / Easypaisa / etc.)</option>
                        <option value="online_gateway">Online Gateway</option>
                      </select>
                    </div>
                    <div className="col-md-3">
                      <label className="form-label">Amount Collected</label>
                      <input
                        className="form-control"
                        type="number"
                        min="0"
                        step="0.01"
                        value={paidAmount}
                        onChange={(e) => setPaidAmount(e.target.value)}
                        placeholder={String(orderTotal || "0.00")}
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
                      {paymentCollectedByRiderInfo?.full_name && !collectedByRider && (
                        <small className="text-muted">
                          Previously: {paymentCollectedByRiderInfo.full_name}
                        </small>
                      )}
                    </div>
                    <div className="col-md-3">
                      <label className="form-label">Or courier ref / note</label>
                      <input
                        className="form-control"
                        value={collectedByNote}
                        onChange={(e) => setCollectedByNote(e.target.value)}
                        placeholder='e.g. "TCS slip 12345"'
                      />
                    </div>

                    <div className="col-12 d-flex flex-wrap gap-2 align-items-center">
                      <button
                        className="btn btn-primary"
                        onClick={handleRecordPayment}
                        disabled={processing}
                      >
                        <i className="fas fa-check-circle me-1"></i>
                        {processing ? "Recording…" : "Record Payment"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => setPaidAmount(String(orderTotal || ""))}
                        disabled={processing}
                        title="Pre-fill with the order total"
                      >
                        Fill full amount
                      </button>
                    </div>
                  </div>

                  {/* Verification row — accounts-team-facing actions. Hidden
                      until a payment has actually been recorded. */}
                  {paymentCollectedAt && (
                    <div className="mt-4 pt-3 border-top">
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <label className="form-label mb-0 fw-semibold">
                          Accounts Verification
                        </label>
                      </div>
                      <div className="row g-2">
                        <div className="col-md-8">
                          <textarea
                            className="form-control form-control-sm"
                            rows={2}
                            placeholder="Verification / dispute notes (cash deposited slip #, dispute reason, etc.)"
                            value={paymentVerificationNotes}
                            onChange={(e) => setPaymentVerificationNotes(e.target.value)}
                          />
                        </div>
                        <div className="col-md-4 d-flex flex-column gap-2">
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleVerifyPayment("verified")}
                            disabled={processing || paymentVerificationStatus === "verified"}
                          >
                            <i className="fas fa-check me-1"></i>
                            Mark Verified
                          </button>
                          <button
                            className="btn btn-outline-danger btn-sm"
                            onClick={() => handleVerifyPayment("disputed")}
                            disabled={processing || paymentVerificationStatus === "disputed"}
                          >
                            <i className="fas fa-flag me-1"></i>
                            Flag as Disputed
                          </button>
                          {paymentVerificationStatus !== "unverified" && (
                            <button
                              className="btn btn-outline-secondary btn-sm"
                              onClick={() => handleVerifyPayment("unverified")}
                              disabled={processing}
                              title="Roll the verification back if you marked the wrong order"
                            >
                              Reset to Unverified
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Stock-item picker modal ──────────────────────────────────
            Bootstrap-styled modal we drive from React state (no Bootstrap JS
            plugin). Lists InStock units for the active line's product; a
            click sends the attach request and closes on success.  */}
        {pickerForIndex != null && (
          <>
            <div
              className="modal-backdrop fade show"
              style={{ zIndex: 1040 }}
              onClick={attaching ? undefined : closePicker}
            />
            <div
              className="modal fade show d-block"
              tabIndex="-1"
              role="dialog"
              style={{ zIndex: 1050 }}
            >
              <div className="modal-dialog modal-lg" role="document">
                <div className="modal-content">
                  <div className="modal-header">
                    <h5 className="modal-title">
                      <i className="fas fa-box me-2"></i>
                      Pick a stock unit for line {pickerForIndex + 1}
                    </h5>
                    <button
                      type="button"
                      className="btn-close"
                      aria-label="Close"
                      onClick={closePicker}
                      disabled={attaching}
                    />
                  </div>
                  <div className="modal-body">
                    <p className="text-muted small">
                      Showing InStock units for{" "}
                      <strong>
                        {orderItems[pickerForIndex]?.productName || "this product"}
                      </strong>
                      . Selecting one transitions it to <em>Reserved</em>.
                    </p>
                    {pickerLoading && (
                      <div className="text-center py-4 text-muted">
                        <i className="fas fa-spinner fa-spin me-2"></i>
                        Loading available units…
                      </div>
                    )}
                    {!pickerLoading && pickerError && (
                      <div className="alert alert-warning small mb-0">
                        {pickerError}
                      </div>
                    )}
                    {!pickerLoading && !pickerError && pickerUnits.length > 0 && (
                      <div className="table-responsive" style={{ maxHeight: 420 }}>
                        <table className="table table-sm table-hover align-middle">
                          <thead className="sticky-top bg-light">
                            <tr>
                              <th>SKU</th>
                              <th>Barcode</th>
                              <th>Name / Note</th>
                              <th>Branch</th>
                              <th>Cost</th>
                              <th style={{ width: 100 }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {pickerUnits.map((u) => (
                              <tr key={u.documentId}>
                                <td className="font-monospace small">{u.sku || "—"}</td>
                                <td className="font-monospace small">{u.barcode || "—"}</td>
                                <td className="small">{u.name || "—"}</td>
                                <td className="small">{u.branch?.name || "—"}</td>
                                <td className="small">
                                  {u.cost_price != null ? Number(u.cost_price).toFixed(2) : "—"}
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-primary"
                                    onClick={() => handleAttachStockItem(u)}
                                    disabled={attaching}
                                  >
                                    {attaching ? "…" : "Attach"}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={closePicker}
                      disabled={attaching}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </Layout>
    </ProtectedRoute>
  );
}
