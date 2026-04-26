import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import { useToast } from "../components/Toast";

const PROVIDERS = ["own_rider", "easypost", "custom"];

export default function DeliveryMethodsPage() {
  const { jwt } = useAuth();
  const { toast, ToastContainer } = useToast();
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newMethod, setNewMethod] = useState({
    name: "",
    service_provider: "own_rider",
    base_cost: "0",
    per_kg_rate: "0",
    free_shipping_threshold: "",
    estimated_days_min: "1",
    estimated_days_max: "3",
    priority: "0",
    is_active: true,
  });

  const load = useCallback(async () => {
    if (!jwt) return;
    setLoading(true);
    try {
      const res = await authApi.get("/delivery-methods", {
        sort: ["priority:asc", "createdAt:desc"],
        populate: ["delivery_zones", "product_groups"],
        pagination: { pageSize: 200 },
      });
      setMethods(res.data || []);
    } catch (err) {
      console.error("Failed to load delivery methods", err);
    } finally {
      setLoading(false);
    }
  }, [jwt]);

  useEffect(() => {
    load();
  }, [load]);

  const createMethod = async (e) => {
    e.preventDefault();
    if (!newMethod.name.trim()) {
      toast("Delivery method name is required.", "warning");
      return;
    }

    setCreating(true);
    try {
      await authApi.post("/delivery-methods", {
        data: {
          name: newMethod.name.trim(),
          service_provider: newMethod.service_provider,
          base_cost: Number(newMethod.base_cost || 0),
          per_kg_rate: Number(newMethod.per_kg_rate || 0),
          free_shipping_threshold: newMethod.free_shipping_threshold === "" ? null : Number(newMethod.free_shipping_threshold),
          estimated_days_min: Number(newMethod.estimated_days_min || 1),
          estimated_days_max: Number(newMethod.estimated_days_max || 3),
          priority: Number(newMethod.priority || 0),
          is_active: newMethod.is_active,
        },
      });
      toast("Delivery method created.", "success");
      setNewMethod({
        name: "",
        service_provider: "own_rider",
        base_cost: "0",
        per_kg_rate: "0",
        free_shipping_threshold: "",
        estimated_days_min: "1",
        estimated_days_max: "3",
        priority: "0",
        is_active: true,
      });
      await load();
    } catch (err) {
      console.error("Failed to create delivery method", err);
      toast("Failed to create delivery method.", "danger");
    } finally {
      setCreating(false);
    }
  };

  return (
    <ProtectedRoute>
      <Layout>
        <ToastContainer />
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h2 className="mb-0">Delivery Methods</h2>
          <button className="btn btn-sm btn-outline-secondary" onClick={load}>
            <i className="fas fa-rotate me-1" />Refresh
          </button>
        </div>

        <div className="card mb-4">
          <div className="card-header bg-light fw-semibold">
            <i className="fas fa-plus-circle me-2"></i>
            Add Delivery Method
          </div>
          <div className="card-body">
            <form onSubmit={createMethod}>
              <div className="row g-2 align-items-end">
                <div className="col-md-3">
                  <label className="form-label">Name</label>
                  <input
                    className="form-control"
                    value={newMethod.name}
                    onChange={(e) => setNewMethod((p) => ({ ...p, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="col-md-2">
                  <label className="form-label">Provider</label>
                  <select
                    className="form-select"
                    value={newMethod.service_provider}
                    onChange={(e) => setNewMethod((p) => ({ ...p, service_provider: e.target.value }))}
                  >
                    {PROVIDERS.map((provider) => (
                      <option key={provider} value={provider}>{provider}</option>
                    ))}
                  </select>
                </div>
                <div className="col-md-1">
                  <label className="form-label">Base</label>
                  <input
                    className="form-control"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newMethod.base_cost}
                    onChange={(e) => setNewMethod((p) => ({ ...p, base_cost: e.target.value }))}
                  />
                </div>
                <div className="col-md-1">
                  <label className="form-label">/Kg</label>
                  <input
                    className="form-control"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newMethod.per_kg_rate}
                    onChange={(e) => setNewMethod((p) => ({ ...p, per_kg_rate: e.target.value }))}
                  />
                </div>
                <div className="col-md-2">
                  <label className="form-label">Free @</label>
                  <input
                    className="form-control"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newMethod.free_shipping_threshold}
                    onChange={(e) => setNewMethod((p) => ({ ...p, free_shipping_threshold: e.target.value }))}
                  />
                </div>
                <div className="col-md-1">
                  <label className="form-label">Min Days</label>
                  <input
                    className="form-control"
                    type="number"
                    min="0"
                    value={newMethod.estimated_days_min}
                    onChange={(e) => setNewMethod((p) => ({ ...p, estimated_days_min: e.target.value }))}
                  />
                </div>
                <div className="col-md-1">
                  <label className="form-label">Max Days</label>
                  <input
                    className="form-control"
                    type="number"
                    min="0"
                    value={newMethod.estimated_days_max}
                    onChange={(e) => setNewMethod((p) => ({ ...p, estimated_days_max: e.target.value }))}
                  />
                </div>
                <div className="col-md-1">
                  <label className="form-label">Priority</label>
                  <input
                    className="form-control"
                    type="number"
                    value={newMethod.priority}
                    onChange={(e) => setNewMethod((p) => ({ ...p, priority: e.target.value }))}
                  />
                </div>
                <div className="col-md-1 d-flex align-items-center justify-content-center">
                  <div className="form-check mt-4">
                    <input
                      id="method-active"
                      className="form-check-input"
                      type="checkbox"
                      checked={newMethod.is_active}
                      onChange={(e) => setNewMethod((p) => ({ ...p, is_active: e.target.checked }))}
                    />
                    <label className="form-check-label small" htmlFor="method-active">Active</label>
                  </div>
                </div>
                <div className="col-md-1 d-grid">
                  <button className="btn btn-primary" type="submit" disabled={creating}>
                    {creating ? "..." : "Add"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        <p className="text-muted small mb-3">
          Configure pricing and applicability of delivery methods across product groups and zones.
        </p>

        {loading && <p>Loading delivery methods...</p>}

        {!loading && methods.length === 0 && (
          <div className="alert alert-info">No delivery methods found.</div>
        )}

        {!loading && methods.length > 0 && (
          <div className="table-responsive">
            <table className="table table-striped table-hover">
              <thead className="table-dark">
                <tr>
                  <th>Name</th>
                  <th>Provider</th>
                  <th>Cost Model</th>
                  <th>Days</th>
                  <th>Zones</th>
                  <th>Product Groups</th>
                  <th>Priority</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {methods.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td><span className="badge bg-info text-dark">{m.service_provider || "—"}</span></td>
                    <td className="small">
                      Base: {Number(m.base_cost || 0).toFixed(2)}<br />
                      /Kg: {Number(m.per_kg_rate || 0).toFixed(2)}<br />
                      Free@ {Number(m.free_shipping_threshold || 0).toFixed(2)}
                    </td>
                    <td>{m.estimated_days_min || 0} - {m.estimated_days_max || 0}</td>
                    <td>{(m.delivery_zones || []).map((z) => z.name).join(", ") || "—"}</td>
                    <td>{(m.product_groups || []).length}</td>
                    <td>{m.priority ?? 0}</td>
                    <td>
                      <span className={`badge ${m.is_active ? "bg-success" : "bg-secondary"}`}>
                        {m.is_active ? "Yes" : "No"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Layout>
    </ProtectedRoute>
  );
}
