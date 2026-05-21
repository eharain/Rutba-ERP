import { useEffect, useState } from "react";
import {
  DeliveryMethodsEndpoints,
  SaleOrdersEndpoints,
} from "@rutba/api-provider/endpoints/index.js";
import CustomerCard from "../CustomerCard";
import ItemsTable from "../ItemsTable";
import { lineFromItem, serverMessage } from "../util";

// Gate: an order can't advance until a delivery method is attached. The
// method is what tells the rest of the flow whether payment is upfront
// (verify-before-prepare) or deferred / COD (ship first, reconcile later),
// and it's also what supplies the delivery cost that rolls into the order
// total. Lives between Draft (customer + items captured) and Payment.
//
// For new orders the storefront attaches a method at checkout. For
// admin-created orders, or for legacy orders that lost their method, this
// stage is where staff picks one and the total gets recomputed.
export default function DeliveryMethodStage({ order, toast, onRefresh }) {
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

  const subtotal = Number(order?.subtotal || 0);

  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await DeliveryMethodsEndpoints.list({
          filters: { is_active: { $eq: true } },
          sort: ["priority:asc", "name:asc"],
          fields: [
            "documentId",
            "name",
            "description",
            "base_cost",
            "supports_cod",
            "service_provider",
            "estimated_days_min",
            "estimated_days_max",
          ],
          pagination: { pageSize: 200 },
        });
        if (cancelled) return;
        setMethods(res?.data || []);
      } catch (err) {
        console.error("Failed to load delivery methods", err);
        toast?.("Failed to load delivery methods.", "danger");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const selectedMethod = methods.find((m) => m.documentId === selected);

  const handleAttach = async () => {
    if (!selectedMethod) {
      toast?.("Pick a delivery method first.", "warning");
      return;
    }
    setProcessing(true);
    try {
      const deliveryCost = Number(selectedMethod.base_cost || 0);
      // Recompute total from authoritative pieces: subtotal (already on the
      // order, validated at create time) + the new delivery cost. We don't
      // re-add savings/original_subtotal — those were already baked into the
      // subtotal during pricing validation.
      const total = subtotal + deliveryCost;

      await SaleOrdersEndpoints.update(order.documentId, {
        data: {
          delivery_method: { documentId: selectedMethod.documentId },
          delivery_cost: deliveryCost,
          total,
        },
      });
      toast?.("Delivery method attached.", "success");
      await onRefresh?.();
    } catch (err) {
      console.error("Failed to attach delivery method", err);
      toast?.(`Failed to attach delivery method: ${serverMessage(err)}`, "danger");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <div className="alert alert-info small">
        <i className="fas fa-truck me-2" />
        <strong>Choose a delivery method.</strong> The selection determines whether
        this order needs upfront payment (verify-before-prepare) or accepts
        cash-on-delivery (ship first, reconcile later). The delivery cost rolls
        into the order total.
      </div>

      <CustomerCard value={customer} readOnly orderId={order?.order_id} />
      <ItemsTable items={items} mode="view" />

      <div className="card">
        <div className="card-header bg-light fw-semibold">
          <i className="fas fa-route me-2" /> Delivery Methods
        </div>
        <div className="card-body">
          {loading && (
            <div className="text-muted small">
              <i className="fas fa-spinner fa-spin me-2" />
              Loading active methods…
            </div>
          )}
          {!loading && methods.length === 0 && (
            <div className="alert alert-warning small">
              No active delivery methods configured. Add one under{" "}
              <a href="/delivery-methods">Delivery Methods</a> first.
            </div>
          )}
          {!loading && methods.length > 0 && (
            <div className="table-responsive">
              <table className="table table-hover align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 40 }} />
                    <th>Method</th>
                    <th>Provider</th>
                    <th>ETA</th>
                    <th style={{ width: 110 }}>Base Cost</th>
                    <th style={{ width: 150 }}>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {methods.map((m) => {
                    const isSel = selected === m.documentId;
                    return (
                      <tr
                        key={m.documentId}
                        onClick={() => setSelected(m.documentId)}
                        style={{ cursor: "pointer" }}
                        className={isSel ? "table-primary" : ""}
                      >
                        <td>
                          <input
                            type="radio"
                            checked={isSel}
                            onChange={() => setSelected(m.documentId)}
                          />
                        </td>
                        <td>
                          <div className="fw-semibold">{m.name}</div>
                          {m.description && (
                            <div className="text-muted small">{m.description}</div>
                          )}
                        </td>
                        <td className="small">{m.service_provider}</td>
                        <td className="small text-muted">
                          {m.estimated_days_min ?? "?"}–{m.estimated_days_max ?? "?"} days
                        </td>
                        <td>{Number(m.base_cost || 0).toFixed(2)}</td>
                        <td>
                          {m.supports_cod ? (
                            <span className="badge bg-info text-dark">
                              <i className="fas fa-money-bill-wave me-1" />
                              COD allowed
                            </span>
                          ) : (
                            <span className="badge bg-light text-dark border">
                              Prepaid only
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {selectedMethod && (
            <div className="alert alert-light border small mt-3">
              <div className="row g-2">
                <div className="col-md-4">
                  <span className="text-muted">Subtotal:</span>{" "}
                  <strong>{subtotal.toFixed(2)}</strong>
                </div>
                <div className="col-md-4">
                  <span className="text-muted">Delivery:</span>{" "}
                  <strong>{Number(selectedMethod.base_cost || 0).toFixed(2)}</strong>
                </div>
                <div className="col-md-4">
                  <span className="text-muted">New total:</span>{" "}
                  <strong>{(subtotal + Number(selectedMethod.base_cost || 0)).toFixed(2)}</strong>
                </div>
              </div>
            </div>
          )}

          <div className="d-flex justify-content-end mt-3">
            <button
              className="btn btn-primary"
              onClick={handleAttach}
              disabled={!selected || processing}
            >
              <i className="fas fa-check me-1" />
              {processing ? "Attaching…" : "Attach & Continue"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
