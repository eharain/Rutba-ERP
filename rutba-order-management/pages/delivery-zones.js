import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import { useToast } from "../components/Toast";

const ZONE_TYPES = ["domestic_own_rider", "domestic_courier", "international"];

export default function DeliveryZonesPage() {
  const { jwt } = useAuth();
  const { toast, ToastContainer } = useToast();
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newZone, setNewZone] = useState({
    name: "",
    zone_type: "domestic_own_rider",
    cities: "",
    countries: "",
    postal_code_patterns: "",
    is_active: true,
  });

  const load = useCallback(async () => {
    if (!jwt) return;
    setLoading(true);
    try {
      const res = await authApi.get("/delivery-zones", {
        sort: ["createdAt:desc"],
        pagination: { pageSize: 200 },
      });
      setZones(res.data || []);
    } catch (err) {
      console.error("Failed to load delivery zones", err);
    } finally {
      setLoading(false);
    }
  }, [jwt]);

  useEffect(() => {
    load();
  }, [load]);

  const toList = (val) => {
    if (!Array.isArray(val)) return "—";
    return val.join(", ") || "—";
  };

  const parseCsv = (value) => value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  const createZone = async (e) => {
    e.preventDefault();
    if (!newZone.name.trim()) {
      toast("Zone name is required.", "warning");
      return;
    }

    setCreating(true);
    try {
      await authApi.post("/delivery-zones", {
        data: {
          name: newZone.name.trim(),
          zone_type: newZone.zone_type,
          cities: parseCsv(newZone.cities),
          countries: parseCsv(newZone.countries),
          postal_code_patterns: newZone.postal_code_patterns.trim() || null,
          is_active: newZone.is_active,
        },
      });
      toast("Delivery zone created.", "success");
      setNewZone({
        name: "",
        zone_type: "domestic_own_rider",
        cities: "",
        countries: "",
        postal_code_patterns: "",
        is_active: true,
      });
      await load();
    } catch (err) {
      console.error("Failed to create delivery zone", err);
      toast("Failed to create delivery zone.", "danger");
    } finally {
      setCreating(false);
    }
  };

  return (
    <ProtectedRoute>
      <Layout>
        <ToastContainer />
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h2 className="mb-0">Delivery Zones</h2>
          <button className="btn btn-sm btn-outline-secondary" onClick={load}>
            <i className="fas fa-rotate me-1" />Refresh
          </button>
        </div>

        <div className="card mb-4">
          <div className="card-header bg-light fw-semibold">
            <i className="fas fa-plus-circle me-2"></i>
            Add Delivery Zone
          </div>
          <div className="card-body">
            <form onSubmit={createZone}>
              <div className="row g-2">
                <div className="col-md-4">
                  <label className="form-label">Name</label>
                  <input
                    className="form-control"
                    value={newZone.name}
                    onChange={(e) => setNewZone((p) => ({ ...p, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="col-md-3">
                  <label className="form-label">Type</label>
                  <select
                    className="form-select"
                    value={newZone.zone_type}
                    onChange={(e) => setNewZone((p) => ({ ...p, zone_type: e.target.value }))}
                  >
                    {ZONE_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="col-md-5">
                  <label className="form-label">Cities (comma-separated)</label>
                  <input
                    className="form-control"
                    value={newZone.cities}
                    onChange={(e) => setNewZone((p) => ({ ...p, cities: e.target.value }))}
                    placeholder="Karachi, Lahore"
                  />
                </div>
                <div className="col-md-5">
                  <label className="form-label">Countries (comma-separated)</label>
                  <input
                    className="form-control"
                    value={newZone.countries}
                    onChange={(e) => setNewZone((p) => ({ ...p, countries: e.target.value }))}
                    placeholder="PK, AE"
                  />
                </div>
                <div className="col-md-5">
                  <label className="form-label">Postal Patterns</label>
                  <input
                    className="form-control"
                    value={newZone.postal_code_patterns}
                    onChange={(e) => setNewZone((p) => ({ ...p, postal_code_patterns: e.target.value }))}
                    placeholder="44*, 75*"
                  />
                </div>
                <div className="col-md-1 d-flex align-items-end">
                  <div className="form-check mb-2">
                    <input
                      id="zone-active"
                      className="form-check-input"
                      type="checkbox"
                      checked={newZone.is_active}
                      onChange={(e) => setNewZone((p) => ({ ...p, is_active: e.target.checked }))}
                    />
                    <label className="form-check-label small" htmlFor="zone-active">Active</label>
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

        {loading && <p>Loading zones...</p>}

        {!loading && zones.length === 0 && (
          <div className="alert alert-info">No delivery zones found.</div>
        )}

        {!loading && zones.length > 0 && (
          <div className="table-responsive">
            <table className="table table-striped table-hover">
              <thead className="table-dark">
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Cities</th>
                  <th>Countries</th>
                  <th>Postal Patterns</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => (
                  <tr key={z.id}>
                    <td>{z.name}</td>
                    <td><span className="badge bg-primary">{z.zone_type || "—"}</span></td>
                    <td className="small">{toList(z.cities)}</td>
                    <td className="small">{toList(z.countries)}</td>
                    <td className="small">{z.postal_code_patterns || "—"}</td>
                    <td>
                      <span className={`badge ${z.is_active ? "bg-success" : "bg-secondary"}`}>
                        {z.is_active ? "Yes" : "No"}
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
