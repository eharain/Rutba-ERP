import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function DeliveryZonesPage() {
  const { jwt } = useAuth();
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <ProtectedRoute>
      <Layout>
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h2 className="mb-0">Delivery Zones</h2>
          <button className="btn btn-sm btn-outline-secondary" onClick={load}>
            <i className="fas fa-rotate me-1" />Refresh
          </button>
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
