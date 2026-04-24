import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

export default function DeliveriesPage() {
  const { jwt } = useAuth();
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jwt) return;
    authApi.get('/rider/deliveries?status=active', {}, jwt)
      .then((res) => setDeliveries(res.data || []))
      .catch((err) => console.error('Failed to load deliveries', err))
      .finally(() => setLoading(false));
  }, [jwt]);

  return (
    <ProtectedRoute>
      <Layout>
        <h2 className="mb-3">Active Deliveries</h2>

        {loading && <p>Loading deliveries...</p>}
        {!loading && deliveries.length === 0 && <div className="alert alert-info">No active deliveries.</div>}

        {!loading && deliveries.length > 0 && (
          <div className="table-responsive">
            <table className="table table-striped">
              <thead className="table-dark">
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((order) => (
                  <tr key={order.id}>
                    <td>{order.order_id || order.documentId}</td>
                    <td>{order.customer_contact?.name || '—'}</td>
                    <td><span className="badge bg-primary">{order.order_status}</span></td>
                    <td>Rs. {Number(order.total || 0).toFixed(0)}</td>
                    <td>
                      <Link className="btn btn-sm btn-outline-primary" href={`/deliveries/${order.documentId}`}>
                        Open
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
