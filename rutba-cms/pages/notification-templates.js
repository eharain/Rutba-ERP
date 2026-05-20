import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { NotificationTemplatesEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";
import ExcelIO from "../components/ExcelIO";

const tryParseJSON = (val) => {
  if (val === null || val === undefined || val === "") return undefined;
  if (typeof val !== "string") return val;
  try { return JSON.parse(val); } catch { return val; }
};

// Server-side coerceForSchema (cms-bulk controller) converts string cells back
// to the schema's declared type on import — booleans accept true/1/yes, numbers
// accept any numeric string, enums pass through as strings. Booleans get a
// format here purely for human readability on export. JSON columns
// (channels / conditions / available_variables) round-trip via JSON.stringify
// on export and tryParseJSON on import. Branch is a manyToOne relation and is
// intentionally omitted — the current ExcelIO format doesn't round-trip
// relations.
const NOTIFICATION_TEMPLATE_EXCEL_COLUMNS = [
  { key: "name", isLabel: true, width: 32 },
  { key: "event_name", width: 22 },
  { key: "trigger_event", width: 22 },
  { key: "channel", width: 10 },
  { key: "channels", width: 30, format: (r) => r.channels ? JSON.stringify(r.channels) : "", parse: tryParseJSON },
  { key: "category", width: 20 },
  { key: "priority", width: 10 },
  { key: "audience", width: 14 },
  { key: "send_to", width: 12 },
  { key: "scope", width: 12 },
  { key: "is_critical", width: 10, format: (r) => (r.is_critical ? "true" : "false") },
  { key: "send_email", width: 10, format: (r) => (r.send_email ? "true" : "false") },
  { key: "delay_minutes", width: 12 },
  { key: "dedup_window_minutes", width: 16 },
  { key: "subject", width: 50 },
  { key: "body_template", width: 90 },
  { key: "conditions", width: 30, format: (r) => r.conditions ? JSON.stringify(r.conditions) : "", parse: tryParseJSON },
  { key: "available_variables", width: 30, format: (r) => r.available_variables ? JSON.stringify(r.available_variables) : "", parse: tryParseJSON },
  { key: "is_active", width: 10, format: (r) => (r.is_active ? "true" : "false") },
  { key: "is_enabled", width: 10, format: (r) => (r.is_enabled ? "true" : "false") },
];

export default function NotificationTemplatesPage() {
  const { jwt } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [total, setTotal] = useState(0);
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
      setTotal(res.meta?.pagination?.total ?? (res.data?.length || 0));
    } catch (err) {
      console.error("Failed to load notification templates", err);
    } finally {
      setLoading(false);
    }
  }, [jwt]);

  useEffect(() => {
    load();
  }, [load]);

  const fetchAllTemplates = useCallback(async () => {
    const out = [];
    let p = 1;
    const PAGE = 100;
    while (true) {
      const res = await NotificationTemplatesEndpoints.list({
        sort: ["createdAt:desc"],
        populate: ["branch"],
        page: p,
        pageSize: PAGE,
      });
      const arr = res.data || [];
      out.push(...arr);
      if (arr.length < PAGE) break;
      p += 1;
      if (p > 500) break;
    }
    return out;
  }, []);

  return (
    <ProtectedRoute>
      <Layout>
        <ListPageLayout
          title="Notification Templates"
          subtitle="Manage notification templates used by order and delivery lifecycle events."
          headerActions={
            <>
              <ExcelIO
                entityLabel="Notification Templates"
                contentType="api::notification-template.notification-template"
                columns={NOTIFICATION_TEMPLATE_EXCEL_COLUMNS}
                rows={templates}
                total={total}
                fetchAll={fetchAllTemplates}
                onAfterImport={load}
              />
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
