import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import { useToast } from "../components/Toast";

const STATUS_OPTIONS = ["available", "on_delivery", "off_duty", "suspended"];

export default function RidersPage() {
  const { jwt } = useAuth();
  const { toast, ToastContainer } = useToast();
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusDraft, setStatusDraft] = useState({});
  const [saving, setSaving] = useState({});

  const load = useCallback(async () => {
    if (!jwt) return;
    setLoading(true);
    try {
      const res = await authApi.get("/riders", {
        sort: ["createdAt:desc"],
        populate: ["assigned_zones", "user"],
        pagination: { pageSize: 200 },
      });
      setRiders(res.data || []);
    } catch (err) {
      console.error("Failed to load riders", err);
      toast("Failed to load riders.", "danger");
    } finally {
      setLoading(false);
    }
  }, [jwt, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const saveStatus = async (rider) => {
    const status = statusDraft[rider.documentId];
    if (!status) return;
    setSaving((p) => ({ ...p, [rider.documentId]: true }));
    try {
      await authApi.put(`/riders/${rider.documentId}`, { data: { status } });
      toast("Rider status updated.", "success");
      await load();
    } catch (err) {
      console.error("Failed to update rider status", err);
      toast("Failed to update rider status.", "danger");
    } finally {
      setSaving((p) => ({ ...p, [rider.documentId]: false }));
    }
  };

  return (
    <ProtectedRoute>
      <Layout>
        <ToastContainer />
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h2 className="mb-0">Riders</h2>
          <button className="btn btn-sm btn-outline-secondary" onClick={load}>
            <i className="fas fa-rotate me-1" />Refresh
          </button>
        </div>

        {loading && <p>Loading riders...</p>}

        {!loading && riders.length === 0 && (
          <div className="alert alert-info">No riders found.</div>
        )}

        {!loading && riders.length > 0 && (
          <div className="table-responsive">
            <table className="table table-striped table-hover">
              <thead className="table-dark">
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Vehicle</th>
                  <th>Status</th>
                  <th>Assigned Zones</th>
                  <th>Completed</th>
                  <th>Rating</th>
                  <th style={{ minWidth: 220 }}>Update</th>
                </tr>
              </thead>
              <tbody>
                {riders.map((rider) => (
                  <tr key={rider.id}>
                    <td>{rider.full_name || "—"}</td>
                    <td>{rider.phone || "—"}</td>
                    <td>{rider.vehicle_type || "—"}</td>
                    <td>
                      <span className={`badge ${rider.status === "available" ? "bg-success" : rider.status === "on_delivery" ? "bg-primary" : rider.status === "off_duty" ? "bg-warning text-dark" : "bg-danger"}`}>
                        {rider.status || "—"}
                      </span>
                    </td>
                    <td>
                      {(rider.assigned_zones || []).map((z) => z.name).join(", ") || "—"}
                    </td>
                    <td>{rider.total_deliveries_completed ?? 0}</td>
                    <td>{rider.rating ?? "—"}</td>
                    <td>
                      <div className="d-flex gap-1">
                        <select
                          className="form-select form-select-sm"
                          value={statusDraft[rider.documentId] || ""}
                          onChange={(e) => setStatusDraft((p) => ({ ...p, [rider.documentId]: e.target.value }))}
                        >
                          <option value="">Select status...</option>
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => saveStatus(rider)}
                          disabled={!statusDraft[rider.documentId] || saving[rider.documentId]}
                        >
                          {saving[rider.documentId] ? "..." : "Save"}
                        </button>
                      </div>
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
