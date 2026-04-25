import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";
import { useToast } from "../../components/Toast";

const TRIGGER_EVENTS = [
  "order_placed",
  "payment_confirmed",
  "offer_accepted",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "refund_initiated",
];

const CHANNELS = ["email", "sms", "both"];
const SEND_TO_OPTIONS = ["customer", "rider", "staff", "admin"];
const SCOPE_OPTIONS = ["global", "per_branch"];

export default function NotificationTemplateDetailPage() {
  const router = useRouter();
  const { documentId } = router.query;
  const { jwt } = useAuth();
  const { toast, ToastContainer } = useToast();

  const isNew = documentId === "new";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [triggerEvent, setTriggerEvent] = useState("order_placed");
  const [channel, setChannel] = useState("email");
  const [subject, setSubject] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [sendTo, setSendTo] = useState("customer");
  const [scope, setScope] = useState("global");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!jwt || !documentId || isNew) {
      setLoading(false);
      return;
    }

    authApi
      .get(`/notification-templates/${documentId}`, { populate: ["branch"] })
      .then((res) => {
        const t = res.data || res;
        setName(t.name || "");
        setTriggerEvent(t.trigger_event || "order_placed");
        setChannel(t.channel || "email");
        setSubject(t.subject || "");
        setBodyTemplate(t.body_template || "");
        setSendTo(t.send_to || "customer");
        setScope(t.scope || "global");
        setIsActive(t.is_active !== false);
      })
      .catch((err) => {
        console.error("Failed to load notification template", err);
        toast("Failed to load template.", "danger");
      })
      .finally(() => setLoading(false));
  }, [jwt, documentId, isNew, toast]);

  const buildPayload = () => ({
    data: {
      name,
      trigger_event: triggerEvent,
      channel,
      subject: subject || null,
      body_template: bodyTemplate || null,
      send_to: sendTo,
      scope,
      is_active: isActive,
    },
  });

  const handleSave = async () => {
    if (!name.trim()) {
      toast("Name is required.", "warning");
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const res = await authApi.post("/notification-templates", buildPayload());
        const created = res.data || res;
        toast("Template created.", "success");
        router.push(`/${created.documentId}/notification-template`);
      } else {
        await authApi.put(`/notification-templates/${documentId}`, buildPayload());
        toast("Template updated.", "success");
      }
    } catch (err) {
      console.error("Failed to save notification template", err);
      toast("Failed to save template.", "danger");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isNew) return;
    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      await authApi.del(`/notification-templates/${documentId}`);
      toast("Template deleted.", "success");
      router.push("/notification-templates");
    } catch (err) {
      console.error("Failed to delete notification template", err);
      toast("Failed to delete template.", "danger");
    }
  };

  return (
    <ProtectedRoute>
      <Layout>
        <ToastContainer />

        <div className="d-flex align-items-center mb-3">
          <Link className="btn btn-sm btn-outline-secondary me-3" href="/notification-templates">
            <i className="fas fa-arrow-left"></i> Back
          </Link>
          <h2 className="mb-0">{isNew ? "New Notification Template" : "Edit Notification Template"}</h2>
          <div className="ms-auto d-flex gap-2">
            {!isNew && (
              <button className="btn btn-sm btn-outline-danger" onClick={handleDelete}>
                <i className="fas fa-trash me-1"></i>Delete
              </button>
            )}
            <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : isNew ? "Create Template" : "Save Template"}
            </button>
          </div>
        </div>

        {loading && <p>Loading...</p>}

        {!loading && (
          <div className="card">
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label">Name</label>
                  <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Order placed - customer" />
                </div>

                <div className="col-md-3">
                  <label className="form-label">Trigger Event</label>
                  <select className="form-select" value={triggerEvent} onChange={(e) => setTriggerEvent(e.target.value)}>
                    {TRIGGER_EVENTS.map((ev) => (
                      <option key={ev} value={ev}>{ev}</option>
                    ))}
                  </select>
                </div>

                <div className="col-md-3">
                  <label className="form-label">Channel</label>
                  <select className="form-select" value={channel} onChange={(e) => setChannel(e.target.value)}>
                    {CHANNELS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="col-md-6">
                  <label className="form-label">Send To</label>
                  <select className="form-select" value={sendTo} onChange={(e) => setSendTo(e.target.value)}>
                    {SEND_TO_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="col-md-6">
                  <label className="form-label">Scope</label>
                  <select className="form-select" value={scope} onChange={(e) => setScope(e.target.value)}>
                    {SCOPE_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="col-12">
                  <label className="form-label">Subject</label>
                  <input className="form-control" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject" />
                </div>

                <div className="col-12">
                  <label className="form-label">Body Template</label>
                  <textarea
                    className="form-control"
                    rows={8}
                    value={bodyTemplate}
                    onChange={(e) => setBodyTemplate(e.target.value)}
                    placeholder="Use variables like {{customer_name}}, {{order_id}}, {{tracking_url}}"
                  />
                </div>

                <div className="col-12">
                  <div className="form-check">
                    <input id="isActive" className="form-check-input" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                    <label className="form-check-label" htmlFor="isActive">Active</label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </ProtectedRoute>
  );
}
