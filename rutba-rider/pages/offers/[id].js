import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function OfferDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { jwt } = useAuth();
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!jwt) return;
    authApi.get('/rider/offers', {}, jwt)
      .then((res) => setOffers(res.data || []))
      .catch((err) => console.error('Failed to load offers', err))
      .finally(() => setLoading(false));
  }, [jwt]);

  const offer = useMemo(() => (offers || []).find((o) => o.documentId === id), [offers, id]);

  const accept = async () => {
    if (!jwt || !id) return;
    try {
      setActionLoading(true);
      await authApi.post(`/rider/offers/${id}/accept`, {}, jwt);
      router.push('/deliveries');
    } catch (err) {
      alert(err?.response?.data?.error?.message || 'Offer no longer available.');
    } finally {
      setActionLoading(false);
    }
  };

  const reject = async () => {
    if (!jwt || !id) return;
    try {
      setActionLoading(true);
      await authApi.post(`/rider/offers/${id}/reject`, {}, jwt);
      router.push('/offers');
    } catch (err) {
      alert(err?.response?.data?.error?.message || 'Failed to reject offer.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <Layout>
        <button className="btn btn-sm btn-outline-secondary mb-3" onClick={() => router.push('/offers')}>Back</button>
        {loading && <p>Loading offer...</p>}
        {!loading && !offer && <div className="alert alert-warning">Offer not found or expired.</div>}
        {!loading && offer && (
          <div className="card">
            <div className="card-header">
              <strong>Offer for Order #{offer?.order?.order_id || offer?.order?.documentId}</strong>
            </div>
            <div className="card-body">
              <p><strong>Customer:</strong> {offer?.order?.customer_contact?.name || '—'}</p>
              <p><strong>City:</strong> {offer?.order?.customer_contact?.city || '—'}</p>
              <p><strong>Fee:</strong> Rs. {Number(offer?.delivery_fee || 0).toFixed(0)}</p>
              <div className="d-flex gap-2">
                <button className="btn btn-success" disabled={actionLoading} onClick={accept}>Accept</button>
                <button className="btn btn-outline-danger" disabled={actionLoading} onClick={reject}>Reject</button>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </ProtectedRoute>
  );
}
