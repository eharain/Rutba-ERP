import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

export default function NotificationTemplatesPage() {
  const { jwt } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!jwt) return;
    setLoading(true);
    try {
      const res = await authApi.get("/notification-templates", {
        sort: ["createdAt:desc"],
        populate: ["branch"],
        pagination: { pageSize: 200 },
      });
      setTemplates(res.data || []);
    } catch (err) {
      console.error("Failed to load notification templates", err);
    } finally {
      setLoading(false);
    }
  }, [jwt]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ProtectedRoute>
      <Layout>
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h2 className="mb-0">Notification Templates</h2>
          <div className="d-flex gap-2">
            <Link className="btn btn-sm btn-primary" href="/new/notification-template">
              <i className="fas fa-plus me-1" />New Template
            </Link>
            <button className="btn btn-sm btn-outline-secondary" onClick={load}>
              <i className="fas fa-rotate me-1" />Refresh
            </button>
          </div>
        </div>

        <p className="text-muted small mb-3">
          Manage notification templates used by order and delivery lifecycle events.
        </p>

        {loading && <p>Loading templates...</p>}

        {!loading && templates.length === 0 && (
          <div className="alert alert-info">No templates found.</div>
        )}

        {!loading && templates.length > 0 && (
          <div className="table-responsive">
            <table className="table table-striped table-hover">
              <thead className="table-dark">
                <tr>
                  <th>Name</th>
                  <th>Trigger Event</th>
                  <th>Channel</th>
                  <th>Send To</th>
                  <th>Scope</th>
                  <th>Branch</th>
                  <th>Active</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link href={`/${t.documentId || t.id}/notification-template`} className="text-decoration-none fw-semibold">
                        {t.name}
                      </Link>
                    </td>
                    <td><span className="badge bg-primary">{t.trigger_event || "—"}</span></td>
                    <td>{t.channel || "—"}</td>
                    <td>{t.send_to || "—"}</td>
                    <td>{t.scope || "—"}</td>
                    <td>{t.branch?.name || "—"}</td>
                    <td>
                      <span className={`badge ${t.is_active ? "bg-success" : "bg-secondary"}`}>
                        {t.is_active ? "Yes" : "No"}
                      </span>
                    </td>
                    <td>
                      <Link href={`/${t.documentId || t.id}/notification-template`} className="btn btn-sm btn-outline-primary">
                        <i className="fas fa-edit"></i>
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

export async function getServerSideProps() {
  return { props: {} };
}
