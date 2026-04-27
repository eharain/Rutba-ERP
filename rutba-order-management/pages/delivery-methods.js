import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import { useToast } from "../components/Toast";

export default function DeliveryMethodsPage() {
  const { jwt } = useAuth();
  const { toast, ToastContainer } = useToast();
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);

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
      toast("Failed to load delivery methods.", "danger");
    } finally {
      setLoading(false);
    }
  }, [jwt, toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ProtectedRoute>
      <Layout>
        <ToastContainer />
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h2 className="mb-0">Delivery Methods</h2>
          <div className="d-flex gap-2">
            <button className="btn btn-sm btn-outline-secondary" onClick={load}>
              <i className="fas fa-rotate me-1" />Refresh
            </button>
            <Link href="/new/delivery-method" className="btn btn-sm btn-primary">
              <i className="fas fa-plus me-1" />New Delivery Method
            </Link>
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
                  <th>Description</th>
                  <th>Provider</th>
                  <th>Cost Model</th>
                  <th>Days</th>
                  <th>Zones</th>
                  <th>Product Groups</th>
                  <th>Priority</th>
                  <th>Active</th>
                  <th style={{ minWidth: 110 }}>Edit</th>
                </tr>
              </thead>
              <tbody>
                {methods.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name || "—"}</td>
                    <td>{m.description || "—"}</td>
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
                    <td>
                      <Link href={`/${m.documentId}/delivery-method`} className="btn btn-sm btn-outline-primary">
                        Edit
                      </Link>
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
