import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import OfferCard from "../components/OfferCard";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function OffersPage() {
  const { jwt } = useAuth();
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jwt) return;
    const load = () => {
      authApi.get('/rider/offers', {}, jwt)
        .then((res) => setOffers(res.data || []))
        .catch((err) => console.error('Failed to load rider offers', err))
        .finally(() => setLoading(false));
    };

    load();
    const i = setInterval(load, 15000);
    return () => clearInterval(i);
  }, [jwt]);

  return (
    <ProtectedRoute>
      <Layout>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h2 className="mb-0">Incoming Offers</h2>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => window.location.reload()}>Refresh</button>
        </div>

        {loading && <p>Loading offers...</p>}
        {!loading && offers.length === 0 && <div className="alert alert-info">No pending offers right now.</div>}
        {!loading && offers.map((offer) => <OfferCard key={offer.id} offer={offer} />)}
      </Layout>
    </ProtectedRoute>
  );
}
