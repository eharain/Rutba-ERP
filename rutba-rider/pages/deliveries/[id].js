import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function DeliveryDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { jwt } = useAuth();
  const [deliveries, setDeliveries] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const load = () => {
    if (!jwt) return;
    Promise.all([
      authApi.get('/rider/deliveries?status=active', {}, jwt),
      id ? authApi.get(`/sale-orders/${id}/messages`, {}, jwt) : Promise.resolve({ data: [] }),
    ])
      .then(([dRes, mRes]) => {
        setDeliveries(dRes.data || []);
        setMessages(mRes.data || []);
      })
      .catch((err) => console.error('Failed to load delivery data', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 10000);
    return () => clearInterval(i);
  }, [jwt, id]);

  const delivery = useMemo(() => (deliveries || []).find((d) => d.documentId === id), [deliveries, id]);

  const updateStatus = async (status) => {
    if (!jwt || !id) return;
    try {
      setActionLoading(true);
      await authApi.post(`/rider/deliveries/${id}/status`, { status }, jwt);
      load();
    } catch (err) {
      alert(err?.response?.data?.error?.message || 'Failed to update status');
    } finally {
      setActionLoading(false);
    }
  };

  const sendMessage = async () => {
    const msg = messageInput.trim();
    if (!msg || !jwt || !id) return;
    try {
      setActionLoading(true);
      await authApi.post(`/sale-orders/${id}/messages`, { message: msg }, jwt);
      setMessageInput('');
      load();
    } catch (err) {
      alert(err?.response?.data?.error?.message || 'Failed to send message');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <Layout>
        <button className="btn btn-sm btn-outline-secondary mb-3" onClick={() => router.push('/deliveries')}>Back</button>

        {loading && <p>Loading delivery...</p>}
        {!loading && !delivery && <div className="alert alert-warning">Delivery not found.</div>}

        {!loading && delivery && (
          <>
            <div className="card mb-3">
              <div className="card-header"><strong>Order #{delivery.order_id}</strong></div>
              <div className="card-body">
                <p className="mb-1"><strong>Status:</strong> {delivery.order_status}</p>
                <p className="mb-1"><strong>Customer:</strong> {delivery.customer_contact?.name || '—'}</p>
                <p className="mb-1"><strong>Phone:</strong> {delivery.customer_contact?.phone_number || '—'}</p>
                <p className="mb-0"><strong>Address:</strong> {delivery.customer_contact?.address || '—'}, {delivery.customer_contact?.city || ''}</p>
              </div>
            </div>

            <div className="d-flex gap-2 mb-3">
              {delivery.order_status === 'AWAITING_PICKUP' && (
                <button className="btn btn-primary" disabled={actionLoading} onClick={() => updateStatus('OUT_FOR_DELIVERY')}>
                  Mark as Picked Up
                </button>
              )}
              {delivery.order_status === 'OUT_FOR_DELIVERY' && (
                <>
                  <button className="btn btn-success" disabled={actionLoading} onClick={() => updateStatus('DELIVERED')}>
                    Mark as Delivered
                  </button>
                  <button className="btn btn-outline-danger" disabled={actionLoading} onClick={() => updateStatus('FAILED_DELIVERY')}>
                    Report Failed
                  </button>
                </>
              )}
            </div>

            <div className="card">
              <div className="card-header"><strong>Messages</strong></div>
              <div className="card-body">
                <div className="mb-3" style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {messages.length === 0 && <p className="text-muted small mb-0">No messages yet.</p>}
                  {messages.map((m) => (
                    <div key={m.documentId || m.id} className="border rounded p-2 mb-2">
                      <div className="small text-muted text-uppercase">{m.sender_type}</div>
                      <div className="small">{m.message}</div>
                      <div className="small text-muted">{new Date(m.sent_at).toLocaleString()}</div>
                    </div>
                  ))}
                </div>

                <div className="input-group">
                  <input
                    className="form-control"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder="Message customer"
                  />
                  <button className="btn btn-primary" disabled={actionLoading || !messageInput.trim()} onClick={sendMessage}>
                    Send
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </Layout>
    </ProtectedRoute>
  );
}
