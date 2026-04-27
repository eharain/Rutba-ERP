import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";
import { useToast } from "../../components/Toast";

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

  const isNew = documentId === "new";
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
    { productDocumentId: "", productName: "", quantity: "1", price: "0" },
  ]);
  const [paymentStatus, setPaymentStatus] = useState("COD");
  const [trackingCode, setTrackingCode] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [riderNotes, setRiderNotes] = useState("");
  const [orderStatus, setOrderStatus] = useState("PENDING_PAYMENT");
  const [riderDocumentId, setRiderDocumentId] = useState("");

  useEffect(() => {
    if (!jwt || !documentId) return;

    const load = async () => {
      setLoading(true);
      try {
        const [riderRes, productRes] = await Promise.all([
          authApi.get("/riders", {
            sort: ["full_name:asc"],
            fields: ["documentId", "full_name", "status"],
            pagination: { pageSize: 200 },
          }),
          authApi.get("/products", {
            sort: ["name:asc"],
            fields: ["documentId", "name"],
            pagination: { pageSize: 500 },
          }),
        ]);

        setRiders(riderRes.data || []);
        setProductsCatalog(productRes.data || []);

        if (isNew) {
          setLoading(false);
          return;
        }

        const res = await authApi.get(`/sale-orders/${documentId}`, {
          populate: ["customer_contact", "products", "assigned_rider"],
        });
        const o = res.data || res;
        const loadedItems = (o.products?.items || []).map((item) => ({
          productDocumentId: item.product?.documentId || item.product || "",
          productName: item.product_name || "",
          quantity: String(item.quantity ?? 1),
          price: String(item.price ?? 0),
        }));

        setOrderId(o.order_id || "");
        setCustomerName(o.customer_contact?.name || "");
        setPhoneNumber(o.customer_contact?.phone_number || "");
        setEmail(o.customer_contact?.email || "");
        setAddress(o.customer_contact?.address || "");
        setState(o.customer_contact?.state || "");
        setCity(o.customer_contact?.city || "");
        setZipCode(o.customer_contact?.zip_code || "");
        setCountry(o.customer_contact?.country || "PK");
        setOrderItems(loadedItems.length > 0 ? loadedItems : [{ productDocumentId: "", productName: "", quantity: "1", price: "0" }]);
        setPaymentStatus(o.payment_status || "COD");
        setTrackingCode(o.tracking_code || "");
        setTrackingUrl(o.tracking_url || "");
        setRiderNotes(o.rider_notes || "");
        setOrderStatus(o.order_status || "PENDING_PAYMENT");
        setRiderDocumentId(o.assigned_rider?.documentId || "");
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
        return {
          product: item.productDocumentId,
          product_name: item.productName.trim(),
          quantity: qty,
          price: unitPrice,
          total: qty * unitPrice,
        };
      });

      const subtotal = formattedItems.reduce((sum, item) => sum + Number(item.total || 0), 0);

      const payload = {
        data: {
          customer_contact: {
            name: customerName.trim(),
            phone_number: phoneNumber.trim(),
            email: email.trim(),
            address: address.trim(),
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
    setOrderItems((prev) => [...prev, { productDocumentId: "", productName: "", quantity: "1", price: "0" }]);
  };

  const removeProductRow = (index) => {
    setOrderItems((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

      if (isNew) {
        payload.data.order_id = `ADM-${Date.now()}`;
        const res = await authApi.post("/sale-orders", payload);
        const created = res.data || res;
        toast("Order created.", "success");
        router.push(`/${created.documentId}/sale-order`);
      } else {
        await authApi.put(`/sale-orders/${documentId}`, payload);
        toast("Order updated.", "success");
      }
    } catch (err) {
      console.error("Failed to save order", err);
      toast("Failed to save order.", "danger");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!orderStatus) return;
    setProcessing(true);
    try {
      await authApi.post(`/sale-orders/${documentId}/update-status`, {
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
      await authApi.post(`/sale-orders/${documentId}/assign-rider`, { rider_document_id: riderDocumentId });
      toast("Rider assigned.", "success");
    } catch (err) {
      console.error("Failed to assign rider", err);
      toast("Failed to assign rider.", "danger");
    } finally {
      setProcessing(false);
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
                      Products are associated at order time. Stock items can be attached later during fulfillment.
                    </div>

                    <div className="table-responsive">
                      <table className="table table-sm align-middle">
                        <thead>
                          <tr>
                            <th style={{ minWidth: 240 }}>Product</th>
                            <th style={{ minWidth: 220 }}>Product Name</th>
                            <th style={{ width: 100 }}>Qty</th>
                            <th style={{ width: 140 }}>Unit Price</th>
                            <th style={{ width: 140 }}>Total</th>
                            <th style={{ width: 90 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {orderItems.map((item, index) => {
                            const qty = Number(item.quantity || 0);
                            const unitPrice = Number(item.price || 0);
                            const lineTotal = qty * unitPrice;

                            return (
                              <tr key={index}>
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
          </>
        )}
      </Layout>
    </ProtectedRoute>
  );
}
