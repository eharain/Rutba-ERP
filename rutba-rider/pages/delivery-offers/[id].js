import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function DeliveryOfferDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { jwt } = useAuth();

  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const load = () => {
    if (!jwt) return;

    authApi.get('/rider/delivery-offers', {}, jwt)
      .then((res) => setOffers(res.data || []))
      .catch((err) => console.error('Failed to load delivery offers', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 10000);
    return () => clearInterval(i);
  }, [jwt]);

  const offer = useMemo(
    () => (offers || []).find((entry) => entry.documentId === id),
    [offers, id]
  );

  const order = offer?.order || {};
  const customer = order?.customer_contact || {};
  const products = order?.products?.items || [];

  const acceptOffer = async () => {
    if (!jwt || !id) return;
    try {
      setActionLoading(true);
      const res = await authApi.post(`/rider/delivery-offers/${id}/accept`, {}, jwt);
      const assignedOrder = res?.data;
      if (assignedOrder?.documentId) {
        router.push(`/deliveries/${assignedOrder.documentId}`);
        return;
      }
      router.push('/deliveries');
    } catch (err) {
      alert(err?.response?.data?.error?.message || 'Failed to accept offer');
    } finally {
      setActionLoading(false);
    }
  };

  const rejectOffer = async () => {
    if (!jwt || !id) return;
    try {
      setActionLoading(true);
      await authApi.post(`/rider/delivery-offers/${id}/reject`, {}, jwt);
      router.push('/delivery-offers');
    } catch (err) {
      alert(err?.response?.data?.error?.message || 'Failed to reject offer');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <Layout>
        <button className="btn btn-sm btn-outline-secondary mb-3" onClick={() => router.push('/delivery-offers')}>
          Back
        </button>

        {loading && <p>Loading delivery offer...</p>}

        {!loading && !offer && (
          <div className="alert alert-warning">
            Delivery offer not found or it has already expired/been assigned.
          </div>
        )}

        {!loading && offer && (
          <>
            <div className="card mb-3">
              <div className="card-header"><strong>Offer #{offer.documentId || offer.id}</strong></div>
              <div className="card-body">
                <p className="mb-1"><strong>Order:</strong> #{order.order_id || order.documentId || order.id}</p>
                <p className="mb-1"><strong>Customer:</strong> {customer.name || '—'}</p>
                <p className="mb-1"><strong>Phone:</strong> {customer.phone_number || '—'}</p>
                <p className="mb-1"><strong>Address:</strong> {customer.address || '—'}, {customer.city || ''}</p>
                <p className="mb-1"><strong>Delivery Fee:</strong> Rs. {Number(offer.delivery_fee || 0).toFixed(0)}</p>
                <p className="mb-0"><strong>Status:</strong> {offer.status || 'pending'}</p>
              </div>
            </div>

            <div className="card mb-3">
              <div className="card-header"><strong>Order Items</strong></div>
              <div className="card-body">
                {products.length === 0 && <p className="text-muted mb-0">No products listed.</p>}
                {products.length > 0 && (
                  <ul className="mb-0">
                    {products.map((item, index) => (
                      <li key={index}>
                        {(item?.product?.name || item?.name || 'Item')} × {item?.quantity || 1}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="d-flex gap-2">
              <button className="btn btn-success" disabled={actionLoading} onClick={acceptOffer}>
                Accept Offer
              </button>
              <button className="btn btn-outline-danger" disabled={actionLoading} onClick={rejectOffer}>
                Reject Offer
              </button>
            </div>
          </>
        )}
      </Layout>
    </ProtectedRoute>
  );
}
