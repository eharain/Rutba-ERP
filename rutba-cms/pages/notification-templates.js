import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { NotificationTemplatesEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";

export default function NotificationTemplatesPage() {
  const { jwt } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!jwt) return;
    setLoading(true);
    try {
      const res = await NotificationTemplatesEndpoints.list({
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
        <ListPageLayout
          title="Notification Templates"
          subtitle="Manage notification templates used by order and delivery lifecycle events."
          headerActions={
            <>
              <AddButton label="New Template" href="/new/notification-template" />
              <button className="btn btn-sm btn-outline-secondary" onClick={load}>
                <i className="fas fa-rotate me-1" />Refresh
              </button>
            </>
          }
          loading={loading}
          emptyState={<div>No templates found.</div>}
        >
          {templates.length > 0 && (
          <div className="table-responsive">
            <table className="table table-hover list-table">
              <thead>
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
                    <td><span className="list-status" style={{ background: '#0d6efd', color: '#fff' }}>{t.trigger_event || "—"}</span></td>
                    <td>{t.channel || "—"}</td>
                    <td>{t.send_to || "—"}</td>
                    <td>{t.scope || "—"}</td>
                    <td>{t.branch?.name || "—"}</td>
                    <td>
                      <span className="list-status" style={{ background: t.is_active ? '#198754' : '#6c757d', color: '#fff' }}>
                        {t.is_active ? "Yes" : "No"}
                      </span>
                    </td>
                    <td>
                      <div className="list-actions">
                        <Link href={`/${t.documentId || t.id}/notification-template`} className="btn btn-outline-primary">
                          <i className="fas fa-edit"></i>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </ListPageLayout>
      </Layout>
    </ProtectedRoute>
  );
}

export async function getServerSideProps() {
  return { props: {} };
}

